import { useState, useEffect } from "react";
import { Fingerprint, AlertCircle, RefreshCw, Eye, Scan } from "lucide-react";
import { cn } from "@/lib/utils";
import { authenticateBiometric, isBiometricSupported } from "@/hooks/useBiometricAuth";
import { useBiometricStore } from "@/store/useBiometricStore";

type Status = "idle" | "scanning" | "success" | "error";

export function BiometricLockScreen() {
  const [status, setStatus] = useState<Status>("idle");
  const [errorMsg, setErrorMsg] = useState("");
  const { credentialId, unlock } = useBiometricStore();

  const supported = isBiometricSupported();

  const handleUnlock = async () => {
    if (!credentialId || status === "scanning") return;
    setStatus("scanning");
    setErrorMsg("");

    const result = await authenticateBiometric(credentialId);
    if (result.success) {
      setStatus("success");
      setTimeout(unlock, 400);
    } else {
      setStatus("error");
      setErrorMsg(result.error);
    }
  };

  useEffect(() => {
    const t = setTimeout(() => {
      if (credentialId) handleUnlock();
    }, 300);
    return () => clearTimeout(t);
  }, []);

  return (
    <div className="fixed inset-0 z-[9999] bg-background flex flex-col items-center justify-center p-8 select-none">
      {/* Background glow */}
      <div className="absolute inset-0 bg-gradient-to-b from-primary/5 via-transparent to-primary/5 pointer-events-none" />

      {/* Logo */}
      <div className="mb-16 text-center">
        <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-green-500 via-emerald-400 to-green-600 flex items-center justify-center mx-auto mb-4 shadow-lg shadow-green-500/20">
          <span className="text-2xl font-black text-white">O</span>
        </div>
        <h1 className="text-2xl font-bold text-foreground">Orah<span className="text-green-400">DEX</span></h1>
        <p className="text-xs text-green-400/70 mt-1 italic">✦ Trade means DEX</p>
      </div>

      {/* Biometric ring */}
      <button
        onClick={handleUnlock}
        disabled={status === "scanning" || status === "success"}
        className="group relative mb-8 focus:outline-none"
        aria-label="Unlock with biometrics"
      >
        {/* Outer pulse ring */}
        <div className={cn(
          "absolute inset-0 rounded-full transition-all duration-700",
          status === "scanning" ? "bg-primary/20 scale-125 animate-ping" : "",
          status === "success" ? "bg-green-500/20 scale-125" : "",
          status === "error" ? "bg-red-500/10" : "",
        )} />

        {/* Main circle */}
        <div className={cn(
          "relative w-28 h-28 rounded-full border-2 flex flex-col items-center justify-center transition-all duration-300 shadow-lg",
          status === "idle" ? "border-border bg-card group-hover:border-primary/60 group-hover:bg-primary/5 group-hover:scale-105" : "",
          status === "scanning" ? "border-primary bg-primary/10 scale-110" : "",
          status === "success" ? "border-green-500 bg-green-500/10 scale-105" : "",
          status === "error" ? "border-red-500 bg-red-500/10" : "",
        )}>
          {status === "error" ? (
            <AlertCircle className="w-10 h-10 text-red-500" />
          ) : status === "success" ? (
            <Scan className="w-10 h-10 text-green-500" />
          ) : status === "scanning" ? (
            <Fingerprint className="w-10 h-10 text-primary animate-pulse" />
          ) : (
            <Fingerprint className={cn(
              "w-10 h-10 transition-colors",
              "text-muted-foreground group-hover:text-primary"
            )} />
          )}
          {status === "scanning" && (
            <span className="text-[10px] text-primary mt-1 font-medium">Scanning...</span>
          )}
        </div>
      </button>

      {/* Status text */}
      <div className="text-center mb-10 h-12 flex flex-col items-center justify-center">
        {status === "idle" && (
          <>
            <p className="font-semibold text-foreground text-base mb-1">App Locked</p>
            <p className="text-sm text-muted-foreground">
              {supported ? "Tap to unlock with biometrics" : "Biometric unlock unavailable"}
            </p>
          </>
        )}
        {status === "scanning" && (
          <p className="text-sm text-primary font-medium animate-pulse">
            Verifying your identity...
          </p>
        )}
        {status === "success" && (
          <p className="text-sm text-green-500 font-medium">Unlocked!</p>
        )}
        {status === "error" && (
          <>
            <p className="text-sm text-red-400 font-medium mb-1">Authentication failed</p>
            <p className="text-xs text-muted-foreground max-w-xs text-center">{errorMsg}</p>
          </>
        )}
      </div>

      {/* Main CTA */}
      {supported && (
        <button
          onClick={handleUnlock}
          disabled={status === "scanning" || status === "success"}
          className={cn(
            "w-full max-w-xs py-3.5 rounded-2xl font-semibold text-sm transition-all duration-200",
            status === "scanning" || status === "success"
              ? "bg-primary/30 text-primary/50 cursor-not-allowed"
              : "bg-primary text-primary-foreground hover:bg-primary/90 active:scale-95 shadow-lg shadow-primary/20"
          )}
        >
          {status === "scanning" ? (
            <span className="flex items-center justify-center gap-2">
              <RefreshCw className="w-4 h-4 animate-spin" /> Verifying...
            </span>
          ) : status === "success" ? (
            "Unlocked!"
          ) : (
            <span className="flex items-center justify-center gap-2">
              <Fingerprint className="w-4 h-4" />
              Unlock with Biometrics
            </span>
          )}
        </button>
      )}

      {status === "error" && (
        <button
          onClick={() => { setStatus("idle"); setErrorMsg(""); }}
          className="mt-3 text-xs text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1.5"
        >
          <RefreshCw className="w-3.5 h-3.5" /> Try again
        </button>
      )}

      {!supported && (
        <div className="flex items-start gap-2.5 mt-4 p-4 rounded-xl bg-amber-500/10 border border-amber-500/20 max-w-xs text-xs text-amber-300">
          <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
          <span>
            Your browser or device doesn't support biometric authentication via WebAuthn.
            Try Chrome or Safari on a device with a fingerprint/face sensor.
          </span>
        </div>
      )}

      {/* Footer */}
      <div className="absolute bottom-8 flex items-center gap-1.5 text-[11px] text-muted-foreground">
        <Eye className="w-3 h-3" />
        Secured by OrahDEX Biometric Lock
      </div>
    </div>
  );
}
