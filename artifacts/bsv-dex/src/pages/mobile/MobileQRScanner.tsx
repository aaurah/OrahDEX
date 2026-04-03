import { useEffect, useRef, useState, useCallback } from "react";
import { useLocation } from "wouter";
import { ArrowLeft, QrCode, Zap, Link2, Copy, Check, X, RefreshCw } from "lucide-react";
import jsQR from "jsqr";
import { cn } from "@/lib/utils";
import { useWalletStore } from "@/store/useWalletStore";
import { useToast } from "@/hooks/use-toast";

type ScanResult =
  | { type: "address"; chain: string; address: string; label?: string; amount?: string }
  | { type: "wc"; uri: string }
  | { type: "url"; url: string }
  | { type: "text"; raw: string };

function parseQR(raw: string): ScanResult {
  const trimmed = raw.trim();

  // WalletConnect v2 URI
  if (trimmed.startsWith("wc:")) {
    return { type: "wc", uri: trimmed };
  }

  // BSV payment URI  bitcoin:address?amount=0.1&label=merchant
  const bsvMatch = trimmed.match(/^(?:bitcoin(?:sv)?|bsv):([1-9A-HJ-NP-Za-km-z]{26,34}|[a-zA-Z0-9]{20,})(\\?.*)?$/i);
  if (bsvMatch) {
    const params = new URLSearchParams(bsvMatch[2]?.slice(1) ?? "");
    return { type: "address", chain: "BSV", address: bsvMatch[1], label: params.get("label") ?? undefined, amount: params.get("amount") ?? undefined };
  }

  // Ethereum address
  if (/^0x[0-9a-fA-F]{40}$/.test(trimmed)) {
    return { type: "address", chain: "ETH", address: trimmed };
  }

  // Bitcoin address (legacy / segwit)
  if (/^[13][a-zA-Z0-9]{24,33}$/.test(trimmed) || /^bc1[a-zA-Z0-9]{6,87}$/i.test(trimmed)) {
    return { type: "address", chain: "BTC", address: trimmed };
  }

  // Solana address (base58, 32–44 chars)
  if (/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(trimmed)) {
    return { type: "address", chain: "SOL", address: trimmed };
  }

  // URL
  if (/^https?:\/\//i.test(trimmed)) {
    return { type: "url", url: trimmed };
  }

  return { type: "text", raw: trimmed };
}

const CHAIN_COLOR: Record<string, string> = {
  BSV: "text-green-400 bg-green-500/15 border-green-500/30",
  BTC: "text-orange-400 bg-orange-500/15 border-orange-500/30",
  ETH: "text-violet-400 bg-violet-500/15 border-violet-500/30",
  SOL: "text-cyan-400 bg-cyan-500/15 border-cyan-500/30",
};

const CHAIN_ICON: Record<string, string> = { BSV: "⚡", BTC: "₿", ETH: "⬡", SOL: "◎" };

export function MobileQRScanner() {
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const { address } = useWalletStore();

  const videoRef   = useRef<HTMLVideoElement>(null);
  const canvasRef  = useRef<HTMLCanvasElement>(null);
  const streamRef  = useRef<MediaStream | null>(null);
  const rafRef     = useRef<number>(0);

  const [permission, setPermission] = useState<"pending" | "granted" | "denied">("pending");
  const [result, setResult]         = useState<ScanResult | null>(null);
  const [copied, setCopied]         = useState(false);
  const [flash, setFlash]           = useState(false);

  const stopCamera = useCallback(() => {
    cancelAnimationFrame(rafRef.current);
    streamRef.current?.getTracks().forEach(t => t.stop());
    streamRef.current = null;
  }, []);

  const startCamera = useCallback(async () => {
    setPermission("pending");
    setResult(null);
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

  useEffect(() => {
    startCamera();
    return () => stopCamera();
  }, []);

  const copyAddress = async (addr: string) => {
    await navigator.clipboard.writeText(addr);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
    toast({ title: "Copied!", description: addr.slice(0, 12) + "…" });
  };

  const handleDeposit = () => {
    if (result?.type !== "address") return;
    navigate(`/deposit?address=${encodeURIComponent(result.address)}&chain=${result.chain}`);
  };

  const handleWC = () => {
    if (result?.type !== "wc") return;
    toast({ title: "WalletConnect", description: "Connecting via WalletConnect…" });
  };

  const rescan = () => {
    setResult(null);
    startCamera();
  };

  return (
    <div className="fixed inset-0 z-50 bg-black flex flex-col">
      {/* Header */}
      <div className="shrink-0 flex items-center gap-3 px-4 pt-safe py-3"
        style={{ paddingTop: "max(12px, env(safe-area-inset-top, 12px))" }}>
        <button onClick={() => navigate(-1)} className="w-9 h-9 flex items-center justify-center rounded-xl bg-white/10 text-white active:bg-white/20">
          <ArrowLeft size={18} />
        </button>
        <div className="flex-1 text-center">
          <p className="text-white font-bold text-base">QR Scanner</p>
        </div>
        <div className="w-9" />
      </div>

      {/* Camera / result area */}
      <div className="flex-1 flex flex-col items-center justify-center px-4">
        {!result ? (
          <>
            {/* Camera preview */}
            <div className="relative w-full max-w-sm aspect-square rounded-3xl overflow-hidden bg-black border border-white/10">
              {/* Flash overlay */}
              {flash && <div className="absolute inset-0 bg-green-400/30 z-20 pointer-events-none" />}

              <video
                ref={videoRef}
                className="w-full h-full object-cover"
                muted
                playsInline
                autoPlay
              />
              <canvas ref={canvasRef} className="hidden" />

              {permission === "denied" && (
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-black/80 text-center px-6">
                  <QrCode size={40} className="text-white/40" />
                  <p className="text-white font-semibold">Camera access denied</p>
                  <p className="text-white/50 text-sm">Please allow camera access in your browser settings</p>
                  <button
                    onClick={startCamera}
                    className="mt-2 px-5 py-2 rounded-xl bg-green-500 text-black font-bold text-sm active:scale-95 transition-transform"
                  >
                    Try Again
                  </button>
                </div>
              )}

              {permission === "pending" && (
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-black">
                  <div className="w-10 h-10 rounded-full border-2 border-green-400 border-t-transparent animate-spin" />
                  <p className="text-white/60 text-sm">Starting camera…</p>
                </div>
              )}

              {/* Scan frame corners */}
              {permission === "granted" && (
                <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                  <div className="relative w-56 h-56">
                    {[["top-0 left-0","border-t-2 border-l-2 rounded-tl-xl"],
                      ["top-0 right-0","border-t-2 border-r-2 rounded-tr-xl"],
                      ["bottom-0 left-0","border-b-2 border-l-2 rounded-bl-xl"],
                      ["bottom-0 right-0","border-b-2 border-r-2 rounded-br-xl"],
                    ].map(([pos, style]) => (
                      <div key={pos} className={`absolute w-8 h-8 border-green-400 ${pos} ${style}`} />
                    ))}
                    {/* Scan line */}
                    <div className="absolute left-2 right-2 h-[2px] bg-green-400/60 top-1/2 animate-bounce" style={{ animationDuration: "1.5s" }} />
                  </div>
                </div>
              )}
            </div>

            {/* Hint text */}
            <div className="mt-6 text-center">
              <p className="text-white font-semibold text-base flex items-center gap-2 justify-center">
                <QrCode size={18} className="text-green-400" />
                QR Scanner
              </p>
              <p className="text-white/50 text-sm mt-2 max-w-xs leading-relaxed">
                Connect with apps or make payments by scanning QR codes.
              </p>
              <div className="flex items-center justify-center gap-4 mt-4">
                <div className="flex items-center gap-1.5 text-xs text-white/40">
                  <Zap size={12} className="text-green-400" />
                  BSV payments
                </div>
                <div className="flex items-center gap-1.5 text-xs text-white/40">
                  <Link2 size={12} className="text-blue-400" />
                  WalletConnect
                </div>
              </div>
            </div>
          </>
        ) : (
          /* ── Scan result card ── */
          <div className="w-full max-w-sm">
            <div className="bg-[#111] rounded-3xl border border-white/10 overflow-hidden">
              {/* Result header */}
              <div className="px-5 py-4 border-b border-white/8">
                <p className="text-xs font-black uppercase tracking-widest text-green-400 mb-1">Scanned</p>
                <p className="text-white font-bold text-lg">
                  {result.type === "address" ? "Wallet Address" :
                   result.type === "wc"      ? "WalletConnect URI" :
                   result.type === "url"     ? "Website URL" : "Text"}
                </p>
              </div>

              <div className="px-5 py-4 space-y-4">
                {result.type === "address" && (
                  <>
                    {/* Chain badge */}
                    <div className="flex items-center gap-2">
                      <span className={cn("px-2.5 py-1 rounded-lg text-sm font-bold border", CHAIN_COLOR[result.chain] ?? "text-gray-400 bg-white/5 border-white/10")}>
                        {CHAIN_ICON[result.chain] ?? "◎"} {result.chain}
                      </span>
                      {result.label && (
                        <span className="text-sm text-white/50">{result.label}</span>
                      )}
                    </div>

                    {/* Address */}
                    <div className="bg-white/4 rounded-2xl px-4 py-3">
                      <p className="text-[11px] text-white/40 mb-1">Address</p>
                      <p className="text-white text-sm font-mono break-all leading-relaxed">{result.address}</p>
                    </div>

                    {/* Amount if present */}
                    {result.amount && (
                      <div className="bg-green-500/8 border border-green-500/20 rounded-2xl px-4 py-3">
                        <p className="text-[11px] text-green-400/70 mb-0.5">Requested Amount</p>
                        <p className="text-green-400 text-xl font-black">{result.amount} {result.chain}</p>
                      </div>
                    )}

                    {/* Actions */}
                    <div className="flex gap-3">
                      <button
                        onClick={() => copyAddress(result.address)}
                        className="flex-1 flex items-center justify-center gap-2 py-3 rounded-2xl bg-white/8 border border-white/10 text-white text-sm font-semibold active:scale-95 transition-transform"
                      >
                        {copied ? <Check size={15} className="text-green-400" /> : <Copy size={15} />}
                        {copied ? "Copied" : "Copy"}
                      </button>
                      {result.chain === "BSV" && (
                        <button
                          onClick={handleDeposit}
                          className="flex-1 flex items-center justify-center gap-2 py-3 rounded-2xl bg-green-500 text-black text-sm font-bold active:scale-95 transition-transform"
                        >
                          <Zap size={15} />
                          Send BSV
                        </button>
                      )}
                    </div>
                  </>
                )}

                {result.type === "wc" && (
                  <>
                    <div className="bg-blue-500/8 border border-blue-500/20 rounded-2xl px-4 py-3">
                      <p className="text-[11px] text-blue-400/70 mb-1">WalletConnect URI</p>
                      <p className="text-white/60 text-xs font-mono break-all">{result.uri.slice(0, 80)}…</p>
                    </div>
                    <button
                      onClick={handleWC}
                      className="w-full flex items-center justify-center gap-2 py-3.5 rounded-2xl bg-blue-500 text-white text-sm font-bold active:scale-95 transition-transform"
                    >
                      <Link2 size={16} />
                      Connect to App
                    </button>
                  </>
                )}

                {result.type === "url" && (
                  <>
                    <div className="bg-white/5 rounded-2xl px-4 py-3">
                      <p className="text-[11px] text-white/40 mb-1">URL</p>
                      <p className="text-white text-sm break-all">{result.url}</p>
                    </div>
                    <a
                      href={result.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center justify-center gap-2 w-full py-3.5 rounded-2xl bg-white/10 text-white text-sm font-semibold active:scale-95 transition-transform"
                    >
                      Open URL
                    </a>
                  </>
                )}

                {result.type === "text" && (
                  <div className="bg-white/5 rounded-2xl px-4 py-3">
                    <p className="text-[11px] text-white/40 mb-1">Content</p>
                    <p className="text-white text-sm break-all">{result.raw}</p>
                  </div>
                )}
              </div>
            </div>

            {/* Scan again */}
            <button
              onClick={rescan}
              className="w-full mt-4 flex items-center justify-center gap-2 py-3.5 rounded-2xl border border-white/15 text-white/70 text-sm font-semibold active:bg-white/5 transition-colors"
            >
              <RefreshCw size={15} />
              Scan Another
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
