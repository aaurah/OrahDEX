import { useState } from "react";
import {
  X, ShieldCheck, User, CreditCard, Loader2,
  AlertTriangle, CheckCircle2, ChevronDown, Globe, Calendar,
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
  { value: "passport",       label: "Passport" },
  { value: "drivers_license", label: "Driver's License" },
  { value: "national_id",    label: "National ID Card" },
  { value: "residence_permit", label: "Residence Permit" },
];

type Step = "form" | "success";

interface Props {
  open: boolean;
  walletAddress: string;
  onClose: () => void;
  onVerified: () => void;
}

export function KycModal({ open, walletAddress, onClose, onVerified }: Props) {
  const [step, setStep]         = useState<Step>("form");
  const [firstName, setFirstName]   = useState("");
  const [lastName,  setLastName]    = useState("");
  const [dob,       setDob]         = useState("");
  const [nationality, setNationality] = useState("");
  const [country,   setCountry]     = useState("");
  const [idType,    setIdType]      = useState("");
  const [idNumber,  setIdNumber]    = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error,     setError]       = useState<string | null>(null);

  const [showNatList, setShowNatList]     = useState(false);
  const [showCountryList, setShowCountryList] = useState(false);
  const [natFilter, setNatFilter]         = useState("");
  const [countryFilter, setCountryFilter] = useState("");

  if (!open) return null;

  const filteredNat     = COUNTRIES.filter(c => c.toLowerCase().includes(natFilter.toLowerCase()));
  const filteredCountry = COUNTRIES.filter(c => c.toLowerCase().includes(countryFilter.toLowerCase()));

  async function handleSubmit() {
    setError(null);
    if (!firstName.trim() || !lastName.trim() || !dob || !nationality || !country || !idType || !idNumber.trim()) {
      setError("Please fill in all fields before continuing.");
      return;
    }
    setSubmitting(true);
    try {
      const r = await fetch(`${API_BASE}/kyc/submit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          walletAddress,
          firstName: firstName.trim(),
          lastName:  lastName.trim(),
          dateOfBirth: dob,
          nationality,
          countryOfResidence: country,
          idType,
          idNumber: idNumber.trim(),
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
      <div className="absolute inset-0 bg-black/75 backdrop-blur-sm" onClick={step === "success" ? onClose : undefined} />
      <div className="relative w-full sm:w-[480px] bg-card border border-border rounded-t-2xl sm:rounded-2xl shadow-2xl overflow-hidden max-h-[93vh] flex flex-col">

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

        <div className="overflow-y-auto flex-1 p-5">

          {/* ═══ FORM STEP ═══ */}
          {step === "form" && (
            <div className="space-y-5">

              {/* Why section */}
              <div className="flex gap-3 p-3 rounded-xl bg-blue-500/8 border border-blue-500/20 text-xs text-blue-300">
                <ShieldCheck className="w-4 h-4 shrink-0 mt-0.5 text-blue-400" />
                <p>
                  OrahDEX is required by law to verify the identity of users purchasing crypto.
                  Your data is encrypted and never shared with third parties.
                </p>
              </div>

              {/* Personal info */}
              <div>
                <div className="flex items-center gap-2 mb-3">
                  <User className="w-3.5 h-3.5 text-muted-foreground" />
                  <span className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider">Personal Information</span>
                </div>
                <div className="space-y-3">
                  {/* Name row */}
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <label className="text-[11px] text-muted-foreground font-medium">First Name</label>
                      <input
                        type="text"
                        value={firstName}
                        onChange={e => setFirstName(e.target.value)}
                        placeholder="John"
                        className="w-full px-3 py-2.5 rounded-xl border border-border bg-secondary/40 text-sm outline-none focus:border-primary/50 transition placeholder:text-muted-foreground/40"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-[11px] text-muted-foreground font-medium">Last Name</label>
                      <input
                        type="text"
                        value={lastName}
                        onChange={e => setLastName(e.target.value)}
                        placeholder="Doe"
                        className="w-full px-3 py-2.5 rounded-xl border border-border bg-secondary/40 text-sm outline-none focus:border-primary/50 transition placeholder:text-muted-foreground/40"
                      />
                    </div>
                  </div>

                  {/* Date of birth */}
                  <div className="space-y-1">
                    <label className="text-[11px] text-muted-foreground font-medium flex items-center gap-1">
                      <Calendar className="w-3 h-3" /> Date of Birth
                    </label>
                    <input
                      type="date"
                      value={dob}
                      onChange={e => setDob(e.target.value)}
                      max={new Date(Date.now() - 18 * 365.25 * 24 * 3600 * 1000).toISOString().slice(0, 10)}
                      className="w-full px-3 py-2.5 rounded-xl border border-border bg-secondary/40 text-sm outline-none focus:border-primary/50 transition"
                    />
                  </div>

                  {/* Nationality */}
                  <div className="space-y-1 relative">
                    <label className="text-[11px] text-muted-foreground font-medium flex items-center gap-1">
                      <Globe className="w-3 h-3" /> Nationality
                    </label>
                    <button
                      type="button"
                      onClick={() => { setShowNatList(v => !v); setShowCountryList(false); }}
                      className={cn(
                        "w-full flex items-center justify-between px-3 py-2.5 rounded-xl border bg-secondary/40 text-sm transition text-left",
                        nationality ? "border-border text-foreground" : "border-border text-muted-foreground/50"
                      )}
                    >
                      {nationality || "Select nationality"}
                      <ChevronDown className={cn("w-4 h-4 text-muted-foreground transition-transform", showNatList && "rotate-180")} />
                    </button>
                    {showNatList && (
                      <div className="absolute z-30 top-full left-0 right-0 mt-1 bg-card border border-border rounded-xl shadow-2xl overflow-hidden">
                        <div className="p-2 border-b border-border">
                          <input
                            autoFocus
                            type="text"
                            value={natFilter}
                            onChange={e => setNatFilter(e.target.value)}
                            placeholder="Search..."
                            className="w-full px-3 py-1.5 rounded-lg bg-secondary/60 text-sm outline-none placeholder:text-muted-foreground/50"
                          />
                        </div>
                        <div className="max-h-44 overflow-y-auto">
                          {filteredNat.map(c => (
                            <button
                              key={c}
                              type="button"
                              onClick={() => { setNationality(c); setShowNatList(false); setNatFilter(""); }}
                              className={cn("w-full text-left px-4 py-2 text-sm hover:bg-muted/50 transition", nationality === c && "bg-primary/10 font-semibold")}
                            >
                              {c}
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Country of residence */}
                  <div className="space-y-1 relative">
                    <label className="text-[11px] text-muted-foreground font-medium flex items-center gap-1">
                      <Globe className="w-3 h-3" /> Country of Residence
                    </label>
                    <button
                      type="button"
                      onClick={() => { setShowCountryList(v => !v); setShowNatList(false); }}
                      className={cn(
                        "w-full flex items-center justify-between px-3 py-2.5 rounded-xl border bg-secondary/40 text-sm transition text-left",
                        country ? "border-border text-foreground" : "border-border text-muted-foreground/50"
                      )}
                    >
                      {country || "Select country"}
                      <ChevronDown className={cn("w-4 h-4 text-muted-foreground transition-transform", showCountryList && "rotate-180")} />
                    </button>
                    {showCountryList && (
                      <div className="absolute z-30 top-full left-0 right-0 mt-1 bg-card border border-border rounded-xl shadow-2xl overflow-hidden">
                        <div className="p-2 border-b border-border">
                          <input
                            autoFocus
                            type="text"
                            value={countryFilter}
                            onChange={e => setCountryFilter(e.target.value)}
                            placeholder="Search..."
                            className="w-full px-3 py-1.5 rounded-lg bg-secondary/60 text-sm outline-none placeholder:text-muted-foreground/50"
                          />
                        </div>
                        <div className="max-h-44 overflow-y-auto">
                          {filteredCountry.map(c => (
                            <button
                              key={c}
                              type="button"
                              onClick={() => { setCountry(c); setShowCountryList(false); setCountryFilter(""); }}
                              className={cn("w-full text-left px-4 py-2 text-sm hover:bg-muted/50 transition", country === c && "bg-primary/10 font-semibold")}
                            >
                              {c}
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Divider */}
              <div className="border-t border-border/50" />

              {/* ID document */}
              <div>
                <div className="flex items-center gap-2 mb-3">
                  <CreditCard className="w-3.5 h-3.5 text-muted-foreground" />
                  <span className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider">Identity Document</span>
                </div>
                <div className="space-y-3">
                  {/* ID type */}
                  <div className="space-y-1">
                    <label className="text-[11px] text-muted-foreground font-medium">Document Type</label>
                    <div className="grid grid-cols-2 gap-2">
                      {ID_TYPES.map(t => (
                        <button
                          key={t.value}
                          type="button"
                          onClick={() => setIdType(t.value)}
                          className={cn(
                            "px-3 py-2.5 rounded-xl border text-sm font-medium transition text-left",
                            idType === t.value
                              ? "bg-primary/15 border-primary/50 text-primary"
                              : "border-border bg-secondary/40 text-muted-foreground hover:border-primary/30"
                          )}
                        >
                          {t.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* ID number */}
                  <div className="space-y-1">
                    <label className="text-[11px] text-muted-foreground font-medium">
                      {idType === "passport" ? "Passport Number"
                        : idType === "drivers_license" ? "License Number"
                        : idType === "residence_permit" ? "Permit Number"
                        : "ID Number"}
                    </label>
                    <input
                      type="text"
                      value={idNumber}
                      onChange={e => setIdNumber(e.target.value.toUpperCase())}
                      placeholder={idType === "passport" ? "A12345678" : idType === "drivers_license" ? "DL1234567" : "ID1234567"}
                      className="w-full px-3 py-2.5 rounded-xl border border-border bg-secondary/40 text-sm font-mono outline-none focus:border-primary/50 transition placeholder:text-muted-foreground/40 uppercase"
                    />
                  </div>
                </div>
              </div>

              {/* Error */}
              {error && (
                <div className="flex items-start gap-2 p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-xs text-red-400">
                  <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" /> {error}
                </div>
              )}

              {/* Submit */}
              <button
                onClick={handleSubmit}
                disabled={submitting}
                className="w-full py-3.5 rounded-xl font-bold text-sm bg-gradient-to-r from-blue-500 to-blue-600 text-white shadow hover:opacity-90 active:scale-[0.98] transition-all disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {submitting
                  ? <><Loader2 className="w-4 h-4 animate-spin" /> Verifying…</>
                  : <><ShieldCheck className="w-4 h-4" /> Submit & Verify Identity</>}
              </button>

              <p className="text-[10px] text-muted-foreground/50 text-center pb-1">
                🔒 256-bit encrypted · GDPR compliant · Never sold to third parties
              </p>
            </div>
          )}

          {/* ═══ SUCCESS STEP ═══ */}
          {step === "success" && (
            <div className="text-center space-y-5 py-4">
              <div className="w-20 h-20 rounded-full bg-emerald-500/15 border-2 border-emerald-500/40 flex items-center justify-center mx-auto">
                <CheckCircle2 className="w-10 h-10 text-emerald-400" />
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
