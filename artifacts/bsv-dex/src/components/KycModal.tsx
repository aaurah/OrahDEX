import { useState, useRef, useEffect, useCallback } from "react";
import {
  X, ShieldCheck, User, CreditCard, Loader2,
  AlertTriangle, CheckCircle2, ChevronDown, Globe, Calendar,
  Camera, RotateCcw, ArrowRight, ArrowLeft, ScanFace,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { API_BASE } from "@/lib/api";

const COUNTRIES = [
  "Afghanistan","Albania","Algeria","Andorra","Angola","Argentina","Armenia","Australia",
  "Austria","Azerbaijan","Bahamas","Bahrain","Bangladesh","Belarus","Belgium","Belize",
  "Benin","Bhutan","Bolivia","Bosnia and Herzegovina","Botswana","Brazil","Brunei",
  "Bulgaria","Burkina Faso","Burundi","Cambodia","Cameroon","Canada","Cape Verde",
  "Central African Republic","Chad","Chile","China","Colombia","Comoros","Congo",
  "Costa Rica","Croatia","Cuba","Cyprus","Czech Republic","Denmark","Djibouti","Dominican Republic",
  "Ecuador","Egypt","El Salvador","Estonia","Ethiopia","Fiji","Finland","France",
  "Gabon","Gambia","Georgia","Germany","Ghana","Greece","Guatemala","Guinea","Haiti",
  "Honduras","Hungary","Iceland","India","Indonesia","Iran","Iraq","Ireland","Israel",
  "Italy","Jamaica","Japan","Jordan","Kazakhstan","Kenya","Kuwait","Kyrgyzstan","Laos",
  "Latvia","Lebanon","Lesotho","Liberia","Libya","Liechtenstein","Lithuania","Luxembourg",
  "Madagascar","Malawi","Malaysia","Maldives","Mali","Malta","Mauritania","Mauritius",
  "Mexico","Moldova","Monaco","Mongolia","Montenegro","Morocco","Mozambique","Myanmar",
  "Namibia","Nepal","Netherlands","New Zealand","Nicaragua","Niger","Nigeria","North Korea",
  "North Macedonia","Norway","Oman","Pakistan","Panama","Papua New Guinea","Paraguay","Peru",
  "Philippines","Poland","Portugal","Qatar","Romania","Russia","Rwanda","Saudi Arabia",
  "Senegal","Serbia","Sierra Leone","Singapore","Slovakia","Slovenia","Somalia",
  "South Africa","South Korea","South Sudan","Spain","Sri Lanka","Sudan","Sweden",
  "Switzerland","Syria","Taiwan","Tajikistan","Tanzania","Thailand","Togo","Trinidad and Tobago",
  "Tunisia","Turkey","Turkmenistan","Uganda","Ukraine","United Arab Emirates",
  "United Kingdom","United States","Uruguay","Uzbekistan","Venezuela","Vietnam",
  "Yemen","Zambia","Zimbabwe",
];

const ID_TYPES = [
  { value: "passport",        label: "Passport" },
  { value: "drivers_license", label: "Driver's License" },
  { value: "national_id",     label: "National ID Card" },
  { value: "residence_permit",label: "Residence Permit" },
];

type Step = "info" | "id" | "selfie" | "success";

interface Props {
  open: boolean;
  walletAddress: string;
  onClose: () => void;
  onVerified: () => void;
}

/* ── Country dropdown (reused twice) ─────────────────────────────────────── */
function CountrySelect({
  value, onChange, label,
}: { value: string; onChange: (v: string) => void; label: string }) {
  const [open, setOpen]     = useState(false);
  const [filter, setFilter] = useState("");
  const filtered = COUNTRIES.filter(c => c.toLowerCase().includes(filter.toLowerCase()));
  return (
    <div className="space-y-1 relative">
      <label className="text-[11px] text-muted-foreground font-medium flex items-center gap-1">
        <Globe className="w-3 h-3" /> {label}
      </label>
      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        className={cn(
          "w-full flex items-center justify-between px-3 py-2.5 rounded-xl border bg-secondary/40 text-sm transition text-left",
          value ? "border-border text-foreground" : "border-border text-muted-foreground/50"
        )}
      >
        {value || `Select ${label.toLowerCase()}`}
        <ChevronDown className={cn("w-4 h-4 text-muted-foreground transition-transform", open && "rotate-180")} />
      </button>
      {open && (
        <div className="absolute z-30 top-full left-0 right-0 mt-1 bg-card border border-border rounded-xl shadow-2xl overflow-hidden">
          <div className="p-2 border-b border-border">
            <input autoFocus type="text" value={filter} onChange={e => setFilter(e.target.value)}
              placeholder="Search…"
              className="w-full px-3 py-1.5 rounded-lg bg-secondary/60 text-sm outline-none placeholder:text-muted-foreground/50"
            />
          </div>
          <div className="max-h-44 overflow-y-auto">
            {filtered.map(c => (
              <button key={c} type="button"
                onClick={() => { onChange(c); setOpen(false); setFilter(""); }}
                className={cn("w-full text-left px-4 py-2 text-sm hover:bg-muted/50 transition", value === c && "bg-primary/10 font-semibold")}
              >{c}</button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/* ── Step indicator ──────────────────────────────────────────────────────── */
const STEPS: { key: Step; label: string }[] = [
  { key: "info",    label: "Personal" },
  { key: "id",      label: "Document" },
  { key: "selfie",  label: "Selfie" },
  { key: "success", label: "Done" },
];

function StepBar({ current }: { current: Step }) {
  const idx = STEPS.findIndex(s => s.key === current);
  return (
    <div className="flex items-center gap-0 px-5 py-3 border-b border-border bg-muted/20 shrink-0">
      {STEPS.map((s, i) => (
        <div key={s.key} className="flex items-center flex-1 last:flex-none">
          <div className="flex flex-col items-center">
            <div className={cn(
              "w-6 h-6 rounded-full border-2 flex items-center justify-center text-[10px] font-bold transition-all",
              i < idx  ? "bg-emerald-500 border-emerald-500 text-white"
              : i === idx ? "bg-primary border-primary text-white"
              : "border-border text-muted-foreground/40"
            )}>
              {i < idx ? "✓" : i + 1}
            </div>
            <span className={cn("text-[9px] mt-0.5 font-medium",
              i <= idx ? "text-foreground" : "text-muted-foreground/40")}>{s.label}</span>
          </div>
          {i < STEPS.length - 1 && (
            <div className={cn("h-px flex-1 mx-1 mb-3 transition-colors",
              i < idx ? "bg-emerald-500/60" : "bg-border/50")} />
          )}
        </div>
      ))}
    </div>
  );
}

/* ── Selfie step ─────────────────────────────────────────────────────────── */
function SelfieCapture({
  onCapture,
}: { onCapture: (dataUrl: string) => void }) {
  const videoRef  = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const [phase,    setPhase]    = useState<"idle" | "loading" | "live" | "preview" | "error">("idle");
  const [preview,  setPreview]  = useState<string | null>(null);
  const [camErr,   setCamErr]   = useState<string | null>(null);
  const [countdown, setCountdown] = useState<number | null>(null);

  const stopStream = useCallback(() => {
    streamRef.current?.getTracks().forEach(t => t.stop());
    streamRef.current = null;
  }, []);

  useEffect(() => () => stopStream(), [stopStream]);

  async function startCamera() {
    setPhase("loading");
    setCamErr(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "user", width: { ideal: 640 }, height: { ideal: 480 } },
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
      setPhase("live");
    } catch (e: any) {
      setCamErr(
        e?.name === "NotAllowedError"
          ? "Camera access was denied. Please allow camera permission and try again."
          : "Unable to access camera. Make sure no other app is using it."
      );
      setPhase("error");
    }
  }

  function startCountdown() {
    let n = 3;
    setCountdown(n);
    const interval = setInterval(() => {
      n -= 1;
      if (n === 0) {
        clearInterval(interval);
        setCountdown(null);
        captureFrame();
      } else {
        setCountdown(n);
      }
    }, 1000);
  }

  function captureFrame() {
    const video  = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas) return;
    canvas.width  = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.save();
    ctx.translate(canvas.width, 0);
    ctx.scale(-1, 1);
    ctx.drawImage(video, 0, 0);
    ctx.restore();
    const dataUrl = canvas.toDataURL("image/jpeg", 0.85);
    setPreview(dataUrl);
    setPhase("preview");
    stopStream();
  }

  function retake() {
    setPreview(null);
    setPhase("idle");
  }

  function confirmSelfie() {
    if (preview) onCapture(preview);
  }

  return (
    <div className="space-y-4">
      {/* Info banner */}
      <div className="flex gap-3 p-3 rounded-xl bg-violet-500/8 border border-violet-500/20 text-xs text-violet-300">
        <ScanFace className="w-4 h-4 shrink-0 mt-0.5 text-violet-400" />
        <p>Take a clear selfie with your face centred. Ensure good lighting and remove glasses if possible.</p>
      </div>

      {/* Camera area */}
      <div className="relative rounded-2xl overflow-hidden bg-black aspect-[4/3] w-full flex items-center justify-center">

        {/* Video feed */}
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted
          className={cn("absolute inset-0 w-full h-full object-cover scale-x-[-1]",
            phase === "live" ? "opacity-100" : "opacity-0")}
        />

        {/* Preview image */}
        {phase === "preview" && preview && (
          <img src={preview} alt="selfie" className="absolute inset-0 w-full h-full object-cover" />
        )}

        {/* Oval face guide — shown when live */}
        {phase === "live" && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <svg viewBox="0 0 320 240" className="absolute inset-0 w-full h-full">
              <defs>
                <mask id="facemask">
                  <rect width="320" height="240" fill="white" />
                  <ellipse cx="160" cy="115" rx="75" ry="92" fill="black" />
                </mask>
              </defs>
              <rect width="320" height="240" fill="rgba(0,0,0,0.45)" mask="url(#facemask)" />
              <ellipse cx="160" cy="115" rx="75" ry="92" fill="none" stroke="white" strokeWidth="2" strokeDasharray="6 4" opacity="0.8" />
            </svg>
            {countdown !== null && (
              <span className="relative z-10 text-7xl font-black text-white drop-shadow-lg select-none">
                {countdown}
              </span>
            )}
          </div>
        )}

        {/* Preview overlay */}
        {phase === "preview" && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <svg viewBox="0 0 320 240" className="absolute inset-0 w-full h-full">
              <ellipse cx="160" cy="115" rx="75" ry="92" fill="none" stroke="#22c55e" strokeWidth="2.5" />
            </svg>
            <div className="absolute bottom-3 left-1/2 -translate-x-1/2 flex items-center gap-1.5 bg-emerald-500/90 text-white text-xs font-bold px-3 py-1.5 rounded-full">
              <CheckCircle2 className="w-3.5 h-3.5" /> Photo captured
            </div>
          </div>
        )}

        {/* Idle state */}
        {phase === "idle" && (
          <div className="flex flex-col items-center gap-3 text-center px-6">
            <div className="w-16 h-16 rounded-full bg-violet-500/15 border border-violet-500/30 flex items-center justify-center">
              <Camera className="w-8 h-8 text-violet-400" />
            </div>
            <p className="text-sm text-muted-foreground">Your camera will open to take a live selfie</p>
            <button
              onClick={startCamera}
              className="px-5 py-2.5 rounded-xl bg-violet-600 text-white text-sm font-bold hover:bg-violet-500 transition flex items-center gap-2"
            >
              <Camera className="w-4 h-4" /> Open Camera
            </button>
          </div>
        )}

        {/* Loading */}
        {phase === "loading" && (
          <div className="flex flex-col items-center gap-2 text-muted-foreground">
            <Loader2 className="w-8 h-8 animate-spin text-violet-400" />
            <span className="text-sm">Starting camera…</span>
          </div>
        )}

        {/* Error */}
        {phase === "error" && (
          <div className="flex flex-col items-center gap-3 px-6 text-center">
            <AlertTriangle className="w-8 h-8 text-amber-400" />
            <p className="text-sm text-muted-foreground">{camErr}</p>
            <button onClick={startCamera}
              className="px-4 py-2 rounded-xl border border-border text-sm hover:bg-muted/40 transition">
              Try Again
            </button>
          </div>
        )}
      </div>

      {/* Hidden canvas for capture */}
      <canvas ref={canvasRef} className="hidden" />

      {/* Action buttons */}
      {phase === "live" && countdown === null && (
        <button
          onClick={startCountdown}
          className="w-full py-3.5 rounded-xl font-bold text-sm bg-gradient-to-r from-violet-600 to-violet-500 text-white hover:opacity-90 transition flex items-center justify-center gap-2"
        >
          <Camera className="w-4 h-4" /> Take Selfie (3s countdown)
        </button>
      )}

      {phase === "preview" && (
        <div className="flex gap-3">
          <button
            onClick={retake}
            className="flex-1 py-3 rounded-xl border border-border text-sm font-bold hover:bg-muted/40 transition flex items-center justify-center gap-2"
          >
            <RotateCcw className="w-4 h-4" /> Retake
          </button>
          <button
            onClick={confirmSelfie}
            className="flex-1 py-3 rounded-xl bg-gradient-to-r from-emerald-600 to-emerald-500 text-white text-sm font-bold hover:opacity-90 transition flex items-center justify-center gap-2"
          >
            <CheckCircle2 className="w-4 h-4" /> Use This Photo
          </button>
        </div>
      )}
    </div>
  );
}

/* ── Resolve an effective wallet address, falling back to a session ID ────── */
const SESSION_ADDR_KEY = "orahdex_session_addr";
function resolveKycAddress(walletAddress: string): string {
  if (walletAddress && walletAddress.trim().length >= 10) return walletAddress.trim();
  const existing = sessionStorage.getItem(SESSION_ADDR_KEY);
  if (existing) return existing;
  const sessionId = "session_" + crypto.randomUUID().replace(/-/g, "");
  sessionStorage.setItem(SESSION_ADDR_KEY, sessionId);
  return sessionId;
}

/* ── Main modal ──────────────────────────────────────────────────────────── */
export function KycModal({ open, walletAddress, onClose, onVerified }: Props) {
  const effectiveAddr = resolveKycAddress(walletAddress);
  const [step,        setStep]        = useState<Step>("info");
  const [firstName,   setFirstName]   = useState("");
  const [lastName,    setLastName]    = useState("");
  const [dob,         setDob]         = useState("");
  const [nationality, setNationality] = useState("");
  const [country,     setCountry]     = useState("");
  const [idType,      setIdType]      = useState("");
  const [idNumber,    setIdNumber]    = useState("");
  const [selfieData,  setSelfieData]  = useState<string | null>(null);
  const [submitting,  setSubmitting]  = useState(false);
  const [error,       setError]       = useState<string | null>(null);

  if (!open) return null;

  /* ── Validate step 1 (info) ── */
  function validateInfo() {
    if (!firstName.trim() || !lastName.trim()) { setError("Please enter your full name."); return false; }
    if (!dob) { setError("Please enter your date of birth."); return false; }
    const age = (Date.now() - new Date(dob).getTime()) / (1000 * 60 * 60 * 24 * 365.25);
    if (age < 18) { setError("You must be 18 or older to purchase crypto."); return false; }
    if (!nationality) { setError("Please select your nationality."); return false; }
    if (!country)     { setError("Please select your country of residence."); return false; }
    return true;
  }

  /* ── Validate step 2 (id) ── */
  function validateId() {
    if (!idType)              { setError("Please select a document type."); return false; }
    if (idNumber.trim().length < 5) { setError("Please enter a valid ID number (min 5 characters)."); return false; }
    return true;
  }

  function goNext() {
    setError(null);
    if (step === "info" && validateInfo()) setStep("id");
    if (step === "id"   && validateId())   setStep("selfie");
  }

  function goBack() {
    setError(null);
    if (step === "id")     setStep("info");
    if (step === "selfie") setStep("id");
  }

  async function handleSelfieCapture(dataUrl: string) {
    setSelfieData(dataUrl);
    setError(null);
    setSubmitting(true);
    try {
      const r = await fetch(`${API_BASE}/kyc/submit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          walletAddress: effectiveAddr,
          firstName:          firstName.trim(),
          lastName:           lastName.trim(),
          dateOfBirth:        dob,
          nationality,
          countryOfResidence: country,
          idType,
          idNumber:           idNumber.trim(),
          selfieData:         dataUrl,
        }),
      });
      const data = await r.json();
      if (!r.ok) { setError(data.error ?? "Submission failed"); return; }
      setStep("success");
    } catch {
      setError("Network error — please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[210] flex items-end sm:items-center justify-center">
      <div
        className="absolute inset-0 bg-black/75 backdrop-blur-sm"
        onClick={step === "success" ? onClose : undefined}
      />
      <div className="relative w-full sm:w-[500px] bg-card border border-border rounded-t-2xl sm:rounded-2xl shadow-2xl overflow-hidden max-h-[95vh] flex flex-col">

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-border shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-blue-500/15 border border-blue-500/30 flex items-center justify-center">
              <ShieldCheck className="w-4 h-4 text-blue-400" />
            </div>
            <div>
              <h2 className="text-base font-bold">Identity Verification</h2>
              <p className="text-[11px] text-muted-foreground">Required before your first purchase</p>
            </div>
          </div>
          {step === "success" && (
            <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-white/10 transition-colors">
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        {/* Step bar */}
        {step !== "success" && <StepBar current={step} />}

        <div className="overflow-y-auto flex-1 p-5">

          {/* ─── STEP 1: PERSONAL INFO ─── */}
          {step === "info" && (
            <div className="space-y-5">
              <div className="flex gap-3 p-3 rounded-xl bg-blue-500/8 border border-blue-500/20 text-xs text-blue-300">
                <ShieldCheck className="w-4 h-4 shrink-0 mt-0.5 text-blue-400" />
                <p>OrahDEX is required by law to verify user identity before any crypto purchase. Your data is encrypted and never shared.</p>
              </div>

              <div>
                <div className="flex items-center gap-2 mb-3">
                  <User className="w-3.5 h-3.5 text-muted-foreground" />
                  <span className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider">Personal Information</span>
                </div>
                <div className="space-y-3">
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <label className="text-[11px] text-muted-foreground font-medium">First Name</label>
                      <input type="text" value={firstName} onChange={e => setFirstName(e.target.value)}
                        placeholder="John"
                        className="w-full px-3 py-2.5 rounded-xl border border-border bg-secondary/40 text-sm outline-none focus:border-primary/50 transition placeholder:text-muted-foreground/40"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-[11px] text-muted-foreground font-medium">Last Name</label>
                      <input type="text" value={lastName} onChange={e => setLastName(e.target.value)}
                        placeholder="Doe"
                        className="w-full px-3 py-2.5 rounded-xl border border-border bg-secondary/40 text-sm outline-none focus:border-primary/50 transition placeholder:text-muted-foreground/40"
                      />
                    </div>
                  </div>

                  <div className="space-y-1">
                    <label className="text-[11px] text-muted-foreground font-medium flex items-center gap-1">
                      <Calendar className="w-3 h-3" /> Date of Birth
                    </label>
                    <input type="date" value={dob} onChange={e => setDob(e.target.value)}
                      max={new Date(Date.now() - 18 * 365.25 * 24 * 3600 * 1000).toISOString().slice(0, 10)}
                      className="w-full px-3 py-2.5 rounded-xl border border-border bg-secondary/40 text-sm outline-none focus:border-primary/50 transition"
                    />
                  </div>

                  <CountrySelect value={nationality} onChange={setNationality} label="Nationality" />
                  <CountrySelect value={country}     onChange={setCountry}     label="Country of Residence" />
                </div>
              </div>

              {error && (
                <div className="flex items-start gap-2 p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-xs text-red-400">
                  <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" /> {error}
                </div>
              )}

              <button onClick={goNext}
                className="w-full py-3.5 rounded-xl font-bold text-sm bg-gradient-to-r from-blue-500 to-blue-600 text-white hover:opacity-90 active:scale-[0.98] transition-all flex items-center justify-center gap-2"
              >
                Continue <ArrowRight className="w-4 h-4" />
              </button>
              <p className="text-[10px] text-muted-foreground/50 text-center">
                🔒 256-bit encrypted · GDPR compliant · Never sold to third parties
              </p>
            </div>
          )}

          {/* ─── STEP 2: ID DOCUMENT ─── */}
          {step === "id" && (
            <div className="space-y-5">
              <div>
                <div className="flex items-center gap-2 mb-3">
                  <CreditCard className="w-3.5 h-3.5 text-muted-foreground" />
                  <span className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider">Identity Document</span>
                </div>
                <div className="space-y-3">
                  <div className="space-y-1">
                    <label className="text-[11px] text-muted-foreground font-medium">Document Type</label>
                    <div className="grid grid-cols-2 gap-2">
                      {ID_TYPES.map(t => (
                        <button key={t.value} type="button" onClick={() => setIdType(t.value)}
                          className={cn(
                            "px-3 py-3 rounded-xl border text-sm font-medium transition text-left",
                            idType === t.value
                              ? "bg-primary/15 border-primary/50 text-primary"
                              : "border-border bg-secondary/40 text-muted-foreground hover:border-primary/30"
                          )}
                        >{t.label}</button>
                      ))}
                    </div>
                  </div>

                  <div className="space-y-1">
                    <label className="text-[11px] text-muted-foreground font-medium">
                      {idType === "passport" ? "Passport Number"
                        : idType === "drivers_license" ? "License Number"
                        : idType === "residence_permit" ? "Permit Number"
                        : "ID Number"}
                    </label>
                    <input type="text" value={idNumber}
                      onChange={e => setIdNumber(e.target.value.toUpperCase())}
                      placeholder={idType === "passport" ? "A12345678" : "ID1234567"}
                      className="w-full px-3 py-2.5 rounded-xl border border-border bg-secondary/40 text-sm font-mono outline-none focus:border-primary/50 transition placeholder:text-muted-foreground/40 uppercase"
                    />
                  </div>
                </div>
              </div>

              {error && (
                <div className="flex items-start gap-2 p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-xs text-red-400">
                  <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" /> {error}
                </div>
              )}

              <div className="flex gap-3">
                <button onClick={goBack}
                  className="flex-1 py-3 rounded-xl border border-border text-sm font-bold hover:bg-muted/40 transition flex items-center justify-center gap-2">
                  <ArrowLeft className="w-4 h-4" /> Back
                </button>
                <button onClick={goNext}
                  className="flex-[2] py-3 rounded-xl font-bold text-sm bg-gradient-to-r from-blue-500 to-blue-600 text-white hover:opacity-90 transition flex items-center justify-center gap-2">
                  Next: Take Selfie <ArrowRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}

          {/* ─── STEP 3: SELFIE ─── */}
          {step === "selfie" && (
            <div className="space-y-4">
              {submitting ? (
                <div className="flex flex-col items-center gap-4 py-12">
                  <Loader2 className="w-10 h-10 animate-spin text-blue-400" />
                  <p className="text-sm text-muted-foreground">Verifying your identity…</p>
                </div>
              ) : (
                <>
                  <SelfieCapture onCapture={handleSelfieCapture} />
                  {error && (
                    <div className="flex items-start gap-2 p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-xs text-red-400">
                      <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" /> {error}
                    </div>
                  )}
                  <button onClick={goBack}
                    className="w-full py-3 rounded-xl border border-border text-sm font-medium hover:bg-muted/40 transition flex items-center justify-center gap-2">
                    <ArrowLeft className="w-4 h-4" /> Back to Document
                  </button>
                </>
              )}
            </div>
          )}

          {/* ─── STEP 4: SUCCESS ─── */}
          {step === "success" && (
            <div className="text-center space-y-5 py-4">
              {/* Selfie thumbnail with badge */}
              <div className="relative w-24 h-24 mx-auto">
                {selfieData ? (
                  <img src={selfieData} alt="selfie"
                    className="w-24 h-24 rounded-full object-cover border-4 border-emerald-500/60"
                  />
                ) : (
                  <div className="w-24 h-24 rounded-full bg-emerald-500/15 border-4 border-emerald-500/40 flex items-center justify-center">
                    <CheckCircle2 className="w-10 h-10 text-emerald-400" />
                  </div>
                )}
                <div className="absolute -bottom-1 -right-1 w-8 h-8 rounded-full bg-emerald-500 border-2 border-card flex items-center justify-center">
                  <CheckCircle2 className="w-4 h-4 text-white" />
                </div>
              </div>

              <div>
                <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 text-xs font-bold mb-3">
                  <ShieldCheck className="w-3.5 h-3.5" /> KYC Verified
                </div>
                <h3 className="text-xl font-bold">Identity Confirmed!</h3>
                <p className="text-sm text-muted-foreground mt-1">
                  Welcome, {firstName}. You can now buy crypto directly on OrahDEX.
                </p>
              </div>

              <div className="rounded-xl bg-muted/30 border border-border/40 px-4 py-3 text-sm text-left space-y-1.5">
                <div className="flex justify-between text-muted-foreground">
                  <span>Name</span>
                  <span className="font-semibold text-foreground">{firstName} {lastName}</span>
                </div>
                <div className="flex justify-between text-muted-foreground">
                  <span>Country</span>
                  <span className="font-semibold text-foreground">{country}</span>
                </div>
                <div className="flex justify-between text-muted-foreground">
                  <span>Document</span>
                  <span className="font-semibold text-foreground">{ID_TYPES.find(t => t.value === idType)?.label}</span>
                </div>
                <div className="flex justify-between text-muted-foreground">
                  <span>Selfie</span>
                  <span className="font-semibold text-emerald-400">✓ Captured</span>
                </div>
                <div className="flex justify-between text-muted-foreground">
                  <span>Status</span>
                  <span className="font-bold text-emerald-400">✓ Approved</span>
                </div>
              </div>

              <button
                onClick={() => { onVerified(); onClose(); }}
                className="w-full py-3.5 rounded-xl font-bold text-sm bg-gradient-to-r from-emerald-500 to-emerald-600 text-white shadow hover:opacity-90 transition"
              >
                Continue to Buy Crypto →
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
