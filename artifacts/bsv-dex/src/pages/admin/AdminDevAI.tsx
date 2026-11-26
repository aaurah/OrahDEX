import { adminFetch } from "@/lib/adminFetch";
import { useState, useEffect, useRef } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Code2, Terminal, Cpu, Zap, RefreshCw, Send, Trash2, Eye, ChevronDown, ChevronUp,
  CheckCircle, XCircle, Activity, MessageSquare,
  Link, Key, Loader2, Bot, Copy, Check, BookOpen, AlertCircle, ShieldCheck,
  GitBranch, FileCode, Clock, Download, Upload, PackageOpen,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { AiRuntimeStatus } from "@/components/AiRuntimeStatus";

const SYSTEM_PROMPT_PREVIEW = `You are OrahDevAI — the developer intelligence of OrahDEX (orahdex.com), a sovereign decentralized exchange built on BSV (Bitcoin SV) settlement.

You are a senior protocol engineer who deeply understands the OrahDEX stack. You help developers build bots, integrations, wallets, and tools on top of OrahDEX.

## OrahDEX REST API (base: https://orahdex.com/api)
GET /api/markets — all listed pairs with price, volume, change
GET /api/markets/:symbol/ticker — single pair ticker
POST /api/orders — place an order
POST /api/swap/quote — get swap quote
...

## Guidelines:
- Always include working, runnable code examples
- Use TypeScript by default; include Python on request
- Show error handling in examples
- Stage source changes for admin review; never write files, execute commands, or publish directly
- Be direct and concise. Skip preamble. Go straight to the code.`;

/* ── CopyButton ─────────────────────────────────────────────────────────────── */
function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      onClick={() => { navigator.clipboard.writeText(text).catch(() => {}); setCopied(true); setTimeout(() => setCopied(false), 2000); }}
      className="flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground transition-colors px-2 py-1 rounded hover:bg-white/5"
    >
      {copied ? <Check className="w-3 h-3 text-green-400" /> : <Copy className="w-3 h-3" />}
      {copied ? "Copied" : "Copy"}
    </button>
  );
}

/* ── Stats Row ──────────────────────────────────────────────────────────────── */
function DevAIStats() {
  const { data, isFetching, refetch } = useQuery({
    queryKey: ["admin-devai-stats"],
    queryFn: async () => {
      const [convR, statsR] = await Promise.all([
        adminFetch(`/api/devai/conversations`),
        adminFetch(`/api/admin/stats`).then(r => r.json()).catch(() => ({})),
      ]);
      const convs = convR.ok ? await convR.json() : [];
      return {
        sessions: convs.length ?? 0,
        messages: statsR.aiMessages ?? "—",
        insights: statsR.aiInsights ?? "—",
        signals:  statsR.aiSignals ?? "—",
      };
    },
    refetchInterval: 30000,
  });

  const cards = [
    { label: "Dev Sessions",     value: data?.sessions ?? "—",  icon: Terminal,      color: "text-green-400 bg-green-400/10" },
    { label: "Messages Sent",    value: data?.messages ?? "—",  icon: MessageSquare, color: "text-blue-400 bg-blue-400/10" },
    { label: "Code Generations", value: data?.insights ?? "—",  icon: Code2,         color: "text-amber-400 bg-amber-400/10" },
    { label: "API Calls",        value: data?.signals ?? "—",   icon: Activity,      color: "text-violet-400 bg-violet-400/10" },
  ];

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
      {cards.map(c => (
        <div key={c.label} className="bg-card border border-border rounded-2xl p-4 flex items-start gap-3">
          <div className={cn("w-9 h-9 rounded-xl flex items-center justify-center shrink-0", c.color)}>
            <c.icon className="w-4 h-4" />
          </div>
          <div>
            <p className="text-xs text-muted-foreground">{c.label}</p>
            <p className="text-2xl font-black font-mono">{typeof c.value === "number" ? c.value.toLocaleString() : c.value}</p>
          </div>
        </div>
      ))}
    </div>
  );
}

/* ── GitHub Status Card ─────────────────────────────────────────────────────── */
function GitHubStatusCard() {
  const queryClient = useQueryClient();
  const [tokenInput, setTokenInput] = useState("");
  const [showToken, setShowToken] = useState(false);
  const [saving, setSaving] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [feedback, setFeedback] = useState<{ ok: boolean; text: string } | null>(null);

  const { data, isFetching, refetch } = useQuery({
    queryKey: ["admin-devai-github"],
    queryFn: async () => {
      const r = await adminFetch(`/api/admin/devai/github`);
      return r.json();
    },
    retry: false,
  });
  const { data: tokenStatus } = useQuery({
    queryKey: ["admin-devai-github-token"],
    queryFn: async () => {
      const r = await adminFetch(`/api/admin/devai/github/token`);
      return r.ok ? r.json() : null;
    },
    retry: false,
  });

  const connected = data?.connected === true;
  const repos: { name: string; full_name: string; private: boolean; language: string | null; updated_at: string }[] = data?.repos ?? [];
  const tokenSource: "env" | "settings" | null = tokenStatus?.source ?? null;
  const tokenConfigured = tokenStatus?.configured === true;
  const canStore = tokenStatus?.canStore !== false;

  const refreshTokenState = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["admin-devai-github-token"] }),
      queryClient.invalidateQueries({ queryKey: ["admin-devai-github"] }),
    ]);
    await refetch();
  };

  const saveToken = async () => {
    const value = tokenInput.trim();
    if (!value) { setFeedback({ ok: false, text: "Paste a GitHub token first." }); return; }
    setSaving(true);
    setFeedback(null);
    try {
      const r = await adminFetch(`/api/admin/devai/github/token`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: value }),
      });
      const body = await r.json().catch(() => ({}));
      if (!r.ok) {
        setFeedback({ ok: false, text: body?.error ?? "Could not save the GitHub token." });
        return;
      }
      setTokenInput("");
      setShowToken(false);
      setFeedback({
        ok: true,
        text: body?.login ? `Token saved — authenticated as ${body.login}.` : "Token saved.",
      });
      await refreshTokenState();
    } catch {
      setFeedback({ ok: false, text: "Network error while saving the GitHub token." });
    } finally {
      setSaving(false);
    }
  };

  const removeToken = async () => {
    setRemoving(true);
    setFeedback(null);
    try {
      const r = await adminFetch(`/api/admin/devai/github/token`, { method: "DELETE" });
      const body = await r.json().catch(() => ({}));
      if (!r.ok) {
        setFeedback({ ok: false, text: body?.error ?? "Could not remove the GitHub token." });
        return;
      }
      setFeedback({ ok: true, text: "Saved token removed." });
      await refreshTokenState();
    } catch {
      setFeedback({ ok: false, text: "Network error while removing the GitHub token." });
    } finally {
      setRemoving(false);
    }
  };

  return (
    <div className="bg-card border border-border rounded-2xl p-5 space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-xl bg-white/8 flex items-center justify-center">
            <Link className="w-4 h-4 text-foreground" />
          </div>
          <div>
            <p className="text-sm font-bold">GitHub Integration</p>
            <p className="text-xs text-muted-foreground">Read files and open draft pull requests from DevAI</p>
          </div>
        </div>
        <button onClick={() => refetch()} disabled={isFetching} className="p-2 rounded-lg hover:bg-white/5 transition-colors text-muted-foreground hover:text-foreground">
          <RefreshCw className={cn("w-4 h-4", isFetching && "animate-spin text-green-400")} />
        </button>
      </div>

      {/* Status badge */}
      <div className={cn(
        "flex items-center gap-3 p-3 rounded-xl border",
        connected ? "bg-green-500/8 border-green-500/20" : "bg-red-500/8 border-red-500/20"
      )}>
        {connected
          ? <CheckCircle className="w-4 h-4 text-green-400 shrink-0" />
          : <XCircle className="w-4 h-4 text-red-400 shrink-0" />}
        <div>
          <p className={cn("text-sm font-semibold", connected ? "text-green-300" : "text-red-300")}>
            {connected ? "Connected" : "Not Connected"}
          </p>
          <p className="text-xs text-muted-foreground">
            {connected
              ? `Authenticated as ${data?.login ?? "unknown"} · ${repos.length} repos accessible`
              : "Add a GitHub token below to enable repo access"}
          </p>
        </div>
      </div>

      {/* Token form */}
      <div className="space-y-2 rounded-xl border border-border/70 bg-white/2 p-3">
        <div className="flex items-center justify-between gap-2">
          <p className="text-xs font-semibold">GitHub token</p>
          {tokenConfigured && (
            <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-green-500/10 border border-green-500/20 text-green-300">
              {tokenSource === "env" ? "environment" : "saved"} {tokenStatus?.hint ?? ""}
            </span>
          )}
        </div>
        <div className="flex gap-2">
          <div className="relative flex-1">
            <input
              type={showToken ? "text" : "password"}
              value={tokenInput}
              onChange={(e) => setTokenInput(e.target.value)}
              placeholder={tokenConfigured ? "Paste a new token to replace it" : "ghp_… or github_pat_…"}
              autoComplete="off"
              spellCheck={false}
              className="w-full bg-black/30 border border-border rounded-lg pl-3 pr-9 py-2 text-xs font-mono focus:outline-none focus:ring-1 focus:ring-green-500/40"
            />
            <button
              type="button"
              onClick={() => setShowToken(v => !v)}
              aria-label={showToken ? "Hide token" : "Show token"}
              className="absolute right-1.5 top-1/2 -translate-y-1/2 p-1 text-muted-foreground hover:text-foreground transition-colors"
            >
              <Eye className="w-3.5 h-3.5" />
            </button>
          </div>
          <button
            onClick={saveToken}
            disabled={saving || !canStore}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-green-500/15 border border-green-500/30 text-green-300 text-xs font-semibold hover:bg-green-500/25 transition-colors disabled:opacity-50"
          >
            {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Key className="w-3.5 h-3.5" />}
            Save
          </button>
          {tokenSource === "settings" && (
            <button
              onClick={removeToken}
              disabled={removing}
              className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-red-500/10 border border-red-500/25 text-red-300 text-xs font-semibold hover:bg-red-500/20 transition-colors disabled:opacity-50"
            >
              {removing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
              Remove
            </button>
          )}
        </div>
        {feedback && (
          <p className={cn("text-[11px] flex items-start gap-1.5", feedback.ok ? "text-green-300" : "text-red-300")}>
            {feedback.ok ? <CheckCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" /> : <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />}
            {feedback.text}
          </p>
        )}
        <p className="text-[10px] text-muted-foreground leading-relaxed">
          {!canStore
            ? "The API server has no DEVAI_GITHUB_SECRET or EVM_WALLET_SECRET set, so a saved token cannot be encrypted at rest. Use GITHUB_TOKEN in the environment instead."
            : tokenSource === "env"
              ? "GITHUB_TOKEN is set in the environment and takes precedence; a saved token is ignored while it exists."
              : "Stored encrypted (AES-256-GCM). Fine-grained token for aaurah/OrahDEX with Contents: read and write and Pull requests: read and write — or a classic token with repo scope. DevAI opens draft pull requests and never pushes to the base branch."}
        </p>
      </div>

      {/* Repos list */}
      {connected && repos.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Accessible Repositories</p>
          <div className="space-y-1.5 max-h-56 overflow-y-auto pr-1">
            {repos.map(repo => (
              <div key={repo.full_name} className="flex items-center gap-2.5 p-2.5 rounded-xl bg-white/3 border border-white/5">
                <GitBranch className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-mono font-semibold text-foreground truncate">{repo.full_name}</p>
                  {repo.language && <p className="text-[10px] text-muted-foreground">{repo.language}</p>}
                </div>
                {repo.private && (
                  <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-amber-400/10 border border-amber-400/20 text-amber-400 uppercase shrink-0">Private</span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {!connected && (
        <div className="flex items-start gap-2.5 bg-amber-500/8 border border-amber-500/25 rounded-xl px-4 py-3">
          <AlertCircle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
          <div>
            <p className="text-xs font-semibold text-amber-300">How to connect</p>
            <p className="text-[11px] text-amber-400/70 mt-0.5">
              Create a token at <span className="font-mono">github.com/settings/tokens</span> with <span className="font-mono">Contents</span> and <span className="font-mono">Pull requests</span> read/write, paste it in the field above and press Save. Alternatively set <span className="font-mono">GITHUB_TOKEN</span> in the environment — DevAI uses it for repo reads and draft pull requests.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

/* ── Model Settings Card ────────────────────────────────────────────────────── */
function DevAIModelSettings() {
  const [showPrompt, setShowPrompt] = useState(false);
  const [pullingModel, setPullingModel] = useState(false);
  const [pullMessage, setPullMessage] = useState("");
  const { data, isFetching, refetch } = useQuery({
    queryKey: ["admin-devai-local-status"],
    queryFn: async () => {
      const response = await adminFetch("/api/admin/devai/status");
      if (!response.ok) throw new Error("Unable to read local model status.");
      return response.json();
    },
    refetchInterval: 30_000,
    retry: false,
  });
  const availableGiB = data?.memory?.availableBytes != null
    ? (data.memory.availableBytes / 1024 ** 3).toFixed(1)
    : null;
  const requiredGiB = data?.minimumModelHeadroomBytes != null
    ? (data.minimumModelHeadroomBytes / 1024 ** 3).toFixed(1)
    : "6";
  const modelReady = data?.ready === true;
  const enoughMemory = data?.memory?.availableBytes != null
    && data.memory.availableBytes >= (data?.minimumModelHeadroomBytes ?? 6 * 1024 ** 3);

  async function pullModel() {
    if (!data?.model || !window.confirm(`Download ${data.model} to this VM? This may use several gigabytes of disk.`)) return;
    setPullingModel(true);
    setPullMessage("");
    try {
      const response = await adminFetch("/api/admin/devai/model/pull", { method: "POST" });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error ?? "Model download failed.");
      setPullMessage(result.message ?? "Model downloaded.");
      await refetch();
    } catch (err: any) {
      setPullMessage(err?.message ?? "Model download failed.");
    } finally {
      setPullingModel(false);
    }
  }

  return (
    <div className="bg-card border border-border rounded-2xl p-5 space-y-4">
      <div className="flex items-center gap-2">
        <div className="w-8 h-8 rounded-xl bg-green-400/10 flex items-center justify-center">
          <Cpu className="w-4 h-4 text-green-400" />
        </div>
        <div>
          <p className="text-sm font-bold">Local Ollama Model</p>
          <p className="text-xs text-muted-foreground">DevAI uses a loopback-only model, not a hosted AI integration</p>
        </div>
        <button onClick={() => refetch()} disabled={isFetching} className="ml-auto p-2 rounded-lg hover:bg-white/5 text-muted-foreground">
          <RefreshCw className={cn("w-4 h-4", isFetching && "animate-spin text-green-400")} />
        </button>
      </div>
      <AiRuntimeStatus />

      <div className={cn(
        "flex items-start gap-3 p-3 rounded-xl border",
        modelReady ? "bg-green-500/8 border-green-500/20" : "bg-amber-500/8 border-amber-500/20"
      )}>
        {modelReady
          ? <CheckCircle className="w-4 h-4 text-green-400 mt-0.5" />
          : <AlertCircle className="w-4 h-4 text-amber-400 mt-0.5" />}
        <div>
          <p className={cn("text-sm font-semibold", modelReady ? "text-green-300" : "text-amber-300")}>
            {modelReady ? "Ollama ready" : "Local model unavailable"}
          </p>
          <p className="text-xs text-muted-foreground mt-1">
            {data?.error ?? (data?.modelAvailable ? "Model is available." : "Waiting for local Ollama and the selected model.")}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2 text-xs">
        <div className="p-3 rounded-xl bg-white/3 border border-white/5">
          <p className="text-muted-foreground">Selected model</p>
            <p className="font-mono mt-1">{data?.model ?? "Checking…"}</p>
            <p className="mt-1 text-muted-foreground">{data?.environment ?? "Unknown runtime"} · {data?.provider ?? "Unknown provider"}</p>
        </div>
        <div className="p-3 rounded-xl bg-white/3 border border-white/5">
          <p className="text-muted-foreground">VM memory available</p>
          <p className="font-mono mt-1">{availableGiB ? `${availableGiB} GiB` : "Unavailable"}</p>
        </div>
      </div>
      <p className="text-xs text-muted-foreground">
        Installed tags: {data?.availableModels?.length ? data.availableModels.join(", ") : "None reported by this API runtime"}.
        {" "}Set ORA_AI_MODEL to the same exact tag as DEVAI_MODEL to share one downloaded model and save disk space.
      </p>

      <p className="text-[11px] text-muted-foreground">
        Ollama autostart: {data?.ollamaAutostartEnabled ? "enabled" : "disabled"} · Model weights stay outside the repository. The runtime requires at least {requiredGiB} GiB available before starting a model.
      </p>
      {!data?.ollamaAutostartEnabled && (
        <p className="text-[11px] text-muted-foreground">
          To enable local inference, set <span className="font-mono">DEVAI_OLLAMA_ENABLED=true</span> for the API service and restart it. Keep it disabled unless this VM has at least {requiredGiB} GiB free after the exchange API has started.
        </p>
      )}
      {data?.ollamaAutostartEnabled && data?.reachable && !data?.modelAvailable && (
        <button
          onClick={pullModel}
          disabled={pullingModel || !enoughMemory}
          className="w-full px-3 py-2.5 rounded-xl bg-green-500/10 border border-green-500/25 text-green-300 text-xs font-semibold disabled:opacity-50"
        >
          {pullingModel ? "Downloading local model…" : enoughMemory ? `Download ${data.model}` : `Need at least ${requiredGiB} GiB free`}
        </button>
      )}
      {pullMessage && <p className="text-xs text-muted-foreground">{pullMessage}</p>}

      {/* System prompt preview */}
      <div>
        <button
          onClick={() => setShowPrompt(p => !p)}
          className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground hover:text-foreground transition-colors"
        >
          <Eye className="w-3.5 h-3.5" />
          {showPrompt ? "Hide" : "View"} DevAI system prompt
          {showPrompt ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
        </button>
        {showPrompt && (
          <div className="mt-2 relative">
            <div className="absolute top-2 right-2">
              <CopyButton text={SYSTEM_PROMPT_PREVIEW} />
            </div>
            <pre className="p-3 pt-8 rounded-xl bg-black/40 border border-white/5 text-xs text-muted-foreground font-mono whitespace-pre-wrap leading-relaxed max-h-64 overflow-y-auto">
              {SYSTEM_PROMPT_PREVIEW}
            </pre>
          </div>
        )}
      </div>
    </div>
  );
}

interface DevAIChangeProposal {
  id: string;
  path: string;
  description: string;
  content: string;
  originalContent: string | null;
  status: "pending" | "approved" | "rejected";
  createdAt: string;
}

function DevAIChangeReviewCard() {
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const { data, isFetching, refetch } = useQuery({
    queryKey: ["admin-devai-change-proposals"],
    queryFn: async () => {
      const response = await adminFetch("/api/admin/devai/change-proposals");
      if (!response.ok) throw new Error("Unable to load change proposals.");
      return response.json();
    },
    refetchInterval: 15_000,
    retry: false,
  });
  const proposals: DevAIChangeProposal[] = data?.proposals ?? [];
  const production = data?.environment === "production";

  async function review(proposal: DevAIChangeProposal, action: "approve" | "reject") {
    if (action === "approve" && !window.confirm(`Apply the reviewed change to ${proposal.path}? This only changes the workspace; it does not publish.`)) return;
    setBusyId(proposal.id);
    setError("");
    try {
      const response = await adminFetch(`/api/admin/devai/change-proposals/${proposal.id}/${action}`, { method: "POST" });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error ?? "Review failed.");
      await refetch();
    } catch (err: any) {
      setError(err?.message ?? "Review failed.");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="bg-card border border-border rounded-2xl p-5 space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-xl bg-amber-400/10 flex items-center justify-center">
            <ShieldCheck className="w-4 h-4 text-amber-400" />
          </div>
          <div>
            <p className="text-sm font-bold">Review Code Changes</p>
            <p className="text-xs text-muted-foreground">DevAI stages changes; only an admin can apply them</p>
          </div>
        </div>
        <button onClick={() => refetch()} disabled={isFetching} className="p-2 rounded-lg hover:bg-white/5 text-muted-foreground">
          <RefreshCw className={cn("w-4 h-4", isFetching && "animate-spin text-green-400")} />
        </button>
      </div>

      {error && <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-xs text-red-300">{error}</div>}
      {production && proposals.some((proposal) => proposal.status === "pending") && (
        <div className="p-3 rounded-xl bg-amber-500/8 border border-amber-500/20 text-xs text-amber-200">
          This is the published site. Review proposals here, but apply them in the Replit workspace before publishing.
        </div>
      )}
      {proposals.length === 0 ? (
        <p className="text-xs text-muted-foreground py-2">No code changes have been proposed.</p>
      ) : (
        <div className="space-y-3">
          {proposals.map((proposal) => (
            <div key={proposal.id} className="rounded-xl border border-white/8 bg-white/2 p-3 space-y-3">
              <div className="flex flex-wrap items-start gap-2">
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-mono break-all">{proposal.path}</p>
                  {proposal.description && <p className="text-xs text-muted-foreground mt-1">{proposal.description}</p>}
                  <p className="text-[10px] text-muted-foreground mt-1">{new Date(proposal.createdAt).toLocaleString()}</p>
                </div>
                <span className={cn(
                  "px-2 py-1 rounded-full text-[10px] uppercase font-bold",
                  proposal.status === "pending" ? "bg-amber-400/10 text-amber-300" :
                    proposal.status === "approved" ? "bg-green-400/10 text-green-300" : "bg-white/10 text-muted-foreground"
                )}>{proposal.status}</span>
              </div>

              {proposal.status === "pending" && (
                <>
                  <button
                    onClick={() => setExpandedId(expandedId === proposal.id ? null : proposal.id)}
                    className="text-xs text-green-300 hover:text-green-200"
                  >
                    {expandedId === proposal.id ? "Hide change" : "Review full change"}
                  </button>
                  {expandedId === proposal.id && (
                    <div className="grid grid-cols-1 xl:grid-cols-2 gap-2">
                      <div>
                        <p className="text-[10px] uppercase tracking-wide text-muted-foreground mb-1">Current</p>
                        <pre className="max-h-72 overflow-auto whitespace-pre-wrap break-words rounded-lg bg-black/30 p-3 text-[10px] font-mono">{proposal.originalContent ?? "(new file)"}</pre>
                      </div>
                      <div>
                        <p className="text-[10px] uppercase tracking-wide text-green-300 mb-1">Proposed</p>
                        <pre className="max-h-72 overflow-auto whitespace-pre-wrap break-words rounded-lg bg-black/30 p-3 text-[10px] font-mono">{proposal.content}</pre>
                      </div>
                    </div>
                  )}
                  <div className="flex justify-end gap-2">
                    <button
                      onClick={() => review(proposal, "reject")}
                      disabled={busyId === proposal.id}
                      className="px-3 py-1.5 rounded-lg border border-red-500/25 text-red-300 text-xs disabled:opacity-50"
                    >Reject</button>
                    <button
                      onClick={() => review(proposal, "approve")}
                      disabled={busyId === proposal.id || production}
                      className="px-3 py-1.5 rounded-lg bg-green-500 text-black font-semibold text-xs disabled:opacity-50"
                    >{production ? "Apply in workspace" : busyId === proposal.id ? "Applying…" : "Approve and apply"}</button>
                  </div>
                </>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ── Chat Tester ────────────────────────────────────────────────────────────── */
function DevAIChatTester() {
  const [convId, setConvId] = useState<number | null>(null);
  const [messages, setMessages] = useState<{ role: string; content: string; status?: string }[]>([]);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages]);
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = Math.min(el.scrollHeight, 120) + "px";
  }, [input]);

  async function send() {
    const q = input.trim();
    if (!q || streaming) return;
    setInput("");
    setMessages(m => [...m, { role: "user", content: q }]);
    setStreaming(true);

    try {
      let cId = convId;
      if (!cId) {
        const r = await adminFetch(`/api/devai/conversations`, { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
        const d = await r.json();
        cId = d.id;
        setConvId(cId);
      }

      setMessages(m => [...m, { role: "assistant", content: "" }]);
      abortRef.current = new AbortController();

      const resp = await adminFetch(`/api/devai/conversations/${cId}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: q }),
        signal: abortRef.current.signal,
      });

      if (!resp.ok) {
        const error = await resp.json().catch(() => ({}));
        throw new Error(error.error ?? "DevAI request failed.");
      }
      if (!resp.body) throw new Error("DevAI stream was unavailable.");
      const reader = resp.body.getReader();
      const dec = new TextDecoder();
      let buf = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        const lines = buf.split("\n");
        buf = lines.pop() ?? "";
        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          try {
            const data = JSON.parse(line.slice(6));
            if (data.done) {
              setMessages(m => m.map((message, index) =>
                index === m.length - 1 ? { ...message, status: undefined } : message
              ));
              break;
            }
            if (data.error) {
              setMessages(m => {
                const copy = [...m];
                copy[copy.length - 1] = { ...copy[copy.length - 1], content: `Error: ${data.error}`, status: undefined };
                return copy;
              });
              continue;
            }
            if (data.status) setMessages(m => {
              const copy = [...m];
              copy[copy.length - 1] = { ...copy[copy.length - 1], status: data.status };
              return copy;
            });
            if (data.tool_call) setMessages(m => {
              const copy = [...m];
              copy[copy.length - 1] = { ...copy[copy.length - 1], status: `Using ${data.tool_call.name}…` };
              return copy;
            });
            if (data.tool_result) setMessages(m => {
              const copy = [...m];
              copy[copy.length - 1] = { ...copy[copy.length - 1], status: "Reviewing exchange results…" };
              return copy;
            });
            if (data.content) setMessages(m => {
              const copy = [...m];
              copy[copy.length - 1] = { ...copy[copy.length - 1], content: copy[copy.length - 1].content + data.content, status: undefined };
              return copy;
            });
          } catch { }
        }
      }
    } catch (err: any) {
      if (err?.name !== "AbortError") {
        setMessages(m => {
          const copy = [...m];
          copy[copy.length - 1] = { ...copy[copy.length - 1], content: `Error: ${err?.message ?? "DevAI request failed."}`, status: undefined };
          return copy;
        });
      } else {
        setMessages(m => {
          const copy = [...m];
          if (copy.length) copy[copy.length - 1] = { ...copy[copy.length - 1], content: copy[copy.length - 1].content || "Stopped.", status: undefined };
          return copy;
        });
      }
    } finally {
      setStreaming(false);
    }
  }

  const reset = () => { setConvId(null); setMessages([]); setInput(""); abortRef.current?.abort(); setStreaming(false); };

  return (
    <div className="bg-card border border-border rounded-2xl overflow-hidden">
      <div className="flex items-center justify-between p-4 border-b border-border">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-xl bg-green-400/10 flex items-center justify-center">
            <Bot className="w-4 h-4 text-green-400" />
          </div>
          <div>
            <p className="text-sm font-bold">DevAI Chat Tester</p>
            <p className="text-xs text-muted-foreground">Live test — connects to the real DevAI backend</p>
          </div>
        </div>
        {messages.length > 0 && (
          <button onClick={reset} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 text-xs text-muted-foreground hover:text-foreground transition-colors">
            <RefreshCw className="w-3 h-3" /> Reset
          </button>
        )}
      </div>

      {/* Messages */}
      <div className="h-64 overflow-y-auto p-4 space-y-3">
        {messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center">
            <Code2 className="w-8 h-8 text-green-400/40 mb-2" />
            <p className="text-sm text-muted-foreground">Send a message to test DevAI</p>
            <div className="flex flex-wrap gap-2 mt-3 justify-center">
              {["Show me the OrahDEX API", "Build a market making bot", "How do I sign a BSV tx?"].map(s => (
                <button key={s} onClick={() => { setInput(s); }} className="text-[11px] px-2.5 py-1 rounded-lg border border-border/50 hover:border-green-500/40 hover:bg-green-500/5 text-muted-foreground hover:text-foreground transition-all">
                  {s}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <>
            {messages.map((m, i) => (
              <div key={i} className={cn("flex gap-2", m.role === "user" ? "justify-end" : "justify-start")}>
                {m.role === "assistant" && (
                  <div className="w-6 h-6 rounded-md flex items-center justify-center shrink-0 mt-0.5" style={{ background: "linear-gradient(135deg, #4ade80, #22c55e)" }}>
                    <Code2 className="w-3 h-3 text-black" />
                  </div>
                )}
                <div className={cn(
                  "max-w-[80%] rounded-xl px-3 py-2 text-xs leading-relaxed",
                  m.role === "user"
                    ? "bg-green-500/15 border border-green-500/25"
                    : "bg-muted/30 border border-border/40"
                )}>
                  {m.content
                    ? <pre className="whitespace-pre-wrap font-sans">{m.content}</pre>
                    : <span className="flex items-center gap-2 text-muted-foreground"><Loader2 className="w-3 h-3 animate-spin text-green-400" />{m.status ?? "Thinking…"}</span>}
                </div>
              </div>
            ))}
            <div ref={bottomRef} />
          </>
        )}
      </div>

      {/* Input */}
      <div className="p-3 border-t border-border/50">
        <div className="flex items-end gap-2 bg-muted/20 border border-border/50 rounded-xl px-3 py-2 focus-within:border-green-500/40 transition-colors">
          <textarea
            ref={textareaRef}
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }}
            placeholder="Ask DevAI anything..."
            rows={1}
            className="flex-1 bg-transparent resize-none outline-none text-xs placeholder:text-muted-foreground min-h-[20px] max-h-[120px] leading-5"
            style={{ overflowY: "auto" }}
          />
          {streaming
            ? <button onClick={() => { abortRef.current?.abort(); }} className="shrink-0 w-7 h-7 rounded-lg bg-red-500/20 border border-red-500/30 flex items-center justify-center text-red-400 hover:bg-red-500/30 transition-colors"><XCircle className="w-3.5 h-3.5" /></button>
            : <button onClick={send} disabled={!input.trim()} className="shrink-0 w-7 h-7 rounded-lg bg-green-500 flex items-center justify-center text-black hover:bg-green-400 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"><Send className="w-3 h-3" /></button>}
        </div>
      </div>
    </div>
  );
}

/* ── Session Manager ────────────────────────────────────────────────────────── */
function DevAISessionManager() {
  const qc = useQueryClient();
  const { data: sessions = [], isFetching, refetch } = useQuery({
    queryKey: ["admin-devai-sessions"],
    queryFn: async () => {
      const r = await adminFetch(`/api/devai/conversations`);
      return r.ok ? r.json() : [];
    },
  });

  async function deleteSession(id: number) {
    await adminFetch(`/api/devai/conversations/${id}`, { method: "DELETE" });
    qc.invalidateQueries({ queryKey: ["admin-devai-sessions"] });
    qc.invalidateQueries({ queryKey: ["admin-devai-stats"] });
  }

  async function deleteAll() {
    if (!sessions.length) return;
    await Promise.all(sessions.map((s: any) => adminFetch(`/api/devai/conversations/${s.id}`, { method: "DELETE" })));
    qc.invalidateQueries({ queryKey: ["admin-devai-sessions"] });
    qc.invalidateQueries({ queryKey: ["admin-devai-stats"] });
  }

  return (
    <div className="bg-card border border-border rounded-2xl p-5 space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-xl bg-blue-400/10 flex items-center justify-center">
            <FileCode className="w-4 h-4 text-blue-400" />
          </div>
          <div>
            <p className="text-sm font-bold">Dev Sessions</p>
            <p className="text-xs text-muted-foreground">{sessions.length} conversation{sessions.length !== 1 ? "s" : ""} stored</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => refetch()} disabled={isFetching} className="p-2 rounded-lg hover:bg-white/5 transition-colors text-muted-foreground hover:text-foreground">
            <RefreshCw className={cn("w-3.5 h-3.5", isFetching && "animate-spin text-green-400")} />
          </button>
          {sessions.length > 0 && (
            <button
              onClick={deleteAll}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-red-400/10 hover:bg-red-400/20 border border-red-400/20 text-red-400 text-xs font-semibold transition-colors"
            >
              <Trash2 className="w-3 h-3" /> Clear all
            </button>
          )}
        </div>
      </div>

      {sessions.length === 0 ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground py-3">
          <AlertCircle className="w-4 h-4" /> No sessions yet
        </div>
      ) : (
        <div className="space-y-1.5 max-h-72 overflow-y-auto pr-1">
          {sessions.map((s: { id: number; title: string; createdAt: string }) => (
            <div key={s.id} className="flex items-center gap-3 p-3 rounded-xl bg-white/3 border border-white/5 group">
              <Terminal className="w-3.5 h-3.5 text-green-400 shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-xs font-semibold text-foreground truncate">{s.title}</p>
                <div className="flex items-center gap-1 mt-0.5">
                  <Clock className="w-2.5 h-2.5 text-muted-foreground" />
                  <p className="text-[10px] text-muted-foreground">{new Date(s.createdAt).toLocaleString()}</p>
                </div>
              </div>
              <span className="text-[10px] font-mono text-muted-foreground bg-white/5 px-1.5 py-0.5 rounded">#{s.id}</span>
              <button
                onClick={() => deleteSession(s.id)}
                className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-red-400 transition-all shrink-0"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ── Access & Auth Card ─────────────────────────────────────────────────────── */
function DevAIAccessCard() {
  return (
    <div className="bg-card border border-border rounded-2xl p-5 space-y-4">
      <div className="flex items-center gap-2">
        <div className="w-8 h-8 rounded-xl bg-violet-400/10 flex items-center justify-center">
          <ShieldCheck className="w-4 h-4 text-violet-400" />
        </div>
        <div>
          <p className="text-sm font-bold">Access & Endpoints</p>
          <p className="text-xs text-muted-foreground">DevAI API surface</p>
        </div>
      </div>

      <div className="space-y-2">
        {[
          { method: "GET",    path: "/api/devai/conversations",           desc: "List all sessions" },
          { method: "POST",   path: "/api/devai/conversations",           desc: "Create session" },
          { method: "GET",    path: "/api/devai/conversations/:id",       desc: "Load session + messages" },
          { method: "POST",   path: "/api/devai/conversations/:id/messages", desc: "Stream message (SSE)" },
          { method: "DELETE", path: "/api/devai/conversations/:id",       desc: "Delete session" },
          { method: "GET",    path: "/admin/devai",                       desc: "Admin settings (this page)" },
        ].map(ep => {
          const colors: Record<string, string> = {
            GET: "text-blue-400 bg-blue-500/10",
            POST: "text-green-400 bg-green-500/10",
            DELETE: "text-red-400 bg-red-500/10",
          };
          return (
            <div key={ep.path} className="flex items-center gap-3 p-2.5 rounded-xl bg-white/3 border border-white/5">
              <span className={cn("text-[10px] font-mono font-bold px-1.5 py-0.5 rounded shrink-0", colors[ep.method] ?? "text-muted-foreground bg-muted/30")}>
                {ep.method}
              </span>
              <div className="min-w-0 flex-1">
                <p className="font-mono text-[10px] text-foreground/80 truncate">{ep.path}</p>
                <p className="text-[10px] text-muted-foreground">{ep.desc}</p>
              </div>
            </div>
          );
        })}
      </div>

      <div className="flex items-start gap-2.5 bg-green-500/8 border border-green-500/20 rounded-xl px-4 py-3">
        <Key className="w-4 h-4 text-green-400 shrink-0 mt-0.5" />
        <p className="text-[11px] text-green-400/80">
          DevAI API routes require an admin session. Code changes are staged for review; public users cannot read sessions, project files, or private data, and DevAI cannot execute shell commands or publish.
        </p>
      </div>
    </div>
  );
}

/* ── Restart Services Card ──────────────────────────────────────────────────── */
function RestartServicesCard() {
  const [state, setState] = useState<"idle" | "restarting" | "done" | "error">("idle");
  const [error, setError] = useState("");

  async function restart(target: "api" | "frontend" | "all") {
    setState("restarting");
    setError("");
    try {
      if (target === "api" || target === "all") {
        const response = await adminFetch(`/api/admin/devai/restart`, { method: "POST" });
        if (!response.ok) {
          const result = await response.json().catch(() => ({}));
          throw new Error(result.error ?? "API restart failed.");
        }
      }
      if (target === "frontend" || target === "all") {
        const response = await adminFetch(`/api/admin/devai/run-terminal`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ command: "pkill -f 'vite' 2>/dev/null; true", description: "Restart frontend" }),
        });
        if (!response.ok) {
          const result = await response.json().catch(() => ({}));
          throw new Error(result.error ?? "Frontend restart failed.");
        }
      }
      setState("done");
      setTimeout(() => setState("idle"), 5000);
    } catch (err: any) {
      setError(err?.message ?? "Restart failed.");
      setState("error");
    }
  }

  return (
    <div className="bg-card border border-border rounded-2xl p-5 space-y-4">
      <div className="flex items-center gap-2">
        <div className="w-8 h-8 rounded-xl bg-green-400/10 flex items-center justify-center">
          <Zap className="w-4 h-4 text-green-400" />
        </div>
        <div>
          <p className="text-sm font-bold">Restart Development Services</p>
          <p className="text-xs text-muted-foreground">Available only in the Replit workspace, not on the published site</p>
        </div>
      </div>

      <div className="flex items-start gap-2.5 bg-green-500/8 border border-green-500/20 rounded-xl px-4 py-3">
        <Activity className="w-4 h-4 text-green-400 shrink-0 mt-0.5" />
        <p className="text-[11px] text-green-400/80">
          Frontend (.tsx) changes hot-reload instantly. Backend changes (routes, tools, system prompt) need an API restart — the workflow manager brings it back up in ~5 seconds.
        </p>
      </div>

      {state === "done" && (
        <div className="flex items-center gap-2 px-3 py-2.5 rounded-xl bg-green-500/10 border border-green-500/20 text-green-400 text-[11px] font-medium">
          <CheckCircle className="w-3.5 h-3.5 shrink-0" /> Services restarting — changes live in ~5 seconds
        </div>
      )}
      {state === "error" && (
        <div className="px-3 py-2.5 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-200 text-[11px]">
          {error}
        </div>
      )}

      <div className="grid grid-cols-3 gap-2">
        {[
          { label: "API only",      target: "api"      as const, color: "text-blue-400 border-blue-500/20 bg-blue-500/8 hover:bg-blue-500/15" },
          { label: "Frontend only", target: "frontend" as const, color: "text-violet-400 border-violet-500/20 bg-violet-500/8 hover:bg-violet-500/15" },
          { label: "Restart all",   target: "all"      as const, color: "text-green-400 border-green-500/20 bg-green-500/8 hover:bg-green-500/15" },
        ].map(btn => (
          <button
            key={btn.target}
            onClick={() => restart(btn.target)}
            disabled={state === "restarting"}
            className={cn(
              "flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-xl border font-semibold text-xs transition-colors disabled:opacity-50",
              btn.color
            )}
          >
            {state === "restarting"
              ? <RefreshCw className="w-3 h-3 animate-spin" />
              : <Zap className="w-3 h-3" />
            }
            {btn.label}
          </button>
        ))}
      </div>
    </div>
  );
}

/* ── Workspace Export Card ──────────────────────────────────────────────────── */
function WorkspaceExportCard() {
  const [exporting, setExporting] = useState(false);

  async function doExport() {
    setExporting(true);
    try {
      const r = await adminFetch(`/api/admin/devai/export`);
      if (!r.ok) { alert("Export failed: " + await r.text()); return; }
      const blob = await r.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      const date = new Date().toISOString().slice(0, 10);
      a.download = `orahdex-workspace-${date}.tar.gz`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err: any) {
      alert("Export error: " + err?.message);
    } finally {
      setExporting(false);
    }
  }

  return (
    <div className="bg-card border border-border rounded-2xl p-5 space-y-4">
      <div className="flex items-center gap-2">
        <div className="w-8 h-8 rounded-xl bg-cyan-400/10 flex items-center justify-center">
          <Download className="w-4 h-4 text-cyan-400" />
        </div>
        <div>
          <p className="text-sm font-bold">Export Workspace</p>
          <p className="text-xs text-muted-foreground">Download full project as tar.gz (excludes node_modules, .git)</p>
        </div>
      </div>
      <div className="flex items-start gap-2.5 bg-cyan-500/8 border border-cyan-500/20 rounded-xl px-4 py-3">
        <PackageOpen className="w-4 h-4 text-cyan-400 shrink-0 mt-0.5" />
        <p className="text-[11px] text-cyan-400/80">
          Streams the live Replit workspace as a compressed archive. Use to back up, migrate, or share the full OrahDEX codebase. Excludes node_modules, .git, dist, and log files.
        </p>
      </div>
      <button
        onClick={doExport}
        disabled={exporting}
        className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-cyan-500/10 hover:bg-cyan-500/20 border border-cyan-500/20 text-cyan-400 font-semibold text-sm transition-colors disabled:opacity-50"
      >
        {exporting ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
        {exporting ? "Generating archive…" : "Download workspace.tar.gz"}
      </button>
    </div>
  );
}

/* ── Workspace Upload Card ──────────────────────────────────────────────────── */
function WorkspaceUploadCard() {
  const [uploading, setUploading] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  async function doUpload(file: File) {
    setUploading(true);
    setResult(null);
    try {
      const r = await adminFetch(`/api/admin/devai/upload`, {
        method: "POST",
        headers: { "Content-Type": "application/gzip" },
        body: file,
      });
      const json = await r.json();
      if (r.ok) setResult({ ok: true, message: json.message ?? "Extracted successfully" });
      else setResult({ ok: false, message: json.error ?? "Upload failed" });
    } catch (err: any) {
      setResult({ ok: false, message: err?.message ?? "Network error" });
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="bg-card border border-border rounded-2xl p-5 space-y-4">
      <div className="flex items-center gap-2">
        <div className="w-8 h-8 rounded-xl bg-orange-400/10 flex items-center justify-center">
          <Upload className="w-4 h-4 text-orange-400" />
        </div>
        <div>
          <p className="text-sm font-bold">Upload tar.gz</p>
          <p className="text-xs text-muted-foreground">Extract an archive into the workspace</p>
        </div>
      </div>
      <div className="flex items-start gap-2.5 bg-orange-500/8 border border-orange-500/20 rounded-xl px-4 py-3">
        <Upload className="w-4 h-4 text-orange-400 shrink-0 mt-0.5" />
        <p className="text-[11px] text-orange-400/80">
          Upload a .tar.gz archive and extract it directly into /home/runner/workspace. Files are merged — existing files with the same path will be overwritten.
        </p>
      </div>
      <input
        ref={inputRef}
        type="file"
        accept=".tar.gz,.tgz"
        className="hidden"
        onChange={e => { const f = e.target.files?.[0]; if (f) doUpload(f); e.target.value = ""; }}
      />
      <button
        onClick={() => inputRef.current?.click()}
        disabled={uploading}
        className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-orange-500/10 hover:bg-orange-500/20 border border-orange-500/20 text-orange-400 font-semibold text-sm transition-colors disabled:opacity-50"
      >
        {uploading ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
        {uploading ? "Extracting…" : "Choose .tar.gz file"}
      </button>
      {result && (
        <div className={cn(
          "flex items-start gap-2 px-3 py-2.5 rounded-xl text-[11px] font-medium",
          result.ok ? "bg-green-500/10 border border-green-500/20 text-green-400" : "bg-red-500/10 border border-red-500/20 text-red-400"
        )}>
          {result.ok ? <CheckCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" /> : <XCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />}
          {result.message}
        </div>
      )}
    </div>
  );
}

/* ── Main Page ──────────────────────────────────────────────────────────────── */
export function AdminDevAI() {
  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-2xl flex items-center justify-center shrink-0" style={{ background: "linear-gradient(135deg, #4ade80, #22c55e)" }}>
          <Code2 className="w-5 h-5 text-black" />
        </div>
        <div>
          <h1 className="text-xl font-black">DevAI Settings</h1>
          <p className="text-sm text-muted-foreground">Developer Intelligence — model config, GitHub integration, session management</p>
        </div>
      </div>

      {/* Stats */}
      <DevAIStats />

      {/* Main grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <DevAIModelSettings />
        <GitHubStatusCard />
      </div>

      {/* Chat tester */}
      <DevAIChatTester />

      {/* Reviewable source changes */}
      <DevAIChangeReviewCard />

      {/* Sessions + Access */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <DevAISessionManager />
        <DevAIAccessCard />
      </div>

      {/* Workspace tools */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <WorkspaceExportCard />
        <WorkspaceUploadCard />
      </div>

      {/* Publish / restart */}
      <RestartServicesCard />
    </div>
  );
}
