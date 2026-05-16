/**
 * WalletDApps — WalletConnect v2 dApp connector.
 * Lets users paste or scan a WC URI from ANY web3 site and use
 * Orah Wallet to sign transactions — like a hardware wallet connected remotely.
 */
import { useState, useEffect, useRef, useCallback } from "react";
import {
  Link2, Link2Off, Wifi, WifiOff, Loader2, X, Check, Copy,
  AlertTriangle, ChevronRight, Globe, Scan, Send, KeyRound,
  ShieldCheck, ShieldAlert, RefreshCw, ExternalLink, Zap,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import type { IWeb3Wallet } from "@walletconnect/web3wallet";
import type { SessionTypes, PairingTypes } from "@walletconnect/types";
import {
  getWeb3Wallet,
  buildApprovedNamespaces,
  buildEip155Accounts,
  getSdkError,
  formatJsonRpcError,
  signWithInjected,
  SUPPORTED_EIP155_CHAINS,
  SUPPORTED_METHODS,
  SUPPORTED_EVENTS,
} from "@/lib/wcWallet";

// ── Types ─────────────────────────────────────────────────────────────────────

interface PendingProposal {
  id: number;
  params: {
    id: number;
    pairingTopic: string;
    proposer: { metadata: { name: string; url: string; description: string; icons: string[] } };
    requiredNamespaces: Record<string, unknown>;
    optionalNamespaces: Record<string, unknown>;
  };
}

interface PendingRequest {
  id: number;
  topic: string;
  params: {
    request: { method: string; params: unknown[] };
    chainId: string;
  };
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function shortUri(uri: string) {
  try {
    const u = new URL(uri.replace("wc:", "https://"));
    return u.hostname || uri.slice(0, 30) + "…";
  } catch { return uri.slice(0, 30) + "…"; }
}

function methodLabel(method: string): { label: string; risk: "low" | "medium" | "high" } {
  const map: Record<string, { label: string; risk: "low" | "medium" | "high" }> = {
    personal_sign:        { label: "Sign message",           risk: "low" },
    eth_sign:             { label: "Sign message (legacy)",  risk: "medium" },
    eth_signTypedData:    { label: "Sign typed data",        risk: "medium" },
    eth_signTypedData_v3: { label: "Sign typed data v3",     risk: "medium" },
    eth_signTypedData_v4: { label: "Sign typed data v4",     risk: "medium" },
    eth_sendTransaction:  { label: "Send transaction",       risk: "high" },
    eth_signTransaction:  { label: "Sign transaction",       risk: "high" },
  };
  return map[method] ?? { label: method, risk: "medium" };
}

const RISK_COLOR: Record<string, string> = {
  low:    "text-green-400 bg-green-500/10 border-green-500/30",
  medium: "text-amber-400 bg-amber-500/10 border-amber-500/30",
  high:   "text-red-400   bg-red-500/10   border-red-500/30",
};

// ── Session card ──────────────────────────────────────────────────────────────

function SessionCard({
  session, onDisconnect,
}: {
  session: SessionTypes.Struct;
  onDisconnect: (topic: string) => void;
}) {
  const meta    = session.peer.metadata;
  const chains  = Object.values(session.namespaces).flatMap(ns => (ns as any).chains ?? []);
  const expiry  = new Date(session.expiry * 1000);
  const expired = Date.now() > session.expiry * 1000;

  return (
    <div className={cn(
      "p-3.5 rounded-xl border transition-all",
      expired
        ? "border-[var(--color-border)] opacity-50"
        : "border-blue-500/20 bg-blue-500/5",
    )}>
      <div className="flex items-start gap-3">
        {meta.icons?.[0] ? (
          <img src={meta.icons[0]} alt="" className="w-10 h-10 rounded-xl object-cover shrink-0 border border-[var(--color-border)]" />
        ) : (
          <div className="w-10 h-10 rounded-xl bg-[var(--color-surface)] border border-[var(--color-border)] flex items-center justify-center shrink-0">
            <Globe size={18} className="text-[var(--color-text-secondary)]" />
          </div>
        )}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-semibold text-sm text-[var(--color-text)]">{meta.name}</span>
            {expired
              ? <span className="text-[9px] font-bold uppercase tracking-wide text-red-400 bg-red-500/10 px-1.5 py-0.5 rounded">Expired</span>
              : <span className="text-[9px] font-bold uppercase tracking-wide text-green-400 bg-green-500/10 px-1.5 py-0.5 rounded flex items-center gap-0.5"><Wifi size={7} />Live</span>
            }
          </div>
          <a
            href={meta.url}
            target="_blank"
            rel="noopener noreferrer"
            className="text-[11px] text-blue-400 hover:underline flex items-center gap-0.5 mt-0.5"
          >
            {meta.url} <ExternalLink size={9} />
          </a>
          <p className="text-[10px] text-[var(--color-text-secondary)] mt-0.5">
            {chains.slice(0, 4).join(" · ")}
            {chains.length > 4 ? ` +${chains.length - 4}` : ""}
          </p>
          <p className="text-[10px] text-[var(--color-text-secondary)]">
            Expires {expiry.toLocaleDateString()} {expiry.toLocaleTimeString()}
          </p>
        </div>
        <button
          onClick={() => onDisconnect(session.topic)}
          title="Disconnect"
          className="w-8 h-8 rounded-lg flex items-center justify-center bg-red-500/10 border border-red-500/20 text-red-400 hover:bg-red-500/20 transition-all shrink-0 mt-0.5"
        >
          <Link2Off size={13} />
        </button>
      </div>
    </div>
  );
}

// ── Proposal modal ────────────────────────────────────────────────────────────

function ProposalModal({
  proposal, onApprove, onReject, evmAddress, loading,
}: {
  proposal: PendingProposal;
  onApprove: () => void;
  onReject: () => void;
  evmAddress: string | null;
  loading: boolean;
}) {
  const meta = proposal.params.proposer.metadata;
  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="w-full max-w-sm bg-[var(--color-bg)] border border-[var(--color-border)] rounded-3xl shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="px-5 pt-5 pb-4 border-b border-[var(--color-border)]">
          <div className="flex items-center gap-1 text-[11px] text-[var(--color-text-secondary)] uppercase tracking-wide mb-3">
            <Wifi size={11} className="text-blue-400" /> Connection Request
          </div>
          <div className="flex items-center gap-3">
            {meta.icons?.[0] ? (
              <img src={meta.icons[0]} alt="" className="w-12 h-12 rounded-2xl border border-[var(--color-border)]" />
            ) : (
              <div className="w-12 h-12 rounded-2xl bg-[var(--color-surface)] border border-[var(--color-border)] flex items-center justify-center">
                <Globe size={22} className="text-[var(--color-text-secondary)]" />
              </div>
            )}
            <div>
              <p className="font-bold text-base text-[var(--color-text)]">{meta.name}</p>
              <a href={meta.url} target="_blank" rel="noopener noreferrer" className="text-[11px] text-blue-400 hover:underline flex items-center gap-0.5">
                {meta.url} <ExternalLink size={9} />
              </a>
            </div>
          </div>
          {meta.description && (
            <p className="text-[11px] text-[var(--color-text-secondary)] mt-2 leading-relaxed">{meta.description}</p>
          )}
        </div>

        {/* What's being granted */}
        <div className="px-5 py-4 space-y-3">
          <div className="p-3 rounded-xl bg-[var(--color-surface)] border border-[var(--color-border)]">
            <p className="text-[10px] font-bold uppercase text-[var(--color-text-secondary)] tracking-wide mb-1.5">Connecting wallet</p>
            <p className="font-mono text-xs text-[var(--color-text)] break-all">
              {evmAddress ?? "No EVM address"}
            </p>
          </div>

          <div className="p-3 rounded-xl bg-[var(--color-surface)] border border-[var(--color-border)]">
            <p className="text-[10px] font-bold uppercase text-[var(--color-text-secondary)] tracking-wide mb-1.5">Networks</p>
            <div className="flex flex-wrap gap-1">
              {SUPPORTED_EIP155_CHAINS.slice(0, 6).map(c => (
                <span key={c} className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-blue-500/10 text-blue-400 border border-blue-500/20">
                  {c}
                </span>
              ))}
              <span className="text-[9px] px-1.5 py-0.5 rounded bg-[var(--color-bg)] text-[var(--color-text-secondary)] border border-[var(--color-border)]">+2 more</span>
            </div>
          </div>

          <div className="flex items-start gap-2 p-3 bg-amber-500/5 border border-amber-500/20 rounded-xl">
            <AlertTriangle size={13} className="text-amber-400 shrink-0 mt-0.5" />
            <p className="text-[11px] text-[var(--color-text-secondary)] leading-relaxed">
              This site will be able to request transaction signatures. <strong className="text-[var(--color-text)]">You approve every transaction individually.</strong>
            </p>
          </div>
        </div>

        {/* Buttons */}
        <div className="px-5 pb-5 grid grid-cols-2 gap-3">
          <button
            onClick={onReject}
            disabled={loading}
            className="py-3 rounded-xl border border-[var(--color-border)] text-sm font-semibold text-[var(--color-text)] hover:bg-[var(--color-surface)] transition-all"
          >
            Reject
          </button>
          <button
            onClick={onApprove}
            disabled={loading || !evmAddress}
            className="py-3 rounded-xl bg-blue-500 hover:bg-blue-600 text-white text-sm font-semibold transition-all disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {loading ? <Loader2 size={15} className="animate-spin" /> : <Check size={15} />}
            Connect
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Sign request modal ────────────────────────────────────────────────────────

function SignRequestModal({
  request, sessionMeta, onApprove, onReject, loading,
}: {
  request: PendingRequest;
  sessionMeta: { name: string; url: string; icons: string[] } | null;
  onApprove: () => void;
  onReject: () => void;
  loading: boolean;
}) {
  const { method, params } = request.params.request;
  const { label, risk }    = methodLabel(method);
  const paramsStr          = JSON.stringify(params, null, 2);

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="w-full max-w-sm bg-[var(--color-bg)] border border-[var(--color-border)] rounded-3xl shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="px-5 pt-5 pb-4 border-b border-[var(--color-border)]">
          <div className="flex items-center gap-1 text-[11px] text-[var(--color-text-secondary)] uppercase tracking-wide mb-3">
            <Zap size={11} className="text-amber-400" /> Signature Request
          </div>
          <div className="flex items-center gap-3">
            {sessionMeta?.icons?.[0] ? (
              <img src={sessionMeta.icons[0]} alt="" className="w-10 h-10 rounded-xl border border-[var(--color-border)]" />
            ) : (
              <div className="w-10 h-10 rounded-xl bg-[var(--color-surface)] flex items-center justify-center border border-[var(--color-border)]">
                <Globe size={16} className="text-[var(--color-text-secondary)]" />
              </div>
            )}
            <div>
              <p className="font-bold text-sm text-[var(--color-text)]">{sessionMeta?.name ?? "Unknown dApp"}</p>
              <p className="text-[11px] text-[var(--color-text-secondary)]">{sessionMeta?.url ?? ""}</p>
            </div>
          </div>
        </div>

        <div className="px-5 py-4 space-y-3 max-h-72 overflow-y-auto">
          {/* Method + risk */}
          <div className="flex items-center gap-2">
            <span className={cn("text-xs font-bold px-2 py-1 rounded-lg border", RISK_COLOR[risk])}>
              {label}
            </span>
            <span className="text-[10px] text-[var(--color-text-secondary)] font-mono">{method}</span>
          </div>

          {/* Chain */}
          <div>
            <p className="text-[10px] text-[var(--color-text-secondary)] uppercase font-semibold mb-1">Chain</p>
            <p className="text-xs font-mono text-[var(--color-text)]">{request.params.chainId}</p>
          </div>

          {/* Params preview */}
          <div>
            <p className="text-[10px] text-[var(--color-text-secondary)] uppercase font-semibold mb-1">Request data</p>
            <pre className="text-[10px] font-mono text-[var(--color-text-secondary)] bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-2.5 overflow-x-auto whitespace-pre-wrap break-all max-h-32">
              {paramsStr.length > 800 ? paramsStr.slice(0, 800) + "\n…" : paramsStr}
            </pre>
          </div>

          {risk === "high" && (
            <div className="flex items-start gap-2 p-3 bg-red-500/8 border border-red-500/25 rounded-xl">
              <ShieldAlert size={13} className="text-red-400 shrink-0 mt-0.5" />
              <p className="text-[11px] text-[var(--color-text-secondary)]">
                This will <strong className="text-red-400">broadcast a transaction</strong> to the blockchain. Double-check the site before approving.
              </p>
            </div>
          )}
        </div>

        <div className="px-5 pb-5 grid grid-cols-2 gap-3 border-t border-[var(--color-border)] pt-4">
          <button
            onClick={onReject}
            disabled={loading}
            className="py-3 rounded-xl border border-[var(--color-border)] text-sm font-semibold text-[var(--color-text)] hover:bg-[var(--color-surface)] transition-all"
          >
            Reject
          </button>
          <button
            onClick={onApprove}
            disabled={loading}
            className={cn(
              "py-3 rounded-xl text-white text-sm font-semibold transition-all flex items-center justify-center gap-2",
              risk === "high"
                ? "bg-red-500 hover:bg-red-600 disabled:opacity-50"
                : "bg-blue-500 hover:bg-blue-600 disabled:opacity-50"
            )}
          >
            {loading ? <Loader2 size={15} className="animate-spin" /> : <Check size={15} />}
            {risk === "high" ? "Approve & Send" : "Sign"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export function WalletDApps({ evmAddress }: { evmAddress: string | null }) {
  const { toast } = useToast();

  const walletRef           = useRef<IWeb3Wallet | null>(null);
  const [ready, setReady]   = useState(false);
  const [initErr, setInitErr] = useState<string | null>(null);
  const [sessions, setSessions]               = useState<SessionTypes.Struct[]>([]);
  const [pairings, setPairings]               = useState<PairingTypes.Struct[]>([]);
  const [pendingProposal, setPendingProposal] = useState<PendingProposal | null>(null);
  const [pendingRequest, setPendingRequest]   = useState<PendingRequest | null>(null);
  const [wcUri, setWcUri]   = useState("");
  const [connecting, setConnecting]   = useState(false);
  const [approving, setApproving]     = useState(false);
  const [copiedTopic, setCopiedTopic] = useState<string | null>(null);

  const projectId = import.meta.env.VITE_REOWN_PROJECT_ID as string | undefined;

  const refreshSessions = useCallback((wallet: IWeb3Wallet) => {
    setSessions(Object.values(wallet.getActiveSessions()));
    try {
      const ps = wallet.core.pairing.getPairings();
      setPairings(ps);
    } catch { /* ignore */ }
  }, []);

  // Init Web3Wallet on mount
  useEffect(() => {
    if (!projectId) {
      setInitErr("WalletConnect project ID not configured. Contact the team.");
      return;
    }
    let cancelled = false;

    getWeb3Wallet(projectId)
      .then(wallet => {
        if (cancelled) return;
        walletRef.current = wallet;
        refreshSessions(wallet);
        setReady(true);

        wallet.on("session_proposal", (proposal: any) => {
          if (!cancelled) setPendingProposal(proposal);
        });

        wallet.on("session_request", (event: any) => {
          if (!cancelled) setPendingRequest(event);
        });

        wallet.on("session_delete", () => {
          if (!cancelled && walletRef.current) refreshSessions(walletRef.current);
        });

        wallet.on("session_expire", () => {
          if (!cancelled && walletRef.current) refreshSessions(walletRef.current);
        });
      })
      .catch((e: Error) => {
        if (!cancelled) setInitErr(e.message);
      });

    return () => { cancelled = true; };
  }, [projectId, refreshSessions]);

  // ── Pairing ────────────────────────────────────────────────────────────────
  const handlePair = async () => {
    if (!walletRef.current || !wcUri.trim()) return;
    setConnecting(true);
    try {
      await walletRef.current.core.pairing.pair({ uri: wcUri.trim() });
      setWcUri("");
      toast({ title: "Pairing request sent", description: "Waiting for dApp approval…" });
    } catch (e: any) {
      toast({ title: "Pairing failed", description: e.message ?? "Invalid WalletConnect URI", variant: "destructive" });
    }
    setConnecting(false);
  };

  // ── Approve session proposal ───────────────────────────────────────────────
  const handleApproveSession = async () => {
    if (!walletRef.current || !pendingProposal || !evmAddress) return;
    setApproving(true);
    try {
      const accounts = buildEip155Accounts(evmAddress);
      const namespaces = buildApprovedNamespaces({
        proposal: pendingProposal.params,
        supportedNamespaces: {
          eip155: {
            chains:   SUPPORTED_EIP155_CHAINS,
            methods:  SUPPORTED_METHODS,
            events:   SUPPORTED_EVENTS,
            accounts,
          },
        },
      });
      await walletRef.current.approveSession({ id: pendingProposal.id, namespaces });
      refreshSessions(walletRef.current);
      setPendingProposal(null);
      toast({ title: "dApp connected!", description: pendingProposal.params.proposer.metadata.name });
    } catch (e: any) {
      toast({ title: "Session approval failed", description: e.message, variant: "destructive" });
    }
    setApproving(false);
  };

  const handleRejectSession = async () => {
    if (!walletRef.current || !pendingProposal) return;
    setApproving(true);
    try {
      await walletRef.current.rejectSession({
        id: pendingProposal.id,
        reason: getSdkError("USER_REJECTED"),
      });
    } catch { /* ignore */ }
    setPendingProposal(null);
    setApproving(false);
  };

  // ── Approve sign request ───────────────────────────────────────────────────
  const handleApproveRequest = async () => {
    if (!walletRef.current || !pendingRequest) return;
    setApproving(true);
    const { method, params } = pendingRequest.params.request;
    try {
      const result = await signWithInjected(method, params as unknown[]);
      await walletRef.current.respondSessionRequest({
        topic: pendingRequest.topic,
        response: { id: pendingRequest.id, jsonrpc: "2.0", result },
      });
      setPendingRequest(null);
      toast({ title: "Request signed & sent!" });
    } catch (e: any) {
      // User rejected or signing failed — send error back to dApp
      try {
        await walletRef.current.respondSessionRequest({
          topic: pendingRequest.topic,
          response: formatJsonRpcError(pendingRequest.id, getSdkError("USER_REJECTED")) as any,
        });
      } catch { /* ignore */ }
      setPendingRequest(null);
      toast({ title: "Request rejected", description: e.message, variant: "destructive" });
    }
    setApproving(false);
  };

  const handleRejectRequest = async () => {
    if (!walletRef.current || !pendingRequest) return;
    setApproving(true);
    try {
      await walletRef.current.respondSessionRequest({
        topic: pendingRequest.topic,
        response: formatJsonRpcError(pendingRequest.id, getSdkError("USER_REJECTED")) as any,
      });
    } catch { /* ignore */ }
    setPendingRequest(null);
    setApproving(false);
  };

  // ── Disconnect session ─────────────────────────────────────────────────────
  const handleDisconnect = async (topic: string) => {
    if (!walletRef.current) return;
    try {
      await walletRef.current.disconnectSession({
        topic,
        reason: getSdkError("USER_DISCONNECTED"),
      });
      refreshSessions(walletRef.current);
      toast({ title: "dApp disconnected" });
    } catch (e: any) {
      toast({ title: "Disconnect failed", description: e.message, variant: "destructive" });
    }
  };

  // ── Session peer metadata ──────────────────────────────────────────────────
  const requestSessionMeta = pendingRequest
    ? sessions.find(s => s.topic === pendingRequest.topic)?.peer.metadata ?? null
    : null;

  // ── Render ─────────────────────────────────────────────────────────────────

  if (initErr) {
    return (
      <div className="p-4 rounded-xl border border-red-500/20 bg-red-500/5 flex items-start gap-3">
        <ShieldAlert size={16} className="text-red-400 shrink-0 mt-0.5" />
        <div>
          <p className="font-semibold text-sm text-[var(--color-text)]">WalletConnect unavailable</p>
          <p className="text-xs text-[var(--color-text-secondary)] mt-0.5">{initErr}</p>
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="space-y-4">

        {/* Status bar */}
        <div className={cn(
          "flex items-center gap-2 p-3 rounded-xl border text-xs font-semibold",
          ready
            ? "border-green-500/20 bg-green-500/5 text-green-400"
            : "border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-text-secondary)]"
        )}>
          {ready
            ? <><Wifi size={13} /> WalletConnect v2 ready — {sessions.length} active session{sessions.length !== 1 ? "s" : ""}</>
            : <><Loader2 size={13} className="animate-spin" /> Initialising WalletConnect relay…</>
          }
        </div>

        {/* How it works */}
        <div className="p-3.5 rounded-xl border border-blue-500/15 bg-blue-500/5">
          <p className="text-xs font-semibold text-[var(--color-text)] mb-2 flex items-center gap-1.5">
            <Zap size={12} className="text-blue-400" /> How to connect to any web3 site
          </p>
          <ol className="space-y-1 text-[11px] text-[var(--color-text-secondary)] list-decimal list-inside leading-relaxed">
            <li>Go to any web3 dApp (Uniswap, OpenSea, Aave, etc.)</li>
            <li>Click <strong className="text-[var(--color-text)]">Connect Wallet → WalletConnect</strong></li>
            <li>Copy the WalletConnect URI shown on screen (or scan their QR)</li>
            <li>Paste the URI below and click <strong className="text-[var(--color-text)]">Connect</strong></li>
            <li>Approve the connection — every transaction requires your approval</li>
          </ol>
        </div>

        {/* URI input */}
        <div>
          <p className="text-[10px] font-bold uppercase tracking-wide text-[var(--color-text-secondary)] mb-1.5">
            Paste WalletConnect URI
          </p>
          <div className="flex gap-2">
            <input
              type="text"
              placeholder="wc:xxxxxxxx…@2?relay-protocol=irn&symKey=…"
              value={wcUri}
              onChange={e => setWcUri(e.target.value)}
              className="flex-1 bg-[var(--color-surface)] border border-[var(--color-border)] rounded-xl px-3 py-2.5 text-xs font-mono text-[var(--color-text)] placeholder:text-[var(--color-text-secondary)] outline-none focus:border-blue-500/60 transition-colors"
              onKeyDown={e => e.key === "Enter" && handlePair()}
            />
            <button
              onClick={handlePair}
              disabled={!ready || !wcUri.trim() || connecting}
              className="px-4 py-2.5 rounded-xl bg-blue-500 hover:bg-blue-600 disabled:opacity-40 text-white text-xs font-semibold flex items-center gap-1.5 transition-all shrink-0"
            >
              {connecting
                ? <Loader2 size={13} className="animate-spin" />
                : <Link2 size={13} />}
              {connecting ? "Connecting…" : "Connect"}
            </button>
          </div>
          <p className="text-[10px] text-[var(--color-text-secondary)] mt-1.5 flex items-center gap-1">
            <Scan size={10} />
            Or use the QR scanner on the Exchange page to scan a WalletConnect QR code
          </p>
        </div>

        {!evmAddress && (
          <div className="flex items-start gap-2 p-3 bg-amber-500/8 border border-amber-500/20 rounded-xl">
            <AlertTriangle size={13} className="text-amber-400 shrink-0 mt-0.5" />
            <p className="text-[11px] text-[var(--color-text-secondary)]">
              Connect an EVM wallet first to use WalletConnect dApp sessions.
            </p>
          </div>
        )}

        {/* Active sessions */}
        {sessions.length > 0 && (
          <div>
            <p className="text-[10px] font-bold uppercase tracking-wide text-[var(--color-text-secondary)] mb-2">
              Connected dApps ({sessions.length})
            </p>
            <div className="space-y-2">
              {sessions.map(s => (
                <SessionCard key={s.topic} session={s} onDisconnect={handleDisconnect} />
              ))}
            </div>
          </div>
        )}

        {sessions.length === 0 && ready && (
          <div className="py-10 text-center">
            <div className="w-14 h-14 rounded-2xl bg-[var(--color-surface)] border border-[var(--color-border)] flex items-center justify-center mx-auto mb-3">
              <WifiOff size={24} className="text-[var(--color-text-secondary)]" />
            </div>
            <p className="text-sm font-semibold text-[var(--color-text)]">No connected dApps</p>
            <p className="text-xs text-[var(--color-text-secondary)] mt-1">Paste a WalletConnect URI above to get started</p>
          </div>
        )}

        {/* Security note */}
        <div className="flex items-start gap-2 p-3 border border-[var(--color-border)] rounded-xl">
          <ShieldCheck size={13} className="text-green-400 shrink-0 mt-0.5" />
          <p className="text-[11px] text-[var(--color-text-secondary)] leading-relaxed">
            Your keys never leave this device. Every transaction requires explicit approval.
            You can disconnect any dApp at any time.
          </p>
        </div>
      </div>

      {/* Proposal modal */}
      {pendingProposal && (
        <ProposalModal
          proposal={pendingProposal}
          evmAddress={evmAddress}
          onApprove={handleApproveSession}
          onReject={handleRejectSession}
          loading={approving}
        />
      )}

      {/* Sign request modal */}
      {pendingRequest && (
        <SignRequestModal
          request={pendingRequest}
          sessionMeta={requestSessionMeta}
          onApprove={handleApproveRequest}
          onReject={handleRejectRequest}
          loading={approving}
        />
      )}
    </>
  );
}
