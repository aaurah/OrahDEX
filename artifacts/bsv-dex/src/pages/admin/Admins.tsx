import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Plus, Trash2, ShieldCheck, ShieldAlert, KeyRound, X, Crown,
  ToggleLeft, ToggleRight, QrCode, Copy, Check, RefreshCw, AlertTriangle, Eye, EyeOff,
  Pencil, Lock,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useAdminAuthStore } from "@/store/useAdminAuthStore";
import { TOTP_SECRET, TOTP_ISSUER, getQRCodeUrl, generateTOTP } from "@/lib/totp";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");
const fetchAdmins = () => fetch(`${BASE}/api/admin/admins`).then(r => r.json());

const ROLE_COLORS: Record<string, string> = {
  superadmin: "bg-red-400/10 text-red-400 border-red-400/20",
  admin: "bg-primary/10 text-primary border-primary/20",
  developer: "bg-blue-400/10 text-blue-400 border-blue-400/20",
  moderator: "bg-violet-400/10 text-violet-400 border-violet-400/20",
  analyst: "bg-green-400/10 text-green-400 border-green-400/20",
};

const ALL_PERMISSIONS = ["all", "users", "pairs", "orders", "api", "contracts", "reports"];

// ── Enable 2FA Modal (QR setup) ──────────────────────────────────────────────
function Enable2FAModal({ onDone, onClose }: { onDone: () => void; onClose: () => void }) {
  const [copied, setCopied] = useState(false);
  const [previewCode, setPreviewCode] = useState("");

  useEffect(() => {
    const refresh = () => generateTOTP().then(setPreviewCode);
    refresh();
    const t = setInterval(refresh, 5000);
    return () => clearInterval(t);
  }, []);

  const copySecret = () => {
    navigator.clipboard.writeText(TOTP_SECRET);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-card border border-border rounded-2xl p-6 w-full max-w-md shadow-2xl">
        <div className="flex items-center justify-between mb-5">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-green-500/15 flex items-center justify-center">
              <QrCode className="w-4.5 h-4.5 text-green-400" />
            </div>
            <div>
              <h3 className="font-bold text-base text-foreground">Enable Two-Factor Auth</h3>
              <p className="text-xs text-muted-foreground">Scan with Google Authenticator</p>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 text-muted-foreground hover:text-foreground rounded-lg hover:bg-white/5">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="space-y-4">
          {/* QR Code */}
          <div className="bg-secondary/50 rounded-xl p-3 flex flex-col items-center gap-3 border border-border">
            <img
              src={getQRCodeUrl()}
              alt="TOTP QR Code"
              className="w-44 h-44 rounded-lg bg-white p-1"
              onError={e => (e.currentTarget.style.display = 'none')}
            />
            <p className="text-xs text-muted-foreground text-center">
              Scan with <span className="text-foreground font-medium">Google Authenticator</span>, Authy, or any TOTP app
            </p>
          </div>

          {/* Manual secret */}
          <div>
            <p className="text-xs text-muted-foreground mb-1.5">Or enter this secret manually:</p>
            <div className="flex items-center gap-2 bg-secondary border border-border rounded-xl px-3 py-2.5">
              <code className="flex-1 text-xs font-mono text-primary tracking-widest">{TOTP_SECRET}</code>
              <button onClick={copySecret} className="text-muted-foreground hover:text-foreground transition-colors shrink-0">
                {copied ? <Check className="w-4 h-4 text-green-400" /> : <Copy className="w-4 h-4" />}
              </button>
            </div>
            <p className="text-[10px] text-muted-foreground mt-1.5">
              Issuer: <span className="text-foreground">{TOTP_ISSUER}</span> · SHA-1 · 6 digits · 30 sec
            </p>
          </div>

          {/* Live code preview */}
          {previewCode && (
            <div className="flex items-center justify-between bg-green-500/10 border border-green-500/20 rounded-xl px-4 py-2.5">
              <div className="flex items-center gap-2">
                <RefreshCw className="w-3.5 h-3.5 text-green-400 animate-spin" style={{ animationDuration: '3s' }} />
                <span className="text-xs text-green-400">Live code (refreshes every 30s)</span>
              </div>
              <code className="text-lg font-mono font-bold text-green-400 tracking-widest">{previewCode}</code>
            </div>
          )}

          <button
            onClick={onDone}
            className="w-full flex items-center justify-center gap-2 bg-gradient-to-r from-green-600 to-emerald-500 text-white py-3 rounded-xl font-bold text-sm shadow-lg hover:scale-[1.01] active:scale-[0.99] transition-all"
          >
            <ShieldCheck className="w-4 h-4" />
            2FA Enabled — I've set it up
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Disable 2FA Confirmation Modal ───────────────────────────────────────────
function Disable2FAModal({ adminName, onConfirm, onClose }: { adminName: string; onConfirm: () => void; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-card border border-border rounded-2xl p-6 w-full max-w-sm shadow-2xl">
        <div className="flex items-center justify-between mb-5">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-orange-500/15 flex items-center justify-center">
              <AlertTriangle className="w-4.5 h-4.5 text-orange-400" />
            </div>
            <h3 className="font-bold text-base text-foreground">Disable 2FA</h3>
          </div>
          <button onClick={onClose} className="p-1.5 text-muted-foreground hover:text-foreground rounded-lg hover:bg-white/5">
            <X className="w-4 h-4" />
          </button>
        </div>
        <p className="text-sm text-muted-foreground mb-1">
          You are about to disable two-factor authentication for <span className="font-semibold text-foreground">{adminName}</span>.
        </p>
        <p className="text-sm text-orange-400/80 mb-6">
          This will make the account less secure. Are you sure?
        </p>
        <div className="flex gap-3">
          <button onClick={onClose} className="flex-1 py-2.5 rounded-xl border border-border text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-white/5 transition-all">
            Cancel
          </button>
          <button onClick={onConfirm} className="flex-1 py-2.5 rounded-xl bg-orange-500/15 border border-orange-500/30 text-orange-400 text-sm font-semibold hover:bg-orange-500/25 transition-all">
            Disable 2FA
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Reset Password Modal ───────────────────────────────────────────────────────
function ResetPasswordModal({ admin, onClose }: { admin: { id: string; name: string; email: string }; onClose: () => void }) {
  const { updatePassword } = useAdminAuthStore();
  const isSuperadmin = admin.id === '__superadmin__';
  const [newPw, setNewPw] = useState("");
  const [confirm, setConfirm] = useState("");
  const [show, setShow] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState("");

  const handleReset = async () => {
    if (newPw.length < 8) { setError("Password must be at least 8 characters."); return; }
    if (newPw !== confirm) { setError("Passwords do not match."); return; }
    setError("");
    if (isSuperadmin) {
      // Superadmin password lives in the auth store (persisted to localStorage)
      updatePassword(newPw);
    } else {
      await fetch(`${BASE}/api/admin/admins/${admin.id}/password`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password: newPw }),
      });
    }
    setDone(true);
    setTimeout(onClose, 1800);
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-card border border-border rounded-2xl p-6 w-full max-w-sm shadow-2xl">
        <div className="flex items-center justify-between mb-5">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-primary/15 flex items-center justify-center">
              <KeyRound className="w-4.5 h-4.5 text-primary" />
            </div>
            <div>
              <h3 className="font-bold text-base text-foreground">Reset Password</h3>
              <p className="text-xs text-muted-foreground">{admin.email}</p>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 text-muted-foreground hover:text-foreground rounded-lg hover:bg-white/5">
            <X className="w-4 h-4" />
          </button>
        </div>
        {done ? (
          <div className="py-6 flex flex-col items-center gap-3">
            <div className="w-14 h-14 rounded-full bg-green-500/15 flex items-center justify-center">
              <Check className="w-7 h-7 text-green-400" />
            </div>
            <p className="text-sm font-semibold text-green-400">Password reset successfully</p>
          </div>
        ) : (
          <div className="space-y-4">
            <div>
              <label className="text-xs text-muted-foreground font-medium block mb-1">New Password</label>
              <div className="relative">
                <input
                  type={show ? "text" : "password"}
                  value={newPw}
                  onChange={e => setNewPw(e.target.value)}
                  className="w-full bg-secondary border border-border rounded-xl px-3 py-2.5 text-sm pr-9 focus:outline-none focus:border-primary"
                  placeholder="Min. 8 characters"
                />
                <button onClick={() => setShow(s => !s)} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                  {show ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>
            <div>
              <label className="text-xs text-muted-foreground font-medium block mb-1">Confirm Password</label>
              <input
                type={show ? "text" : "password"}
                value={confirm}
                onChange={e => setConfirm(e.target.value)}
                className="w-full bg-secondary border border-border rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-primary"
                placeholder="Repeat new password"
              />
            </div>
            {error && <p className="text-xs text-red-400">{error}</p>}
            <div className="flex gap-3 pt-1">
              <button onClick={onClose} className="flex-1 py-2.5 rounded-xl border border-border text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-white/5 transition-all">
                Cancel
              </button>
              <button
                onClick={handleReset}
                disabled={!newPw || !confirm}
                className="flex-1 py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-semibold disabled:opacity-50 hover:opacity-90 transition-all"
              >
                Reset Password
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Edit Admin Modal ──────────────────────────────────────────────────────────
function EditAdminModal({
  admin, isSuperadmin, onClose, onSaved,
}: {
  admin: any;
  isSuperadmin: boolean;
  onClose: () => void;
  onSaved: (updated: any) => void;
}) {
  const { displayName, updateProfile } = useAdminAuthStore();
  const [form, setForm] = useState({
    name: isSuperadmin ? displayName : admin.name,
    email: admin.email,
    role: admin.role,
    permissions: [...(admin.permissions ?? [])] as string[],
    status: admin.status ?? "active",
  });
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState(false);

  const set = (k: string, v: any) => setForm(f => ({ ...f, [k]: v }));

  const togglePerm = (p: string) =>
    setForm(f => ({
      ...f,
      permissions: f.permissions.includes(p) ? f.permissions.filter(x => x !== p) : [...f.permissions, p],
    }));

  const handleSave = async () => {
    setSaving(true);
    if (isSuperadmin) {
      updateProfile({ displayName: form.name });
      setSaving(false);
      setDone(true);
      onSaved({ ...admin, name: form.name });
      setTimeout(onClose, 1200);
      return;
    }
    const res = await fetch(`${BASE}/api/admin/admins/${admin.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: form.name,
        email: form.email,
        role: form.role,
        permissions: form.permissions,
        status: form.status,
      }),
    });
    const data = await res.json();
    setSaving(false);
    if (data.success) {
      setDone(true);
      onSaved(data.admin);
      setTimeout(onClose, 1200);
    }
  };

  const ROLES = ["admin", "developer", "moderator", "analyst"];
  const PERMS = ALL_PERMISSIONS.filter(p => p !== "all");

  return (
    <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-card border border-border rounded-2xl w-full max-w-lg shadow-2xl overflow-hidden max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border shrink-0">
          <div className="flex items-center gap-3">
            <div className={cn(
              "w-9 h-9 rounded-xl flex items-center justify-center shrink-0",
              isSuperadmin ? "bg-amber-500/15" : "bg-primary/15"
            )}>
              {isSuperadmin ? <Crown className="w-4 h-4 text-amber-400" /> : <Pencil className="w-4 h-4 text-primary" />}
            </div>
            <div>
              <h3 className="font-bold text-base text-foreground">
                {isSuperadmin ? "Edit Your Profile" : `Edit Admin — ${admin.name}`}
              </h3>
              <p className="text-xs text-muted-foreground">{admin.email}</p>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 text-muted-foreground hover:text-foreground rounded-lg hover:bg-white/5">
            <X className="w-4 h-4" />
          </button>
        </div>

        {done ? (
          <div className="py-12 flex flex-col items-center gap-3">
            <div className="w-14 h-14 rounded-full bg-green-500/15 border border-green-500/30 flex items-center justify-center">
              <Check className="w-7 h-7 text-green-400" />
            </div>
            <p className="font-semibold text-green-400">
              {isSuperadmin ? "Profile updated!" : "Admin updated!"}
            </p>
          </div>
        ) : (
          <div className="overflow-y-auto flex-1 p-6 space-y-5">
            {/* Name */}
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Display Name</label>
              <input value={form.name} onChange={e => set("name", e.target.value)}
                className="w-full bg-secondary border border-border rounded-xl px-3 py-2.5 text-sm text-foreground focus:outline-none focus:border-primary"
                placeholder="Full name" />
            </div>

            {/* Email */}
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1.5 block flex items-center gap-1.5">
                Email
                {isSuperadmin && <span className="text-amber-400/70 flex items-center gap-1"><Lock className="w-3 h-3" /> Login credential (display only)</span>}
              </label>
              <input value={form.email} onChange={e => !isSuperadmin && set("email", e.target.value)}
                readOnly={isSuperadmin}
                className={cn(
                  "w-full bg-secondary border border-border rounded-xl px-3 py-2.5 text-sm text-foreground focus:outline-none focus:border-primary",
                  isSuperadmin && "opacity-50 cursor-not-allowed"
                )}
                placeholder="email@example.com" />
            </div>

            {/* Role */}
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1.5 flex items-center gap-1.5 block">
                Role
                {isSuperadmin && <span className="text-amber-400/70 flex items-center gap-1"><Lock className="w-3 h-3" /> Fixed for superadmin</span>}
              </label>
              {isSuperadmin ? (
                <div className="w-full bg-secondary border border-border rounded-xl px-3 py-2.5 text-sm text-amber-400 font-semibold opacity-60 cursor-not-allowed capitalize">
                  superadmin
                </div>
              ) : (
                <select value={form.role} onChange={e => set("role", e.target.value)}
                  className="w-full bg-secondary border border-border rounded-xl px-3 py-2.5 text-sm text-foreground focus:outline-none focus:border-primary">
                  {ROLES.map(r => <option key={r} value={r}>{r.charAt(0).toUpperCase() + r.slice(1)}</option>)}
                </select>
              )}
            </div>

            {/* Permissions */}
            {!isSuperadmin && (
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-2 block">Permissions</label>
                <div className="flex flex-wrap gap-2">
                  {PERMS.map(p => (
                    <button key={p} onClick={() => togglePerm(p)}
                      className={cn("text-xs px-2.5 py-1 rounded-lg border font-medium capitalize transition-all",
                        form.permissions.includes(p)
                          ? "bg-primary/10 text-primary border-primary/30"
                          : "border-border text-muted-foreground hover:border-primary/30"
                      )}>
                      {form.permissions.includes(p) && <Check className="w-3 h-3 inline mr-1" />}{p}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {isSuperadmin && (
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-2 block flex items-center gap-1.5">
                  Permissions <span className="text-amber-400/70 flex items-center gap-1"><Lock className="w-3 h-3" /> Always "all"</span>
                </label>
                <div className="flex flex-wrap gap-2 opacity-50 pointer-events-none">
                  <span className="text-xs px-2.5 py-1 rounded-lg border bg-primary/10 text-primary border-primary/30 font-medium">all</span>
                </div>
              </div>
            )}

            {/* Status — only for non-superadmin */}
            {!isSuperadmin && (
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Status</label>
                <div className="flex gap-2">
                  {["active", "inactive", "suspended"].map(s => (
                    <button key={s} onClick={() => set("status", s)}
                      className={cn("flex-1 py-2 rounded-xl border text-xs font-semibold capitalize transition-all",
                        form.status === s
                          ? s === "active" ? "bg-green-500/15 border-green-500/40 text-green-400"
                            : s === "suspended" ? "bg-red-500/15 border-red-500/40 text-red-400"
                            : "bg-secondary border-primary/30 text-foreground"
                          : "bg-secondary border-border text-muted-foreground hover:text-foreground"
                      )}>
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {!done && (
          <div className="px-6 py-4 border-t border-border flex gap-3 shrink-0">
            <button onClick={onClose} className="flex-1 py-2.5 rounded-xl border border-border text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-white/5 transition-all">
              Cancel
            </button>
            <button onClick={handleSave} disabled={saving || !form.name}
              className="flex-1 py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-semibold disabled:opacity-50 hover:opacity-90 transition-all">
              {saving ? "Saving..." : "Save Changes"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Main Component ────────────────────────────────────────────────────────────
export function AdminAdmins() {
  const qc = useQueryClient();
  const {
    email: loggedInEmail, displayName: superadminDisplayName, twoFaEnabled, twoFaSetupDone,
    enable2FA, disable2FA, markSetupDone
  } = useAdminAuthStore();

  const [showAdd, setShowAdd] = useState(false);
  const [modal2FA, setModal2FA] = useState<{ type: 'enable' | 'disable'; id: string; name: string } | null>(null);
  const [resetPwAdmin, setResetPwAdmin] = useState<{ id: string; name: string; email: string } | null>(null);
  const [editAdminTarget, setEditAdminTarget] = useState<any | null>(null);
  const [form, setForm] = useState({ name: "", email: "", role: "moderator", permissions: [] as string[] });

  const { data: apiAdmins = [], isLoading } = useQuery({ queryKey: ["admin-admins"], queryFn: fetchAdmins });

  const addAdmin = useMutation({
    mutationFn: (data: any) =>
      fetch(`${BASE}/api/admin/admins`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      }).then(r => r.json()),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-admins"] });
      setShowAdd(false);
      setForm({ name: "", email: "", role: "moderator", permissions: [] });
    },
  });

  const removeAdmin = useMutation({
    mutationFn: (id: string) =>
      fetch(`${BASE}/api/admin/admins/${id}`, { method: "DELETE" }).then(r => r.json()),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin-admins"] }),
  });

  const toggle2FAAPI = useMutation({
    mutationFn: ({ id, enable }: { id: string; enable: boolean }) =>
      fetch(`${BASE}/api/admin/admins/${id}/2fa`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ twoFa: enable }),
      }).then(r => r.json()),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin-admins"] }),
  });

  const togglePerm = (p: string) =>
    setForm(f => ({ ...f, permissions: f.permissions.includes(p) ? f.permissions.filter(x => x !== p) : [...f.permissions, p] }));

  // Superadmin pinned row
  const superadminRow = loggedInEmail ? [{
    id: '__superadmin__',
    name: superadminDisplayName,
    email: loggedInEmail,
    role: 'superadmin',
    permissions: ['all'],
    twoFa: twoFaEnabled,
    lastLogin: new Date().toISOString(),
    status: 'active',
    isPinned: true,
  }] : [];

  const admins = [...superadminRow, ...apiAdmins.filter((a: any) => a.email !== loggedInEmail)];

  const handle2FAToggle = (a: any) => {
    const currentlyEnabled = a.isPinned ? twoFaEnabled : a.twoFa;
    setModal2FA({ type: currentlyEnabled ? 'disable' : 'enable', id: a.id, name: a.name });
  };

  const confirm2FAEnable = () => {
    if (!modal2FA) return;
    if (modal2FA.id === '__superadmin__') {
      enable2FA();
      // Keep modal open to show QR setup
      setModal2FA({ ...modal2FA, type: 'enable' });
    } else {
      toggle2FAAPI.mutate({ id: modal2FA.id, enable: true });
      setModal2FA(null);
    }
  };

  const confirm2FADisable = () => {
    if (!modal2FA) return;
    if (modal2FA.id === '__superadmin__') {
      disable2FA();
    } else {
      toggle2FAAPI.mutate({ id: modal2FA.id, enable: false });
    }
    setModal2FA(null);
  };

  const onSetupDone = () => {
    markSetupDone();
    setModal2FA(null);
  };

  return (
    <div className="space-y-5">
      {/* ── Header ── */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">Admin User Management</h2>
          <p className="text-sm text-muted-foreground mt-0.5">Manage platform operators and their permissions</p>
        </div>
        <button
          onClick={() => setShowAdd(true)}
          className="flex items-center gap-2 bg-primary text-primary-foreground px-4 py-2.5 rounded-xl text-sm font-semibold shadow-lg shadow-primary/20 hover:scale-[1.02] transition-all"
        >
          <Plus className="w-4 h-4" /> Add Admin
        </button>
      </div>

      {/* ── Reset Password Modal ── */}
      {resetPwAdmin && (
        <ResetPasswordModal admin={resetPwAdmin} onClose={() => setResetPwAdmin(null)} />
      )}

      {/* ── Edit Admin Modal ── */}
      {editAdminTarget && (
        <EditAdminModal
          admin={editAdminTarget}
          isSuperadmin={!!editAdminTarget.isPinned}
          onClose={() => setEditAdminTarget(null)}
          onSaved={() => {
            qc.invalidateQueries({ queryKey: ["admin-admins"] });
            setEditAdminTarget(null);
          }}
        />
      )}

      {/* ── 2FA Modals ── */}
      {modal2FA?.type === 'enable' && modal2FA.id === '__superadmin__' && (
        <Enable2FAModal
          onDone={onSetupDone}
          onClose={() => setModal2FA(null)}
        />
      )}
      {modal2FA?.type === 'enable' && modal2FA.id !== '__superadmin__' && (
        <Enable2FAModal
          onDone={() => { toggle2FAAPI.mutate({ id: modal2FA.id, enable: true }); setModal2FA(null); }}
          onClose={() => setModal2FA(null)}
        />
      )}
      {modal2FA?.type === 'disable' && (
        <Disable2FAModal
          adminName={modal2FA.name}
          onConfirm={confirm2FADisable}
          onClose={() => setModal2FA(null)}
        />
      )}

      {/* ── Add Admin Modal ── */}
      {showAdd && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-card border border-border rounded-2xl p-6 w-full max-w-md shadow-2xl">
            <div className="flex items-center justify-between mb-5">
              <h3 className="font-bold text-lg">New Admin User</h3>
              <button onClick={() => setShowAdd(false)} className="p-1.5 text-muted-foreground hover:text-foreground rounded-lg hover:bg-white/5">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="space-y-4">
              <div>
                <label className="text-xs text-muted-foreground font-medium block mb-1">Full Name</label>
                <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                  className="w-full bg-secondary border border-border rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-primary"
                  placeholder="Jane Doe" />
              </div>
              <div>
                <label className="text-xs text-muted-foreground font-medium block mb-1">Email</label>
                <input value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
                  className="w-full bg-secondary border border-border rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-primary"
                  placeholder="jane@orahdex.io" />
              </div>
              <div>
                <label className="text-xs text-muted-foreground font-medium block mb-1">Role</label>
                <select value={form.role} onChange={e => setForm(f => ({ ...f, role: e.target.value }))}
                  className="w-full bg-secondary border border-border rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-primary">
                  {["admin", "developer", "moderator", "analyst"].map(r =>
                    <option key={r} value={r}>{r.charAt(0).toUpperCase() + r.slice(1)}</option>
                  )}
                </select>
              </div>
              <div>
                <label className="text-xs text-muted-foreground font-medium block mb-2">Permissions</label>
                <div className="flex flex-wrap gap-2">
                  {ALL_PERMISSIONS.filter(p => p !== "all").map(p => (
                    <button key={p} onClick={() => togglePerm(p)}
                      className={cn("text-xs px-2.5 py-1 rounded-lg border font-medium capitalize transition-all",
                        form.permissions.includes(p)
                          ? "bg-primary/10 text-primary border-primary/30"
                          : "border-border text-muted-foreground hover:border-primary/30"
                      )}>
                      {p}
                    </button>
                  ))}
                </div>
              </div>
              <button
                onClick={() => addAdmin.mutate(form)}
                disabled={!form.name || !form.email || addAdmin.isPending}
                className="w-full bg-primary text-primary-foreground py-2.5 rounded-xl font-semibold text-sm disabled:opacity-50"
              >
                {addAdmin.isPending ? "Creating..." : "Create Admin"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Admins Table ── */}
      <div className="bg-card border border-border rounded-2xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-secondary/30 text-muted-foreground text-xs">
                <th className="px-4 py-3 text-left font-medium">Admin</th>
                <th className="px-4 py-3 text-left font-medium">Role</th>
                <th className="px-4 py-3 text-left font-medium">Permissions</th>
                <th className="px-4 py-3 text-left font-medium">2FA</th>
                <th className="px-4 py-3 text-left font-medium">Last Login</th>
                <th className="px-4 py-3 text-left font-medium">Status</th>
                <th className="px-4 py-3 text-center font-medium">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {isLoading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <tr key={i}>
                    {Array.from({ length: 7 }).map((_, j) => (
                      <td key={j} className="px-4 py-3"><div className="h-4 bg-secondary rounded animate-pulse" /></td>
                    ))}
                  </tr>
                ))
              ) : admins.map((a: any) => {
                const isTwoFaOn = a.isPinned ? twoFaEnabled : a.twoFa;
                return (
                  <tr key={a.id} className={cn(
                    "hover:bg-secondary/20 transition-colors",
                    a.isPinned && "bg-amber-500/5 border-l-2 border-l-amber-500/40"
                  )}>
                    {/* Admin */}
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <div className={cn(
                          "w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold text-white shrink-0",
                          a.isPinned ? "bg-gradient-to-br from-amber-400 to-orange-500" : "bg-gradient-to-br from-violet-500 to-primary"
                        )}>
                          {a.isPinned ? <Crown className="w-3.5 h-3.5" /> : a.name[0]}
                        </div>
                        <div>
                          <div className="flex items-center gap-1.5">
                            <span className="font-semibold text-foreground">{a.name}</span>
                            {a.isPinned && (
                              <span className="text-[9px] bg-amber-500/20 text-amber-400 border border-amber-500/30 px-1.5 py-0.5 rounded font-bold uppercase">You</span>
                            )}
                          </div>
                          <div className="text-xs text-muted-foreground">{a.email}</div>
                        </div>
                      </div>
                    </td>

                    {/* Role */}
                    <td className="px-4 py-3">
                      <span className={cn("text-[10px] font-bold px-2 py-0.5 rounded border capitalize", ROLE_COLORS[a.role] ?? "bg-muted text-muted-foreground border-border")}>
                        {a.role}
                      </span>
                    </td>

                    {/* Permissions */}
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-1">
                        {(a.permissions ?? []).slice(0, 3).map((p: string) => (
                          <span key={p} className="text-[9px] bg-secondary px-1.5 py-0.5 rounded font-medium uppercase">{p}</span>
                        ))}
                        {a.permissions?.length > 3 && (
                          <span className="text-[9px] text-muted-foreground">+{a.permissions.length - 3}</span>
                        )}
                      </div>
                    </td>

                    {/* 2FA Toggle */}
                    <td className="px-4 py-3">
                      <button
                        onClick={() => handle2FAToggle(a)}
                        className={cn(
                          "flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-xs font-semibold transition-all hover:scale-[1.03] active:scale-[0.97]",
                          isTwoFaOn
                            ? "bg-green-500/10 text-green-400 border-green-500/25 hover:bg-green-500/20"
                            : "bg-secondary text-muted-foreground border-border hover:border-primary/30 hover:text-foreground"
                        )}
                        title={isTwoFaOn ? "Click to disable 2FA" : "Click to enable 2FA"}
                      >
                        {isTwoFaOn
                          ? <><ToggleRight className="w-4 h-4" /> Enabled</>
                          : <><ToggleLeft className="w-4 h-4" /> Disabled</>
                        }
                      </button>
                    </td>

                    {/* Last Login */}
                    <td className="px-4 py-3 text-xs text-muted-foreground">
                      {a.lastLogin ? new Date(a.lastLogin).toLocaleString() : "Never"}
                    </td>

                    {/* Status */}
                    <td className="px-4 py-3">
                      <span className={cn(
                        "text-[10px] font-bold px-2 py-0.5 rounded border capitalize",
                        a.status === "active"
                          ? "bg-green-400/10 text-green-400 border-green-400/20"
                          : "bg-muted text-muted-foreground border-border"
                      )}>
                        {a.status}
                      </span>
                    </td>

                    {/* Actions */}
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-center gap-1">
                        {/* Edit */}
                        <button
                          onClick={() => setEditAdminTarget(a)}
                          className={cn(
                            "p-1.5 rounded-lg transition-colors",
                            a.isPinned
                              ? "text-amber-400 hover:bg-amber-400/10"
                              : "text-primary hover:bg-primary/10"
                          )}
                          title="Edit admin"
                        >
                          <Pencil className="w-4 h-4" />
                        </button>
                        {/* Reset password */}
                        <button
                          onClick={() => setResetPwAdmin({ id: a.id, name: a.name, email: a.email })}
                          className="p-1.5 text-blue-400 hover:bg-blue-400/10 rounded-lg transition-colors"
                          title="Reset password"
                        >
                          <KeyRound className="w-4 h-4" />
                        </button>
                        {!a.isPinned && (
                          <button
                            onClick={() => removeAdmin.mutate(a.id)}
                            className="p-1.5 text-red-400 hover:bg-red-400/10 rounded-lg transition-colors"
                            title="Remove admin"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {!isLoading && admins.length === 0 && (
          <div className="text-center py-12 text-muted-foreground">No admins found</div>
        )}
      </div>
    </div>
  );
}
