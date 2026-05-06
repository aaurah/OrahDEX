/**
 * MediaCapture.tsx — Reusable modal for capturing/generating an image.
 *
 * Three sources, OS-aware:
 *   • Camera   — live getUserMedia preview with switch / torch / capture / retake.
 *                Falls back to the native OS camera (input capture="environment")
 *                when getUserMedia is unavailable or denied.
 *   • AI       — prompt → POST /api/social/ai/image (gpt-image-1) → preview.
 *   • Upload   — plain file picker (so this single sheet covers all paths).
 *
 * onSelect receives a data-URL string ready to assign to <img src> or persist.
 */
import React, { useEffect, useRef, useState, useCallback } from "react";
import { createPortal } from "react-dom";
import { Camera, Sparkles, Upload, X, RefreshCw, Zap, ZapOff, RotateCcw, Check, Image as ImageIcon } from "lucide-react";

const API = (import.meta.env.BASE_URL?.replace(/\/$/, "") ?? "") + "/api";

type Tab = "camera" | "ai" | "photos";

/** Resize + re-encode image to ≤ maxDim px on longest side at given JPEG quality.
 *  Keeps the original if it is already small enough. AI URLs (https://…) pass through. */
async function compressImage(dataUrl: string, maxDim = 1200, quality = 0.82): Promise<string> {
  if (!dataUrl.startsWith("data:")) return dataUrl; // already a URL — no-op
  return new Promise(resolve => {
    const img = new Image();
    img.onload = () => {
      const { width: w, height: h } = img;
      const scale = Math.min(1, maxDim / Math.max(w, h, 1));
      const cw = Math.round(w * scale);
      const ch = Math.round(h * scale);
      const canvas = document.createElement("canvas");
      canvas.width = cw; canvas.height = ch;
      canvas.getContext("2d")?.drawImage(img, 0, 0, cw, ch);
      resolve(canvas.toDataURL("image/jpeg", quality));
    };
    img.onerror = () => resolve(dataUrl);
    img.src = dataUrl;
  });
}

// iOS Safari ignores clicks on `<input type=file>` when display:none.
// Use a visually-hidden style that still allows the native picker to open.
const HIDDEN_INPUT: React.CSSProperties = {
  position: "absolute", inset: 0, width: "100%", height: "100%",
  opacity: 0, cursor: "pointer", appearance: "none",
};

function detectOS(): "ios" | "android" | "desktop" {
  if (typeof navigator === "undefined") return "desktop";
  const ua = navigator.userAgent || "";
  if (/iPad|iPhone|iPod/.test(ua)) return "ios";
  if (/Android/i.test(ua)) return "android";
  return "desktop";
}

interface Props {
  open:     boolean;
  onClose:  () => void;
  onSelect: (dataUrl: string) => void;
  /** Limit accept= for the Upload tab. Default: image/* */
  accept?:  string;
  /** Default tab to open. Default: "camera" */
  initialTab?: Tab;
}

export function MediaCapture({ open, onClose, onSelect, accept = "image/*", initialTab = "camera" }: Props) {
  const [tab, setTab] = useState<Tab>(initialTab);
  const [preview, setPreview] = useState<string>("");

  useEffect(() => { if (open) { setTab(initialTab); setPreview(""); } }, [open, initialTab]);

  if (!open) return null;

  function handleConfirm() {
    if (!preview) return;
    onSelect(preview);
    onClose();
  }

  const portalTarget = typeof document !== "undefined"
    ? (document.getElementById("modal-root") ?? document.body)
    : null;
  if (!portalTarget) return null;

  return createPortal(
    <div className="fixed inset-0 flex items-end sm:items-center justify-center"
         style={{ background: "rgba(0,0,0,0.85)", zIndex: 2147483647, pointerEvents: "auto" }} onClick={onClose}>
      <div onClick={e => e.stopPropagation()}
           className="w-full sm:max-w-lg sm:rounded-2xl rounded-t-3xl flex flex-col"
           style={{ background: "var(--color-bg, #0a0a0a)", maxHeight: "92vh", border: "1px solid rgba(255,255,255,0.08)" }}>
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b" style={{ borderColor: "rgba(255,255,255,0.08)" }}>
          <h3 className="font-bold text-base" style={{ color: "var(--color-text, #fff)" }}>Add media</h3>
          <button onClick={onClose} className="p-1.5 rounded-full hover:bg-white/5">
            <X size={18} style={{ color: "var(--color-text, #fff)" }} />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 p-2 border-b" style={{ borderColor: "rgba(255,255,255,0.08)" }}>
          {([
            { id: "camera", label: "Camera", icon: Camera },
            { id: "photos", label: "Photos", icon: ImageIcon },
            { id: "ai",     label: "AI",     icon: Sparkles },
          ] as const).map(({ id, label, icon: Icon }) => {
            const active = tab === id;
            return (
              <button key={id} onClick={() => { setTab(id); setPreview(""); }}
                className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs font-bold transition-all"
                style={{
                  background: active ? "var(--color-accent, #00ff88)" : "transparent",
                  color: active ? "#000" : "var(--color-text-secondary, #aaa)",
                }}>
                <Icon size={14} />{label}
              </button>
            );
          })}
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto">
          {tab === "camera" && (
            <CameraPanel preview={preview} setPreview={setPreview} />
          )}
          {tab === "ai" && (
            <AIPanel preview={preview} setPreview={setPreview} />
          )}
          {tab === "photos" && (
            <UploadPanel preview={preview} setPreview={setPreview} accept={accept} />
          )}
        </div>

        {/* Confirm */}
        {preview && (
          <div className="p-3 border-t" style={{ borderColor: "rgba(255,255,255,0.08)" }}>
            <button onClick={handleConfirm}
              className="w-full py-3 rounded-xl text-sm font-bold flex items-center justify-center gap-2"
              style={{ background: "var(--color-accent, #00ff88)", color: "#000" }}>
              <Check size={16} /> Use this image
            </button>
          </div>
        )}
      </div>
    </div>,
    portalTarget,
  );
}

/* ── Camera panel ─────────────────────────────────────────────────────────── */

function CameraPanel({ preview, setPreview }: { preview: string; setPreview: (s: string) => void }) {
  const videoRef  = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const [facing, setFacing] = useState<"environment" | "user">("environment");
  const [torchOn, setTorchOn] = useState(false);
  const [torchSupported, setTorchSupported] = useState(false);
  const [error, setError] = useState("");
  const [starting, setStarting] = useState(true);
  const [fallback, setFallback] = useState(false);   // OS-native camera fallback
  const os = detectOS();

  const stop = useCallback(() => {
    streamRef.current?.getTracks().forEach(t => t.stop());
    streamRef.current = null;
  }, []);

  const start = useCallback(async (mode: "environment" | "user") => {
    setStarting(true); setError(""); setTorchOn(false);
    stop();
    if (!navigator.mediaDevices?.getUserMedia) {
      setFallback(true); setStarting(false); return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: { facingMode: { ideal: mode }, width: { ideal: 1920 }, height: { ideal: 1920 } },
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play().catch(() => {});
      }
      const track: any = stream.getVideoTracks()[0];
      const caps = track?.getCapabilities?.() ?? {};
      setTorchSupported(!!(caps as any).torch);
    } catch (e: any) {
      // Permission denied or no camera → fall back to OS-native picker
      setFallback(true);
      setError(e?.message ?? "Camera unavailable");
    } finally {
      setStarting(false);
    }
  }, [stop]);

  useEffect(() => { if (!preview) start(facing); return stop; /* eslint-disable-line */ }, [facing, preview]);

  async function toggleTorch() {
    const track: any = streamRef.current?.getVideoTracks()[0];
    if (!track?.applyConstraints) return;
    try {
      await track.applyConstraints({ advanced: [{ torch: !torchOn }] });
      setTorchOn(v => !v);
    } catch { /* ignore */ }
  }

  function capture() {
    const v = videoRef.current; const c = canvasRef.current;
    if (!v || !c) return;
    const w = v.videoWidth || 1024, h = v.videoHeight || 1024;
    c.width = w; c.height = h;
    const ctx = c.getContext("2d");
    if (!ctx) return;
    if (facing === "user") { ctx.translate(w, 0); ctx.scale(-1, 1); }   // un-mirror selfie
    ctx.drawImage(v, 0, 0, w, h);
    const raw = c.toDataURL("image/jpeg", 0.92);
    stop();
    compressImage(raw, 1200, 0.85).then(setPreview);
  }

  function retake() { setPreview(""); start(facing); }

  function onNativeFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]; if (!f) return;
    const r = new FileReader();
    r.onload = ev => {
      const raw = String(ev.target?.result ?? "");
      compressImage(raw, 1200, 0.85).then(setPreview);
    };
    r.readAsDataURL(f);
  }

  if (preview) {
    return (
      <div className="p-3">
        <img src={preview} alt="capture" className="w-full rounded-xl" style={{ maxHeight: "60vh", objectFit: "contain", background: "#000" }} />
        <button onClick={retake}
          className="mt-3 w-full py-2.5 rounded-xl text-xs font-bold flex items-center justify-center gap-2 border"
          style={{ color: "var(--color-text, #fff)", borderColor: "rgba(255,255,255,0.15)" }}>
          <RotateCcw size={14} /> Retake
        </button>
      </div>
    );
  }

  if (fallback) {
    // OS-native camera (iOS opens Camera app, Android opens chooser)
    return (
      <div className="p-6 flex flex-col items-center justify-center gap-3" style={{ minHeight: 280 }}>
        <Camera size={42} style={{ color: "var(--color-accent, #00ff88)" }} />
        <p className="text-xs text-center" style={{ color: "var(--color-text-secondary, #aaa)" }}>
          {error ? `Camera blocked — ${error}` : "Use your device's camera"}
        </p>
        <label className="relative px-5 py-2.5 rounded-xl text-sm font-bold cursor-pointer flex items-center gap-2 overflow-hidden"
               style={{ background: "var(--color-accent, #00ff88)", color: "#000" }}>
          <Camera size={14} /> Open camera
          <input type="file" accept="image/*" capture={facing} style={HIDDEN_INPUT} onChange={onNativeFile} />
        </label>
        <label className="text-[11px] underline cursor-pointer relative" style={{ color: "var(--color-text-secondary, #aaa)" }}>
          Or pick from library
          <input type="file" accept="image/*" style={HIDDEN_INPUT} onChange={onNativeFile} />
        </label>
        <button onClick={() => { setFallback(false); start(facing); }}
          className="mt-1 text-[11px] underline" style={{ color: "var(--color-text-secondary, #aaa)" }}>
          Try in-app camera again
        </button>
      </div>
    );
  }

  return (
    <div className="relative bg-black" style={{ aspectRatio: "1/1" }}>
      <video ref={videoRef} playsInline muted autoPlay
             className="w-full h-full object-cover"
             style={{ transform: facing === "user" ? "scaleX(-1)" : "none" }} />
      <canvas ref={canvasRef} className="hidden" />

      {starting && (
        <div className="absolute inset-0 flex items-center justify-center" style={{ background: "rgba(0,0,0,0.6)" }}>
          <RefreshCw size={20} className="animate-spin text-white/70" />
        </div>
      )}

      {/* Top controls */}
      <div className="absolute top-3 right-3 flex gap-2">
        {torchSupported && (
          <button onClick={toggleTorch}
            className="w-9 h-9 rounded-full flex items-center justify-center"
            style={{ background: "rgba(0,0,0,0.55)", color: "#fff" }}>
            {torchOn ? <Zap size={16} /> : <ZapOff size={16} />}
          </button>
        )}
      </div>

      {/* Bottom controls — shutter ring (iOS-style) on iOS/desktop, FAB on Android */}
      <div className="absolute bottom-4 left-0 right-0 flex items-center justify-around px-6">
        <span className="w-12 h-12" />  {/* spacer */}
        <button onClick={capture} aria-label="Capture"
          className="rounded-full flex items-center justify-center transition-transform active:scale-95"
          style={
            os === "android"
              ? { width: 70, height: 70, background: "var(--color-accent, #00ff88)", boxShadow: "0 4px 20px rgba(0,0,0,0.5)" }
              : { width: 72, height: 72, background: "transparent", border: "4px solid #fff" }
          }>
          {os === "android"
            ? <Camera size={28} color="#000" />
            : <span className="block rounded-full" style={{ width: 56, height: 56, background: "#fff" }} />}
        </button>
        <button onClick={() => setFacing(f => f === "environment" ? "user" : "environment")} aria-label="Flip camera"
          className="w-12 h-12 rounded-full flex items-center justify-center"
          style={{ background: "rgba(0,0,0,0.55)", color: "#fff" }}>
          <RotateCcw size={18} />
        </button>
      </div>

      {/* Always-available "from device" escape hatch */}
      <label className="absolute top-3 left-3 flex items-center gap-1.5 px-2.5 py-1.5 rounded-full text-[11px] font-bold cursor-pointer overflow-hidden"
             style={{ background: "rgba(0,0,0,0.6)", color: "#fff", backdropFilter: "blur(8px)" }}>
        <ImageIcon size={12} /> Photos
        <input type="file" accept="image/*" style={HIDDEN_INPUT} onChange={onNativeFile} />
      </label>
    </div>
  );
}

/* ── AI panel ─────────────────────────────────────────────────────────────── */

function AIPanel({ preview, setPreview }: { preview: string; setPreview: (s: string) => void }) {
  const [prompt, setPrompt]   = useState("");
  const [size, setSize]       = useState<"1024x1024" | "1024x1536" | "1536x1024">("1024x1024");
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState("");

  async function generate() {
    if (!prompt.trim()) { setError("Describe what you want"); return; }
    setLoading(true); setError("");
    try {
      const r = await fetch(`${API}/social/ai/image`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: prompt.trim(), size }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error ?? "Generation failed");
      setPreview(d.image);
    } catch (e: any) {
      setError(e?.message ?? "Generation failed");
    } finally { setLoading(false); }
  }

  const inp: React.CSSProperties = {
    background: "rgba(255,255,255,0.04)", color: "var(--color-text, #fff)",
    border: "1px solid rgba(255,255,255,0.1)", borderRadius: 12,
    padding: "10px 12px", fontSize: 14, width: "100%", outline: "none",
    boxSizing: "border-box",
  };

  return (
    <div className="p-4 space-y-3">
      {preview && (
        <div className="rounded-xl overflow-hidden" style={{ aspectRatio: size === "1024x1536" ? "2/3" : size === "1536x1024" ? "3/2" : "1/1" }}>
          <img src={preview} alt="ai" className="w-full h-full object-cover" />
        </div>
      )}

      <div>
        <label className="text-xs font-semibold block mb-1.5" style={{ color: "var(--color-text-secondary, #aaa)" }}>
          Describe the image
        </label>
        <textarea value={prompt} onChange={e => setPrompt(e.target.value)} rows={4} maxLength={1000}
          placeholder="A neon-lit cyberpunk city at dusk, ultra-detailed, 4k…"
          style={{ ...inp, resize: "none" }} />
        <div className="text-[10px] mt-1 text-right" style={{ color: "var(--color-text-secondary, #aaa)" }}>
          {prompt.length}/1000
        </div>
      </div>

      <div>
        <label className="text-xs font-semibold block mb-1.5" style={{ color: "var(--color-text-secondary, #aaa)" }}>
          Aspect
        </label>
        <div className="grid grid-cols-3 gap-1.5">
          {([
            { id: "1024x1024", label: "Square" },
            { id: "1024x1536", label: "Portrait" },
            { id: "1536x1024", label: "Landscape" },
          ] as const).map(o => {
            const active = size === o.id;
            return (
              <button key={o.id} onClick={() => setSize(o.id)}
                className="py-2 rounded-lg text-[11px] font-bold"
                style={{
                  background: active ? "var(--color-accent, #00ff88)" : "rgba(255,255,255,0.04)",
                  color: active ? "#000" : "var(--color-text-secondary, #aaa)",
                  border: "1px solid rgba(255,255,255,0.1)",
                }}>
                {o.label}
              </button>
            );
          })}
        </div>
      </div>

      {error && <p className="text-xs text-red-400">{error}</p>}

      <button onClick={generate} disabled={loading || !prompt.trim()}
        className="w-full py-3 rounded-xl text-sm font-bold disabled:opacity-50 flex items-center justify-center gap-2"
        style={{ background: "var(--color-accent, #00ff88)", color: "#000" }}>
        {loading
          ? <><RefreshCw size={14} className="animate-spin" /> Generating…</>
          : <><Sparkles size={14} /> {preview ? "Regenerate" : "Generate"}</>}
      </button>
      <p className="text-[10px] text-center" style={{ color: "var(--color-text-secondary, #aaa)" }}>
        Powered by gpt-image-1. Generation takes ~10–20s.
      </p>
    </div>
  );
}

/* ── Upload panel ─────────────────────────────────────────────────────────── */

function UploadPanel({ preview, setPreview, accept }:
  { preview: string; setPreview: (s: string) => void; accept: string }) {
  function handle(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]; if (!f) return;
    const r = new FileReader();
    r.onload = ev => {
      const raw = String(ev.target?.result ?? "");
      compressImage(raw, 1200, 0.85).then(setPreview);
    };
    r.readAsDataURL(f);
  }

  return (
    <div className="p-6 flex flex-col items-center justify-center gap-3" style={{ minHeight: 280 }}>
      {preview
        ? <img src={preview} alt="" className="w-full rounded-xl" style={{ maxHeight: "50vh", objectFit: "contain" }} />
        : <ImageIcon size={42} style={{ color: "var(--color-text-secondary, #aaa)" }} />}
      <p className="text-[11px] text-center" style={{ color: "var(--color-text-secondary, #aaa)" }}>Pick from your photo library.</p>
      <label className="relative px-5 py-2.5 rounded-xl text-sm font-bold cursor-pointer flex items-center gap-2 overflow-hidden"
             style={{ background: "var(--color-accent, #00ff88)", color: "#000" }}>
        <Upload size={14} /> {preview ? "Choose different photo" : "Choose photo"}
        <input type="file" accept={accept} style={HIDDEN_INPUT} onChange={handle} />
      </label>
    </div>
  );
}
