/**
 * HardwareWalletPanels — UI panels for Ledger, Trezor, Keystone, GridPlus.
 * Rendered inside WalletChooserDialog when the user picks "Hardware Wallet".
 */
import { useState, useRef, useEffect, useCallback } from "react";
import {
  Loader2, Usb, RefreshCw, CheckCircle2, AlertCircle,
  Camera, CameraOff, QrCode, Shield, Keyboard,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useWalletStore } from "@/store/useWalletStore";
import { useToast } from "@/hooks/use-toast";
import {
  isWebHIDSupported,
  openLedgerSession,
  deriveAccounts,
  LEDGER_PATHS,
  ledgerErrMsg,
  type LedgerAccount,
} from "@/lib/ledgerHardware";
import {
  getTrezorAccounts,
  trezorErrMsg,
  type TrezorAccount,
} from "@/lib/trezorHardware";
import {
  URAccumulator,
  decodeURPayload,
  startCameraScanner,
  type KeystoneResult,
} from "@/lib/keystoneHardware";
import {
  gridPlusConnect,
  gridPlusPair,
  gridPlusGetAccounts,
  gridPlusErrMsg,
  clearGridPlusClient,
  type GridPlusAccount,
} from "@/lib/gridplusHardware";

/* ── shared helpers ─────────────────────────────────────────────────────── */

function connectHardwareWallet(address: string) {
  const store = useWalletStore.getState();
  store.connect({ address, provider: "orah-wallet", network: "evm" });
  store.setInternalEvmAddress(address);
}

function shortAddr(addr: string) {
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

function ErrorBox({ message }: { message: string }) {
  return (
    <div className="flex items-start gap-2 rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-[12px] text-destructive">
      <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
      <span>{message}</span>
    </div>
  );
}

interface AccountPickerProps {
  accounts: Array<{ path: string; address: string; label: string }>;
  onPick: (address: string) => void;
  loading?: boolean;
}
function AccountPicker({ accounts, onPick, loading }: AccountPickerProps) {
  const [selected, setSelected] = useState(accounts[0]?.address ?? "");

  return (
    <div className="space-y-2">
      <p className="text-[11px] text-muted-foreground">Select an account to connect:</p>
      <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
        {accounts.map(a => (
          <button
            key={a.path}
            onClick={() => setSelected(a.address)}
            className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg border text-left transition-colors ${
              selected === a.address
                ? "border-primary bg-primary/10"
                : "border-border bg-card hover:bg-accent/50"
            }`}
          >
            <div className={`w-3.5 h-3.5 rounded-full border-2 shrink-0 flex items-center justify-center ${
              selected === a.address ? "border-primary" : "border-border"
            }`}>
              {selected === a.address && <div className="w-1.5 h-1.5 rounded-full bg-primary" />}
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-[11px] font-medium text-foreground truncate">{a.label}</div>
              <div className="text-[10px] text-muted-foreground font-mono">{shortAddr(a.address)}</div>
            </div>
          </button>
        ))}
      </div>
      <Button
        className="w-full h-[42px] gap-2 text-sm mt-1"
        disabled={!selected || loading}
        onClick={() => onPick(selected)}
      >
        {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
        Connect Selected Account
      </Button>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════════════════
   LEDGER PANEL
══════════════════════════════════════════════════════════════════════════ */

export function LedgerPanel({ onDone }: { onDone: () => void }) {
  const { toast } = useToast();
  const [status, setStatus] = useState<"idle" | "connecting" | "accounts" | "error">("idle");
  const [accounts, setAccounts] = useState<LedgerAccount[]>([]);
  const [error, setError] = useState("");
  const sessionRef = useRef<{ transport: any; eth: any } | null>(null);

  const supported = isWebHIDSupported();

  const handleConnect = async () => {
    setStatus("connecting");
    setError("");
    try {
      const session = await openLedgerSession();
      sessionRef.current = session;
      const accs = await deriveAccounts(session.eth, LEDGER_PATHS.slice(0, 5));
      if (accs.length === 0) throw new Error("Ethereum app not open — unlock your Ledger and open the Ethereum app.");
      setAccounts(accs);
      setStatus("accounts");
    } catch (err) {
      setError(ledgerErrMsg(err));
      setStatus("error");
    }
  };

  const handlePick = (address: string) => {
    connectHardwareWallet(address);
    sessionRef.current?.transport?.close().catch(() => {});
    toast({ title: "Ledger connected", description: shortAddr(address) });
    onDone();
  };

  useEffect(() => () => { sessionRef.current?.transport?.close().catch(() => {}); }, []);

  if (!supported) return (
    <div className="space-y-3 mt-1">
      <ErrorBox message="WebHID is not supported in this browser. Use Chrome or Edge on desktop to connect a Ledger." />
      <p className="text-[11px] text-muted-foreground text-center">
        Alternatively, open the <strong>EVM Wallets</strong> option and use Ledger Live (WalletConnect).
      </p>
    </div>
  );

  return (
    <div className="space-y-3 mt-1">
      {status === "idle" && (
        <>
          <div className="rounded-xl border border-border bg-card/60 p-4 space-y-2 text-[12px] text-muted-foreground">
            <p className="font-medium text-foreground text-[13px]">Before connecting:</p>
            <ol className="list-decimal list-inside space-y-1 leading-relaxed">
              <li>Plug in your Ledger via USB</li>
              <li>Enter your PIN to unlock it</li>
              <li>Open the <strong className="text-foreground">Ethereum</strong> app on the device</li>
            </ol>
          </div>
          <Button className="w-full h-[46px] gap-2 text-sm" onClick={handleConnect}>
            <Usb className="w-4 h-4" /> Connect Ledger
          </Button>
        </>
      )}

      {status === "connecting" && (
        <div className="flex flex-col items-center gap-3 py-6">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
          <p className="text-sm text-muted-foreground text-center">
            Select your Ledger in the browser dialog, then approve on the device…
          </p>
        </div>
      )}

      {status === "accounts" && (
        <AccountPicker accounts={accounts} onPick={handlePick} />
      )}

      {status === "error" && (
        <div className="space-y-3">
          <ErrorBox message={error} />
          <Button variant="outline" className="w-full h-[42px] gap-2 text-sm" onClick={handleConnect}>
            <RefreshCw className="w-3.5 h-3.5" /> Try Again
          </Button>
        </div>
      )}
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════════════════
   TREZOR PANEL
══════════════════════════════════════════════════════════════════════════ */

export function TrezorPanel({ onDone }: { onDone: () => void }) {
  const { toast } = useToast();
  const [status, setStatus] = useState<"idle" | "connecting" | "accounts" | "error">("idle");
  const [accounts, setAccounts] = useState<TrezorAccount[]>([]);
  const [error, setError] = useState("");

  const handleConnect = async () => {
    setStatus("connecting");
    setError("");
    try {
      const accs = await getTrezorAccounts();
      setAccounts(accs);
      setStatus("accounts");
    } catch (err) {
      setError(trezorErrMsg(err));
      setStatus("error");
    }
  };

  const handlePick = (address: string) => {
    connectHardwareWallet(address);
    toast({ title: "Trezor connected", description: shortAddr(address) });
    onDone();
  };

  return (
    <div className="space-y-3 mt-1">
      {status === "idle" && (
        <>
          <div className="rounded-xl border border-border bg-card/60 p-4 space-y-2 text-[12px] text-muted-foreground">
            <p className="font-medium text-foreground text-[13px]">Before connecting:</p>
            <ol className="list-decimal list-inside space-y-1 leading-relaxed">
              <li>Plug in your Trezor via USB</li>
              <li>Install <strong className="text-foreground">Trezor Bridge</strong> if prompted</li>
              <li>Unlock the device with your PIN</li>
              <li>Approve the connection in the Trezor popup</li>
            </ol>
          </div>
          <Button className="w-full h-[46px] gap-2 text-sm" onClick={handleConnect}>
            <Usb className="w-4 h-4" /> Connect Trezor
          </Button>
        </>
      )}

      {status === "connecting" && (
        <div className="flex flex-col items-center gap-3 py-6">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
          <p className="text-sm text-muted-foreground text-center">
            A Trezor popup will open — approve the connection there…
          </p>
        </div>
      )}

      {status === "accounts" && (
        <AccountPicker accounts={accounts} onPick={handlePick} />
      )}

      {status === "error" && (
        <div className="space-y-3">
          <ErrorBox message={error} />
          <Button variant="outline" className="w-full h-[42px] gap-2 text-sm" onClick={handleConnect}>
            <RefreshCw className="w-3.5 h-3.5" /> Try Again
          </Button>
        </div>
      )}
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════════════════
   KEYSTONE PANEL  (QR / air-gapped)
══════════════════════════════════════════════════════════════════════════ */

export function KeystonePanel({ onDone }: { onDone: () => void }) {
  const { toast } = useToast();
  const videoRef = useRef<HTMLVideoElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const accumulatorRef = useRef(new URAccumulator());

  const [status, setStatus] = useState<"idle" | "scanning" | "error" | "done">("idle");
  const [error, setError] = useState("");
  const [progress, setProgress] = useState<{ received: number; total: number }>({ received: 0, total: 0 });
  const [cameraAllowed, setCameraAllowed] = useState<boolean | null>(null);

  const stopCamera = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    accumulatorRef.current.reset();
  }, []);

  const handleFrame = useCallback(async (data: string) => {
    const acc = accumulatorRef.current;
    const complete = acc.add(data);
    setProgress(acc.progress());

    if (!complete) return;

    stopCamera();
    setStatus("done");

    try {
      let result: KeystoneResult;
      if (data.toLowerCase().startsWith("ur:")) {
        result = await decodeURPayload(acc.assemble());
      } else {
        result = await decodeURPayload(data);
      }
      connectHardwareWallet(result.address);
      toast({ title: "Keystone connected", description: shortAddr(result.address) });
      onDone();
    } catch (err: any) {
      setError(err?.message ?? "QR decode failed.");
      setStatus("error");
    }
  }, [stopCamera, onDone, toast]);

  const startScanning = async () => {
    if (!videoRef.current) return;
    accumulatorRef.current.reset();
    setProgress({ received: 0, total: 0 });
    setError("");
    setStatus("scanning");

    const abort = new AbortController();
    abortRef.current = abort;

    try {
      await startCameraScanner(videoRef.current, handleFrame, abort.signal);
      setCameraAllowed(true);
    } catch (err: any) {
      setCameraAllowed(false);
      setError(err?.name === "NotAllowedError"
        ? "Camera permission denied. Allow camera access and try again."
        : err?.message ?? "Could not open camera.");
      setStatus("error");
    }
  };

  useEffect(() => () => { stopCamera(); }, [stopCamera]);

  return (
    <div className="space-y-3 mt-1">
      {status === "idle" && (
        <>
          <div className="rounded-xl border border-border bg-card/60 p-4 space-y-2 text-[12px] text-muted-foreground">
            <p className="font-medium text-foreground text-[13px]">On your Keystone device:</p>
            <ol className="list-decimal list-inside space-y-1 leading-relaxed">
              <li>Tap <strong className="text-foreground">···</strong> Menu → <strong className="text-foreground">Connect Software Wallet</strong></li>
              <li>Select <strong className="text-foreground">MetaMask</strong> or <strong className="text-foreground">Generic Wallet</strong></li>
              <li>Device shows an animated QR code</li>
              <li>Tap <em>Scan QR</em> below and point your camera at the device</li>
            </ol>
          </div>
          <Button className="w-full h-[46px] gap-2 text-sm" onClick={startScanning}>
            <Camera className="w-4 h-4" /> Scan QR Code
          </Button>
        </>
      )}

      {status === "scanning" && (
        <div className="space-y-3">
          <div className="relative rounded-xl overflow-hidden bg-black aspect-video">
            <video
              ref={videoRef}
              playsInline
              muted
              className="w-full h-full object-cover"
            />
            {/* scan overlay */}
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
              <div className="w-48 h-48 border-2 border-primary/70 rounded-xl relative">
                <div className="absolute top-0 left-0 w-5 h-5 border-t-2 border-l-2 border-primary rounded-tl" />
                <div className="absolute top-0 right-0 w-5 h-5 border-t-2 border-r-2 border-primary rounded-tr" />
                <div className="absolute bottom-0 left-0 w-5 h-5 border-b-2 border-l-2 border-primary rounded-bl" />
                <div className="absolute bottom-0 right-0 w-5 h-5 border-b-2 border-r-2 border-primary rounded-br" />
              </div>
            </div>
          </div>
          {progress.total > 1 && (
            <div className="flex items-center gap-2 text-[12px] text-muted-foreground">
              <QrCode className="w-3.5 h-3.5 text-primary" />
              <span>Scanning frames… {progress.received}/{progress.total}</span>
              <div className="flex-1 h-1 rounded-full bg-border overflow-hidden">
                <div
                  className="h-full bg-primary rounded-full transition-all"
                  style={{ width: `${Math.round((progress.received / progress.total) * 100)}%` }}
                />
              </div>
            </div>
          )}
          {progress.total === 0 && (
            <p className="text-[11px] text-muted-foreground text-center">Waiting for QR code…</p>
          )}
          <Button variant="outline" size="sm" className="w-full gap-2 text-xs" onClick={() => { stopCamera(); setStatus("idle"); }}>
            <CameraOff className="w-3.5 h-3.5" /> Cancel Scan
          </Button>
        </div>
      )}

      {status === "done" && (
        <div className="flex flex-col items-center gap-3 py-6">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
          <p className="text-sm text-muted-foreground">Decoding wallet…</p>
        </div>
      )}

      {status === "error" && (
        <div className="space-y-3">
          <ErrorBox message={error} />
          <Button variant="outline" className="w-full h-[42px] gap-2 text-sm"
            onClick={() => { setStatus("idle"); setError(""); accumulatorRef.current.reset(); }}>
            <RefreshCw className="w-3.5 h-3.5" /> Try Again
          </Button>
        </div>
      )}
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════════════════
   GRIDPLUS PANEL
══════════════════════════════════════════════════════════════════════════ */

type GridPlusStep = "device-id" | "pairing" | "accounts" | "error";

export function GridPlusPanel({ onDone }: { onDone: () => void }) {
  const { toast } = useToast();
  const [step, setStep] = useState<GridPlusStep>("device-id");
  const [deviceId, setDeviceId] = useState("");
  const [pairingCode, setPairingCode] = useState("");
  const [accounts, setAccounts] = useState<GridPlusAccount[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleConnect = async () => {
    if (!deviceId.trim()) return;
    setLoading(true);
    setError("");
    try {
      const isPaired = await gridPlusConnect(deviceId);
      if (isPaired) {
        const accs = await gridPlusGetAccounts(5);
        setAccounts(accs);
        setStep("accounts");
      } else {
        setStep("pairing");
      }
    } catch (err) {
      setError(gridPlusErrMsg(err));
      setStep("error");
    } finally {
      setLoading(false);
    }
  };

  const handlePair = async () => {
    if (!pairingCode.trim()) return;
    setLoading(true);
    setError("");
    try {
      await gridPlusPair(pairingCode);
      const accs = await gridPlusGetAccounts(5);
      setAccounts(accs);
      setStep("accounts");
    } catch (err) {
      setError(gridPlusErrMsg(err));
      setStep("error");
    } finally {
      setLoading(false);
    }
  };

  const handlePick = (address: string) => {
    connectHardwareWallet(address);
    toast({ title: "GridPlus connected", description: shortAddr(address) });
    onDone();
  };

  const reset = () => {
    clearGridPlusClient();
    setStep("device-id");
    setDeviceId("");
    setPairingCode("");
    setAccounts([]);
    setError("");
  };

  const accountsForPicker = accounts.map((a, i) => ({
    path: `m/44'/60'/0'/0/${a.index}`,
    address: a.address,
    label: `Account ${i + 1}`,
  }));

  return (
    <div className="space-y-3 mt-1">
      {step === "device-id" && (
        <>
          <div className="rounded-xl border border-border bg-card/60 p-4 space-y-1.5 text-[12px] text-muted-foreground">
            <p className="font-medium text-foreground text-[13px]">Find your Device ID:</p>
            <p>On your Lattice1 → <strong className="text-foreground">Settings</strong> → <strong className="text-foreground">Device Info</strong></p>
            <p className="text-[11px]">Example: <code className="bg-muted px-1 rounded text-foreground">a1b2c3d4</code></p>
          </div>
          <div className="flex gap-2">
            <Input
              placeholder="Device ID (e.g. a1b2c3d4)"
              value={deviceId}
              onChange={e => setDeviceId(e.target.value)}
              onKeyDown={e => e.key === "Enter" && handleConnect()}
              className="text-sm font-mono"
              spellCheck={false}
            />
          </div>
          <Button
            className="w-full h-[46px] gap-2 text-sm"
            onClick={handleConnect}
            disabled={!deviceId.trim() || loading}
          >
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Usb className="w-4 h-4" />}
            {loading ? "Connecting…" : "Connect Lattice1"}
          </Button>
        </>
      )}

      {step === "pairing" && (
        <>
          <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 space-y-1.5 text-[12px] text-amber-600 dark:text-amber-400">
            <p className="font-medium text-[13px]">Device pairing required</p>
            <p>Your Lattice1 is now showing a <strong>6-digit pairing code</strong>.</p>
            <p>Enter it below to establish a secure connection.</p>
          </div>
          <div className="flex gap-2">
            <Input
              placeholder="6-digit pairing code"
              value={pairingCode}
              onChange={e => setPairingCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
              onKeyDown={e => e.key === "Enter" && handlePair()}
              className="text-sm font-mono tracking-widest text-center text-lg"
              maxLength={6}
            />
          </div>
          <Button
            className="w-full h-[46px] gap-2 text-sm"
            onClick={handlePair}
            disabled={pairingCode.length !== 6 || loading}
          >
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Keyboard className="w-4 h-4" />}
            {loading ? "Pairing…" : "Submit Pairing Code"}
          </Button>
        </>
      )}

      {step === "accounts" && (
        <AccountPicker accounts={accountsForPicker} onPick={handlePick} />
      )}

      {step === "error" && (
        <div className="space-y-3">
          <ErrorBox message={error} />
          <Button variant="outline" className="w-full h-[42px] gap-2 text-sm" onClick={reset}>
            <RefreshCw className="w-3.5 h-3.5" /> Try Again
          </Button>
        </div>
      )}

      {(step === "device-id" || step === "pairing") && (
        <div className="flex items-start gap-1.5">
          <Shield className="w-3.5 h-3.5 shrink-0 mt-0.5 text-green-500" />
          <p className="text-[11px] text-muted-foreground leading-relaxed">
            Connection is end-to-end encrypted via the GridPlus relay. Your keys never leave the Lattice1.
          </p>
        </div>
      )}
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════════════════
   HARDWARE CHOOSER  (pick which device)
══════════════════════════════════════════════════════════════════════════ */

export type HWDevice = "ledger" | "trezor" | "keystone" | "gridplus";

const HW_OPTIONS: { id: HWDevice; label: string; sub: string; logo: string }[] = [
  { id: "ledger",   label: "Ledger",   sub: "USB · WebHID · Nano S/X/S Plus/Stax",   logo: "🔲" },
  { id: "trezor",   label: "Trezor",   sub: "USB · Trezor One / Model T / Safe",      logo: "🛡" },
  { id: "keystone", label: "Keystone", sub: "Air-gapped · QR code · Keystone 3 Pro",  logo: "🔳" },
  { id: "gridplus", label: "GridPlus", sub: "Wi-Fi · Lattice1 · SafeCards",           logo: "⚡" },
];

export function HardwareChooser({ onPick }: { onPick: (device: HWDevice) => void }) {
  return (
    <div className="space-y-2 py-1">
      {HW_OPTIONS.map(opt => (
        <button
          key={opt.id}
          onClick={() => onPick(opt.id)}
          className="w-full flex items-center gap-3.5 px-4 py-3 rounded-xl border border-border bg-card hover:bg-accent/50 transition-colors text-left"
        >
          <span className="text-xl leading-none w-6 text-center shrink-0">{opt.logo}</span>
          <div className="flex-1 min-w-0">
            <div className="text-sm font-semibold text-foreground">{opt.label}</div>
            <div className="text-[11px] text-muted-foreground mt-0.5">{opt.sub}</div>
          </div>
        </button>
      ))}
    </div>
  );
}
