import { useEffect, useRef, useState, useCallback } from "react";
import { useLocation } from "wouter";
import {
  ArrowLeft, QrCode, Zap, Link2, Copy, Check, X,
  RefreshCw, Smartphone, Wifi, WifiOff, User
} from "lucide-react";
import * as jsQRModule from "jsqr";
const jsQR: typeof import("jsqr").default = (jsQRModule as any).default ?? jsQRModule;
import { QRCodeCanvas } from "qrcode.react";
import { cn } from "@/lib/utils";
import { useWalletStore } from "@/store/useWalletStore";
import { useToast } from "@/hooks/use-toast";
import { API_BASE } from "@/lib/api";

/* ── QR data types ────────────────────────────────────────────────────── */
type ScanResult =
  | { type: "orahdex_connect"; token: string; expires: number }
  | { type: "address"; chain: string; address: string; label?: string; amount?: string }
  | { type: "wc"; uri: string }
  | { type: "url"; url: string }
  | { type: "text"; raw: string };

function parseQR(raw: string): ScanResult {
  const t = raw.trim();

  // OrahDEX session connect
  if (t.startsWith("orahdex://connect?")) {
    const params = new URLSearchParams(t.split("?")[1] ?? "");
    const token   = params.get("token") ?? "";
    const expires = Number(params.get("expires") ?? Date.now() + 300_000);
    if (token) return { type: "orahdex_connect", token, expires };
  }

  // WalletConnect v2
  if (t.startsWith("wc:")) return { type: "wc", uri: t };

  // BSV payment URI
  const bsvMatch = t.match(/^(?:bitcoin(?:sv)?|bsv):([1-9A-HJ-NP-Za-km-z]{26,34}|[a-zA-Z0-9]{20,})(\?.*)?$/i);
  if (bsvMatch) {
    const p = new URLSearchParams(bsvMatch[2]?.slice(1) ?? "");
    return { type: "address", chain: "BSV", address: bsvMatch[1], label: p.get("label") ?? undefined, amount: p.get("amount") ?? undefined };
  }

  // Ethereum
  if (/^0x[0-9a-fA-F]{40}$/.test(t)) return { type: "address", chain: "ETH", address: t };

  // Bitcoin (legacy/segwit)
  if (/^[13][a-zA-Z0-9]{24,33}$/.test(t) || /^bc1[a-zA-Z0-9]{6,87}$/i.test(t)) return { type: "address", chain: "BTC", address: t };

  // Solana
  if (/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(t)) return { type: "address", chain: "SOL", address: t };

  // URL
  if (/^https?:\/\//i.test(t)) return { type: "url", url: t };

  return { type: "text", raw: t };
}

const CHAIN_COLOR: Record<string, string> = {
  BSV: "text-green-400 bg-green-500/15 border-green-500/30",
  BTC: "text-orange-400 bg-orange-500/15 border-orange-500/30",
  ETH: "text-violet-400 bg-violet-500/15 border-violet-500/30",
  SOL: "text-cyan-400 bg-cyan-500/15 border-cyan-500/30",
};
const CHAIN_ICON: Record<string, string> = { BSV: "⚡", BTC: "₿", ETH: "⬡", SOL: "◎" };

/* ── Component ─────────────────────────────────────────────────────────── */
export function MobileQRScanner() {
  const [, navigate] = useLocation();
  const { toast }    = useToast();
  const { address, provider: walletType } = useWalletStore();

  /* tabs: "scan" | "myqr" */
  const [tab, setTab] = useState<"scan" | "myqr">("scan");

  /* camera */
  const videoRef  = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const rafRef    = useRef<number>(0);

  const [permission, setPermission] = useState<"pending" | "granted" | "denied">("pending");
  const [result, setResult]         = useState<ScanResult | null>(null);
  const [flash, setFlash]           = useState(false);

  /* connect flow state */
  const [connecting, setConnecting] = useState(false);
  const [connected,  setConnected]  = useState(false);
  const [connError,  setConnError]  = useState<string | null>(null);

  /* copy state for My QR tab */
  const [copied, setCopied] = useState(false);

  /* ── camera helpers ─────────────────────────────────────────────────── */
  const stopCamera = useCallback(() => {
    cancelAnimationFrame(rafRef.current);
    streamRef.current?.getTracks().forEach(t => t.stop());
    streamRef.current = null;
  }, []);

  const scanLoop = useCallback(() => {
    const video  = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas || video.readyState < 2) {
      rafRef.current = requestAnimationFrame(scanLoop);
      return;
    }
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    canvas.width  = video.videoWidth;
    canvas.height = video.videoHeight;
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const code = jsQR(imageData.data, imageData.width, imageData.height, { inversionAttempts: "dontInvert" });
    if (code?.data) {
      const parsed = parseQR(code.data);
      setResult(parsed);
      setFlash(true);
      setTimeout(() => setFlash(false), 300);
      stopCamera();
      return;
    }
    rafRef.current = requestAnimationFrame(scanLoop);
  }, [stopCamera]);

  const startCamera = useCallback(async () => {
    setPermission("pending");
    setResult(null);
    setConnected(false);
    setConnError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "environment", width: { ideal: 1280 }, height: { ideal: 720 } },
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
        setPermission("granted");
        scanLoop();
      }
    } catch {
      setPermission("denied");
    }
  }, [scanLoop]);

  /* start camera when tab = scan */
  useEffect(() => {
    if (tab === "scan") startCamera();
    else stopCamera();
    return () => stopCamera();
  }, [tab]);

  /* ── OrahDEX connect flow ────────────────────────────────────────────── */
  const handleOrahDEXConnect = async (token: string) => {
    if (!address) {
      setConnError("No wallet connected on this device. Connect a wallet first, then scan again.");
      return;
    }
    setConnecting(true);
    setConnError(null);
    try {
      const res = await fetch(`${API_BASE}/connect-session/${token}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ address, chain: "BSV", walletType: walletType ?? "mobile" }),
      });
      if (!res.ok) throw new Error("Session expired or not found");
      setConnected(true);
      toast({ title: "Connected!", description: "Your wallet is now linked to the exchange." });
    } catch (e: unknown) {
      setConnError(e instanceof Error ? e.message : "Connection failed");
    } finally {
      setConnecting(false);
    }
  };

  /* ── copy helpers ────────────────────────────────────────────────────── */
  const copyText = async (text: string, label = "Copied!") => {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
    toast({ title: label, description: text.slice(0, 18) + "…" });
  };

  /* ── address send ────────────────────────────────────────────────────── */
  const handleSend = () => {
    if (result?.type !== "address") return;
    navigate(`/deposit?address=${encodeURIComponent(result.address)}&chain=${result.chain}`);
  };

  const rescan = () => {
    setResult(null);
    setConnected(false);
    setConnError(null);
    startCamera();
  };

  /* ── render ──────────────────────────────────────────────────────────── */
  return (
    <div className="fixed inset-0 z-50 bg-black flex flex-col">

      {/* Header */}
      <div
        className="shrink-0 flex items-center gap-3 px-4 py-3"
        style={{ paddingTop: "max(14px, env(safe-area-inset-top, 14px))" }}
      >
        <button
          onClick={() => window.history.back()}
          className="w-9 h-9 flex items-center justify-center rounded-xl bg-white/10 text-white active:bg-white/20"
        >
          <ArrowLeft size={18} />
        </button>
        <div className="flex-1 text-center">
          <p className="text-white font-bold text-base">Scan to Connect</p>
        </div>
        <div className="w-9" />
      </div>

      {/* Tab bar */}
      <div className="shrink-0 mx-4 mb-4 flex rounded-2xl bg-white/8 p-1 gap-1">
        {(["scan", "myqr"] as const).map(t => (
          <button
            key={t}
            onClick={() => { setTab(t); setResult(null); setConnected(false); setConnError(null); }}
            className={cn(
              "flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-semibold transition-colors",
              tab === t ? "bg-white/15 text-white" : "text-white/40 active:text-white/70"
            )}
          >
            {t === "scan" ? <QrCode size={15} /> : <User size={15} />}
            {t === "scan" ? "Scan QR" : "My QR"}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto flex flex-col items-center px-4 pb-8">

        {/* ── SCAN TAB ─────────────────────────────────────────────────── */}
        {tab === "scan" && !result && (
          <>
            {/* Camera viewfinder */}
            <div className="relative w-full max-w-sm aspect-square rounded-3xl overflow-hidden bg-[#0a0a0a] border border-white/10">
              {flash && <div className="absolute inset-0 bg-green-400/25 z-20 pointer-events-none rounded-3xl" />}

              <video ref={videoRef} className="w-full h-full object-cover" muted playsInline autoPlay />
              <canvas ref={canvasRef} className="hidden" />

              {permission === "denied" && (
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-black/85 text-center px-6">
                  <QrCode size={38} className="text-white/30" />
                  <p className="text-white font-semibold">Camera access denied</p>
                  <p className="text-white/45 text-sm">Allow camera in browser settings, then tap Try Again</p>
                  <button
                    onClick={startCamera}
                    className="mt-1 px-5 py-2.5 rounded-xl bg-green-500 text-black font-bold text-sm active:scale-95 transition-transform"
                  >
                    Try Again
                  </button>
                </div>
              )}

              {permission === "pending" && (
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-black">
                  <div className="w-9 h-9 rounded-full border-2 border-green-400 border-t-transparent animate-spin" />
                  <p className="text-white/50 text-sm">Starting camera…</p>
                </div>
              )}

              {/* Scan frame corners */}
              {permission === "granted" && (
                <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                  <div className="relative w-56 h-56">
                    {([
                      ["top-0 left-0",     "border-t-2 border-l-2 rounded-tl-xl"],
                      ["top-0 right-0",    "border-t-2 border-r-2 rounded-tr-xl"],
                      ["bottom-0 left-0",  "border-b-2 border-l-2 rounded-bl-xl"],
                      ["bottom-0 right-0", "border-b-2 border-r-2 rounded-br-xl"],
                    ] as [string, string][]).map(([pos, style]) => (
                      <div key={pos} className={`absolute w-8 h-8 border-green-400 ${pos} ${style}`} />
                    ))}
                    <div
                      className="absolute left-2 right-2 h-[2px] bg-gradient-to-r from-transparent via-green-400 to-transparent top-1/2"
                      style={{ animation: "scanline 2s ease-in-out infinite" }}
                    />
                  </div>
                </div>
              )}
            </div>

            {/* Primary label: connect exchange */}
            <div className="mt-6 text-center w-full max-w-sm">
              <div className="flex items-center justify-center gap-2 mb-2">
                <Wifi size={16} className="text-green-400" />
                <p className="text-white font-bold text-base">Connect to Exchange</p>
              </div>
              <p className="text-white/45 text-sm leading-relaxed mb-5">
                Point at the QR code displayed on the OrahDEX desktop or web app to link your mobile wallet instantly.
              </p>

              {/* Divider */}
              <div className="flex items-center gap-3 mb-4">
                <div className="flex-1 h-px bg-white/10" />
                <span className="text-white/25 text-xs uppercase tracking-widest">also supports</span>
                <div className="flex-1 h-px bg-white/10" />
              </div>

              {/* Secondary capabilities */}
              <div className="grid grid-cols-3 gap-2">
                {[
                  { icon: <Zap size={14} className="text-green-400" />, label: "BSV Pay" },
                  { icon: <Link2 size={14} className="text-blue-400" />, label: "WalletConnect" },
                  { icon: <QrCode size={14} className="text-purple-400" />, label: "Addresses" },
                ].map(({ icon, label }) => (
                  <div key={label} className="flex flex-col items-center gap-1.5 py-3 rounded-2xl bg-white/5 border border-white/8">
                    {icon}
                    <span className="text-white/40 text-[11px] font-medium">{label}</span>
                  </div>
                ))}
              </div>
            </div>
          </>
        )}

        {/* ── SCAN RESULT ──────────────────────────────────────────────── */}
        {tab === "scan" && result && (
          <div className="w-full max-w-sm">

            {/* OrahDEX Connect result */}
            {result.type === "orahdex_connect" && (
              <div className="bg-[#0d1a0d] rounded-3xl border border-green-500/30 overflow-hidden">
                {/* Icon bar */}
                <div className="flex justify-center pt-7 pb-4">
                  <div className="relative">
                    <div className="w-16 h-16 rounded-2xl bg-green-500/15 border border-green-500/30 flex items-center justify-center">
                      <Smartphone size={28} className="text-green-400" />
                    </div>
                    {connected && (
                      <div className="absolute -bottom-1 -right-1 w-6 h-6 rounded-full bg-green-500 flex items-center justify-center">
                        <Check size={12} className="text-black" strokeWidth={3} />
                      </div>
                    )}
                  </div>
                </div>

                <div className="px-6 pb-6 text-center space-y-2">
                  <p className="text-green-400 font-black text-lg">
                    {connected ? "Wallet Connected!" : "OrahDEX Exchange"}
                  </p>
                  <p className="text-white/55 text-sm leading-relaxed">
                    {connected
                      ? "Your wallet is now linked to the exchange session. You can trade on desktop."
                      : "This QR code will connect your mobile wallet to an OrahDEX exchange session."}
                  </p>

                  {/* Session expiry */}
                  {!connected && (
                    <p className="text-white/30 text-xs">
                      Session valid until {new Date(result.expires).toLocaleTimeString()}
                    </p>
                  )}

                  {/* Wallet being linked */}
                  {address && !connected && (
                    <div className="mt-3 bg-white/5 border border-white/10 rounded-2xl px-4 py-3 text-left">
                      <p className="text-[11px] text-white/35 mb-1">Wallet to connect</p>
                      <p className="text-white text-sm font-mono break-all">{address}</p>
                    </div>
                  )}

                  {/* Error */}
                  {connError && (
                    <div className="mt-3 bg-red-500/10 border border-red-500/25 rounded-2xl px-4 py-3">
                      <p className="text-red-400 text-sm">{connError}</p>
                    </div>
                  )}

                  {/* Action buttons */}
                  <div className="pt-2 space-y-2">
                    {connected ? (
                      <button
                        onClick={() => window.history.back()}
                        className="w-full py-3.5 rounded-2xl bg-green-500 text-black font-bold text-sm active:scale-95 transition-transform"
                      >
                        Done
                      </button>
                    ) : (
                      <>
                        <button
                          onClick={() => handleOrahDEXConnect(result.token)}
                          disabled={connecting}
                          className="w-full flex items-center justify-center gap-2 py-3.5 rounded-2xl bg-green-500 text-black font-bold text-sm active:scale-95 transition-transform disabled:opacity-60"
                        >
                          {connecting ? (
                            <div className="w-4 h-4 rounded-full border-2 border-black/40 border-t-black animate-spin" />
                          ) : (
                            <Wifi size={16} />
                          )}
                          {connecting ? "Connecting…" : "Connect Wallet"}
                        </button>
                        <button
                          onClick={rescan}
                          className="w-full py-3 rounded-2xl border border-white/12 text-white/50 text-sm font-medium active:bg-white/5 transition-colors"
                        >
                          Cancel
                        </button>
                      </>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* Wallet address result */}
            {result.type === "address" && (
              <div className="bg-[#111] rounded-3xl border border-white/10 overflow-hidden">
                <div className="px-5 pt-5 pb-4 border-b border-white/8">
                  <p className="text-xs font-black uppercase tracking-widest text-green-400 mb-1">Wallet Address</p>
                  <div className="flex items-center gap-2 mt-2">
                    <span className={cn("px-2.5 py-1 rounded-lg text-sm font-bold border", CHAIN_COLOR[result.chain] ?? "text-gray-400 bg-white/5 border-white/10")}>
                      {CHAIN_ICON[result.chain] ?? "◎"} {result.chain}
                    </span>
                    {result.label && <span className="text-sm text-white/50">{result.label}</span>}
                  </div>
                </div>
                <div className="px-5 py-4 space-y-3">
                  <div className="bg-white/4 rounded-2xl px-4 py-3">
                    <p className="text-[11px] text-white/35 mb-1">Address</p>
                    <p className="text-white text-sm font-mono break-all leading-relaxed">{result.address}</p>
                  </div>
                  {result.amount && (
                    <div className="bg-green-500/8 border border-green-500/20 rounded-2xl px-4 py-3">
                      <p className="text-[11px] text-green-400/60 mb-0.5">Requested Amount</p>
                      <p className="text-green-400 text-xl font-black">{result.amount} {result.chain}</p>
                    </div>
                  )}
                  <div className="flex gap-3">
                    <button
                      onClick={() => copyText(result.address)}
                      className="flex-1 flex items-center justify-center gap-2 py-3 rounded-2xl bg-white/8 border border-white/10 text-white text-sm font-semibold active:scale-95 transition-transform"
                    >
                      {copied ? <Check size={14} className="text-green-400" /> : <Copy size={14} />}
                      {copied ? "Copied" : "Copy"}
                    </button>
                    {result.chain === "BSV" && (
                      <button
                        onClick={handleSend}
                        className="flex-1 flex items-center justify-center gap-2 py-3 rounded-2xl bg-green-500 text-black text-sm font-bold active:scale-95 transition-transform"
                      >
                        <Zap size={14} /> Send BSV
                      </button>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* WalletConnect result */}
            {result.type === "wc" && (
              <div className="bg-[#111] rounded-3xl border border-blue-500/20 overflow-hidden">
                <div className="px-5 py-5 space-y-4">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-blue-500/15 flex items-center justify-center">
                      <Link2 size={18} className="text-blue-400" />
                    </div>
                    <div>
                      <p className="text-white font-bold">WalletConnect</p>
                      <p className="text-white/40 text-sm">Pairing request</p>
                    </div>
                  </div>
                  <div className="bg-white/5 rounded-2xl px-4 py-3">
                    <p className="text-[11px] text-white/35 mb-1">URI</p>
                    <p className="text-white/55 text-xs font-mono break-all">{result.uri.slice(0, 60)}…</p>
                  </div>
                  <button
                    onClick={() => navigate(`/wallet?tab=dapps&uri=${encodeURIComponent(result.uri)}`)}
                    className="w-full flex items-center justify-center gap-2 py-3.5 rounded-2xl bg-blue-500 text-white text-sm font-bold active:scale-95 transition-transform"
                  >
                    <Link2 size={16} /> Connect to App
                  </button>
                </div>
              </div>
            )}

            {/* URL result */}
            {result.type === "url" && (
              <div className="bg-[#111] rounded-3xl border border-white/10 overflow-hidden px-5 py-5 space-y-4">
                <div className="bg-white/5 rounded-2xl px-4 py-3">
                  <p className="text-[11px] text-white/35 mb-1">URL</p>
                  <p className="text-white text-sm break-all">{result.url}</p>
                </div>
                <a
                  href={result.url} target="_blank" rel="noopener noreferrer"
                  className="flex items-center justify-center gap-2 w-full py-3.5 rounded-2xl bg-white/10 text-white text-sm font-semibold"
                >
                  Open URL
                </a>
              </div>
            )}

            {/* Text result */}
            {result.type === "text" && (
              <div className="bg-[#111] rounded-3xl border border-white/10 px-5 py-5">
                <p className="text-[11px] text-white/35 mb-2">Content</p>
                <p className="text-white text-sm break-all">{result.raw}</p>
              </div>
            )}

            {/* Scan again button */}
            {result.type !== "orahdex_connect" && (
              <button
                onClick={rescan}
                className="w-full mt-4 flex items-center justify-center gap-2 py-3.5 rounded-2xl border border-white/12 text-white/55 text-sm font-semibold active:bg-white/5 transition-colors"
              >
                <RefreshCw size={14} /> Scan Another
              </button>
            )}
          </div>
        )}

        {/* ── MY QR TAB ────────────────────────────────────────────────── */}
        {tab === "myqr" && (
          <div className="w-full max-w-sm space-y-4">
            {address ? (
              <>
                {/* QR card */}
                <div className="bg-white rounded-3xl p-6 flex flex-col items-center gap-4" style={{ colorScheme: "light" }}>
                  <QRCodeCanvas
                    value={address}
                    size={220}
                    bgColor="#ffffff"
                    fgColor="#000000"
                    level="M"
                    marginSize={0}
                  />
                </div>

                {/* Info card */}
                <div className="bg-[#111] rounded-3xl border border-white/10 px-5 py-4 space-y-3">
                  <div className="flex items-center gap-2 mb-1">
                    <Wifi size={14} className="text-green-400" />
                    <p className="text-white font-bold text-sm">Your Wallet QR</p>
                  </div>
                  <p className="text-white/40 text-xs leading-relaxed">
                    Show this QR code to OrahDEX desktop or another device to share your wallet address instantly.
                  </p>

                  <div className="bg-white/5 rounded-2xl px-4 py-3">
                    <p className="text-[11px] text-white/35 mb-1">Address</p>
                    <p className="text-white text-xs font-mono break-all">{address}</p>
                  </div>

                  <button
                    onClick={() => copyText(address, "Address copied!")}
                    className="w-full flex items-center justify-center gap-2 py-3 rounded-2xl bg-white/8 border border-white/10 text-white text-sm font-semibold active:scale-95 transition-transform"
                  >
                    {copied ? <Check size={14} className="text-green-400" /> : <Copy size={14} />}
                    {copied ? "Copied!" : "Copy Address"}
                  </button>
                </div>
              </>
            ) : (
              /* No wallet connected */
              <div className="mt-8 flex flex-col items-center gap-5 text-center px-4">
                <div className="w-20 h-20 rounded-3xl bg-white/5 border border-white/10 flex items-center justify-center">
                  <WifiOff size={32} className="text-white/20" />
                </div>
                <div>
                  <p className="text-white font-bold text-lg mb-2">No wallet connected</p>
                  <p className="text-white/40 text-sm leading-relaxed">
                    Connect a BSV, EVM, or TRON wallet to generate your personal QR code for quick sharing.
                  </p>
                </div>
                <button
                  onClick={() => navigate("/portfolio")}
                  className="px-6 py-3.5 rounded-2xl bg-green-500 text-black font-bold text-sm active:scale-95 transition-transform"
                >
                  Connect Wallet
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Scanline animation */}
      <style>{`
        @keyframes scanline {
          0%   { transform: translateY(-112px); opacity: 0.3; }
          50%  { opacity: 1; }
          100% { transform: translateY(112px);  opacity: 0.3; }
        }
      `}</style>
    </div>
  );
}
