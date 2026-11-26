import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import {
  AlertTriangle, ArrowLeft, BookOpen, Check, Code2, Copy, Eye, EyeOff,
  Globe, Key, Lock, Plus, RefreshCw, ShieldCheck, Trash2, X, Zap,
} from "lucide-react";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { useWalletStore } from "@/store/useWalletStore";
import { useWalletModalStore } from "@/store/useWalletModalStore";
import { walletRequestAuthHeaders } from "@/lib/walletRequestAuth";
import { API_BASE } from "@/lib/api";
import { useLocation } from "wouter";
import { cn } from "@/lib/utils";

type Permission = "read" | "trading" | "full";
type UserApiKey = {
  id: string;
  name: string;
  permission: Permission;
  rateLimit: number;
  keyPreview: string;
  status: "active" | "revoked";
  createdAt: string;
  lastUsedAt: string | null;
};

const keyFormSchema = z.object({
  name: z.string().trim().min(1, "Enter a name for this key.").max(100, "Name must be 100 characters or fewer."),
  permission: z.enum(["read", "trading", "full"]),
  rateLimit: z.number().int().min(10).max(200),
});
type KeyFormValues = z.infer<typeof keyFormSchema>;
const DEFAULT_FORM: KeyFormValues = { name: "", permission: "read", rateLimit: 100 };

const PERMISSIONS: Array<{
  id: Permission;
  label: string;
  desc: string;
  color: string;
  icon: typeof Globe;
}> = [
  { id: "read", label: "Read Only", desc: "Market data and read-only API calls", color: "#22c55e", icon: Globe },
  { id: "trading", label: "Trading", desc: "Place or cancel signed orders", color: "#6366f1", icon: Zap },
  { id: "full", label: "Full Access", desc: "Supported account actions; sensitive actions still need wallet signatures", color: "#f59e0b", icon: ShieldCheck },
];

const SUPPORTED_NETWORKS = new Set(["evm", "bsv", "bsv-test", "sol"]);
const queryKeyFor = (address: string | null) => ["user-api-keys", address] as const;

async function responseJson<T>(response: Response): Promise<T> {
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(body?.error ?? `Request failed (${response.status}).`);
  }
  return body as T;
}

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : "Something went wrong. Please try again.";
}

export function UserApiKeysSecure() {
  const { address, network, provider } = useWalletStore();
  const { open: openWallet } = useWalletModalStore();
  const [, navigate] = useLocation();
  const queryClient = useQueryClient();
  const [showAdd, setShowAdd] = useState(false);
  const [revealedKey, setRevealedKey] = useState<string | null>(null);
  const [showRevealedKey, setShowRevealedKey] = useState(true);
  const [copied, setCopied] = useState<string | null>(null);
  const [copyError, setCopyError] = useState("");
  const canSign = Boolean(address && network && SUPPORTED_NETWORKS.has(network));
  const apiBase = API_BASE.startsWith("http") ? API_BASE : `${window.location.origin}${API_BASE}`;
  const form = useForm<KeyFormValues>({
    resolver: zodResolver(keyFormSchema),
    defaultValues: DEFAULT_FORM,
    mode: "onChange",
  });

  useEffect(() => {
    setRevealedKey(null);
    setShowRevealedKey(true);
    setCopied(null);
  }, [address, network]);

  const keysQuery = useQuery({
    queryKey: queryKeyFor(address),
    enabled: canSign,
    staleTime: 30_000,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    queryFn: async () => {
      if (!address || !network) throw new Error("Connect a supported wallet first.");
      const authHeaders = await walletRequestAuthHeaders({
        address,
        network,
        provider: provider ?? undefined,
        resource: "personal-api-keys",
        method: "GET",
      });
      const response = await fetch(
        `${API_BASE}/user/api-keys?walletAddress=${encodeURIComponent(address)}`,
        { headers: authHeaders, cache: "no-store" },
      );
      const body = await responseJson<{ keys: UserApiKey[] }>(response);
      if (!Array.isArray(body.keys)) throw new Error("The API returned an unexpected key list.");
      return body.keys;
    },
  });

  const addKey = useMutation({
    mutationFn: async (values: KeyFormValues) => {
      if (!address || !network) throw new Error("Connect a supported wallet first.");
      const context = {
        name: values.name.trim(),
        permission: values.permission,
        rateLimit: values.rateLimit,
      };
      const authHeaders = await walletRequestAuthHeaders({
        address,
        network,
        provider: provider ?? undefined,
        resource: "personal-api-keys",
        method: "POST",
        context,
      });
      const response = await fetch(`${API_BASE}/user/api-keys`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders },
        body: JSON.stringify({ walletAddress: address, ...context }),
        cache: "no-store",
      });
      return responseJson<{ key: string; apiKey: UserApiKey; oneTimeReveal: true }>(response);
    },
    onSuccess: (result) => {
      queryClient.setQueryData<UserApiKey[]>(queryKeyFor(address), (current = []) => [
        result.apiKey,
        ...current.filter((key) => key.id !== result.apiKey.id),
      ]);
      setRevealedKey(result.key);
      setShowRevealedKey(true);
      setShowAdd(false);
      form.reset(DEFAULT_FORM);
    },
  });

  const revokeKey = useMutation({
    mutationFn: async (id: string) => {
      if (!address || !network) throw new Error("Connect a supported wallet first.");
      const authHeaders = await walletRequestAuthHeaders({
        address,
        network,
        provider: provider ?? undefined,
        resource: "personal-api-keys",
        method: "DELETE",
        resourceId: id,
      });
      const response = await fetch(
        `${API_BASE}/user/api-keys/${encodeURIComponent(id)}?walletAddress=${encodeURIComponent(address)}`,
        { method: "DELETE", headers: authHeaders, cache: "no-store" },
      );
      await responseJson<{ success: true }>(response);
      return id;
    },
    onSuccess: (id) => {
      queryClient.setQueryData<UserApiKey[]>(queryKeyFor(address), (current = []) =>
        current.map((key) => key.id === id ? { ...key, status: "revoked" } : key),
      );
    },
  });

  const copyText = async (text: string, id: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopyError("");
      setCopied(id);
      window.setTimeout(() => setCopied((current) => current === id ? null : current), 2000);
    } catch {
      setCopyError("Clipboard access failed. Select and copy the value manually.");
    }
  };

  const keys = keysQuery.data ?? [];
  const activeKeys = keys.filter((key) => key.status === "active");
  const requestError = keysQuery.error ? errorText(keysQuery.error) : "";
  const mutationError = addKey.error ? errorText(addKey.error) : revokeKey.error ? errorText(revokeKey.error) : "";

  return (
    <div className="min-h-screen bg-background">
      <div className="sticky top-0 z-10 bg-background/80 backdrop-blur-sm border-b border-border px-4 py-3 flex items-center gap-3">
        <button
          type="button"
          data-testid="button-back-settings"
          onClick={() => navigate("/settings")}
          className="p-2 rounded-xl hover:bg-secondary/50 text-muted-foreground"
          aria-label="Back to settings"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div>
          <h1 className="text-base font-bold">API Access</h1>
          <p className="text-[11px] text-muted-foreground">Manage personal API keys for bots and integrations</p>
        </div>
      </div>

      <div className="px-4 py-5 space-y-5 max-w-lg mx-auto">
        {!address && (
          <div className="bg-card border border-border rounded-2xl p-6 text-center space-y-3">
            <div className="w-12 h-12 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto">
              <Lock className="w-6 h-6 text-primary" />
            </div>
            <p className="font-semibold">Connect your wallet</p>
            <p className="text-sm text-muted-foreground">A signed message verifies wallet ownership. It does not submit a transaction.</p>
            <button
              type="button"
              data-testid="button-connect-wallet"
              onClick={() => openWallet()}
              className="w-full bg-primary text-primary-foreground py-3 rounded-xl font-semibold text-sm"
            >
              Connect Wallet
            </button>
          </div>
        )}

        {address && !canSign && (
          <div className="flex gap-3 p-4 bg-amber-500/5 border border-amber-500/20 rounded-2xl" data-testid="status-unsupported-wallet">
            <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
            <p className="text-xs text-muted-foreground">
              This wallet cannot sign API-key ownership challenges yet. Switch to an EVM, BSV, or Solana wallet to manage keys.
            </p>
          </div>
        )}

        {address && canSign && (
          <>
            <div className="bg-card border border-border rounded-2xl p-4 space-y-3">
              <div className="flex items-center gap-2">
                <Code2 className="w-4 h-4 text-primary" />
                <p className="text-sm font-semibold">API Endpoint</p>
              </div>
              <div className="bg-secondary/60 rounded-xl px-3 py-2.5 flex items-center justify-between gap-2">
                <code className="text-xs font-mono text-green-400 truncate" data-testid="text-api-base">{apiBase}</code>
                <button
                  type="button"
                  data-testid="button-copy-api-base"
                  onClick={() => void copyText(apiBase, "base")}
                  className="text-muted-foreground hover:text-primary shrink-0"
                  aria-label="Copy API endpoint"
                >
                  {copied === "base" ? <Check className="w-3.5 h-3.5 text-green-400" /> : <Copy className="w-3.5 h-3.5" />}
                </button>
              </div>
              <div className="grid grid-cols-3 gap-2 text-center">
                {[
                  { label: "Markets", path: "/markets" },
                  { label: "Ticker", path: "/markets/:symbol/ticker" },
                  { label: "Order Book", path: "/markets/:symbol/orderbook" },
                ].map((endpoint) => (
                  <div key={endpoint.label} className="bg-secondary/40 rounded-xl p-2">
                    <p className="text-[10px] text-muted-foreground">{endpoint.label}</p>
                    <code className="text-[9px] font-mono text-primary block mt-0.5 truncate">{endpoint.path}</code>
                  </div>
                ))}
              </div>
            </div>

            {revealedKey && (
              <div className="bg-green-500/5 border border-green-500/25 rounded-2xl p-4 space-y-3" data-testid="status-key-created">
                <div className="flex items-center gap-2">
                  <Check className="w-4 h-4 text-green-400" />
                  <p className="text-sm font-semibold">API key created</p>
                </div>
                <p className="text-xs text-muted-foreground">
                  This is the only time the full key will be shown. Copy it now; closing or leaving this page hides it permanently.
                </p>
                <div className="flex items-center gap-2 bg-secondary/60 rounded-xl px-3 py-2.5">
                  <code className="text-xs font-mono text-green-400 flex-1 break-all" data-testid="text-new-api-key">
                    {showRevealedKey ? revealedKey : "••••••••••••••••••••••••••••••••"}
                  </code>
                  <button
                    type="button"
                    data-testid="button-toggle-key-visibility"
                    onClick={() => setShowRevealedKey((visible) => !visible)}
                    className="text-muted-foreground hover:text-foreground shrink-0"
                    aria-label={showRevealedKey ? "Hide API key" : "Show API key"}
                  >
                    {showRevealedKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                  <button
                    type="button"
                    data-testid="button-copy-new-api-key"
                    onClick={() => void copyText(revealedKey, "new-key")}
                    className="text-muted-foreground hover:text-primary shrink-0"
                    aria-label="Copy new API key"
                  >
                    {copied === "new-key" ? <Check className="w-4 h-4 text-green-400" /> : <Copy className="w-4 h-4" />}
                  </button>
                </div>
                <button
                  type="button"
                  data-testid="button-dismiss-new-key"
                  onClick={() => setRevealedKey(null)}
                  className="text-xs text-muted-foreground hover:text-foreground underline"
                >
                  Hide this key now
                </button>
                {copyError && <p className="text-xs text-red-400" role="alert" data-testid="status-copy-error">{copyError}</p>}
              </div>
            )}

            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-widest">
                  Your Keys ({activeKeys.length} active)
                </p>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    data-testid="button-refresh-api-keys"
                    onClick={() => void keysQuery.refetch()}
                    disabled={keysQuery.isFetching}
                    className="p-2 rounded-xl text-muted-foreground hover:text-primary disabled:opacity-50"
                    aria-label="Refresh API keys"
                  >
                    <RefreshCw className={cn("w-4 h-4", keysQuery.isFetching && "animate-spin")} />
                  </button>
                  <button
                    type="button"
                    data-testid="button-add-api-key"
                    onClick={() => { addKey.reset(); form.reset(DEFAULT_FORM); setShowAdd(true); }}
                    disabled={!canSign}
                    className="flex items-center gap-1.5 bg-primary text-primary-foreground px-3 py-1.5 rounded-xl text-xs font-semibold disabled:opacity-50"
                  >
                    <Plus className="w-3.5 h-3.5" /> New Key
                  </button>
                </div>
              </div>

              {mutationError && (
                <div className="flex gap-3 p-4 bg-red-500/5 border border-red-500/20 rounded-2xl" role="alert" data-testid="status-api-key-mutation-error">
                  <AlertTriangle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
                  <p className="text-xs text-muted-foreground">{mutationError}</p>
                </div>
              )}

              {requestError && (
                <div className="flex gap-3 p-4 bg-red-500/5 border border-red-500/20 rounded-2xl" role="alert" data-testid="status-api-key-load-error">
                  <AlertTriangle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
                  <div className="flex-1">
                    <p className="text-xs text-muted-foreground">{requestError}</p>
                    <button type="button" onClick={() => void keysQuery.refetch()} className="mt-2 text-xs text-primary underline">
                      Try again
                    </button>
                  </div>
                </div>
              )}

              {keysQuery.isLoading ? (
                <div className="h-24 bg-card border border-border rounded-2xl animate-pulse" data-testid="status-api-keys-loading" />
              ) : !requestError && keys.length === 0 ? (
                <div className="bg-card border border-border rounded-2xl p-8 text-center space-y-2" data-testid="status-api-keys-empty">
                  <Key className="w-8 h-8 text-muted-foreground/40 mx-auto" />
                  <p className="text-sm font-medium">No API keys yet</p>
                  <p className="text-xs text-muted-foreground">Create a key to connect a bot or integration.</p>
                </div>
              ) : (
                keys.map((key) => {
                  const permission = PERMISSIONS.find((item) => item.id === key.permission) ?? PERMISSIONS[0]!;
                  return (
                    <div
                      key={key.id}
                      data-testid={`card-api-key-${key.id}`}
                      className={cn("bg-card border border-border rounded-2xl p-4 space-y-3", key.status === "revoked" && "opacity-50")}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-semibold text-sm">{key.name}</span>
                            <span
                              className="text-[10px] font-bold px-1.5 py-0.5 rounded-full uppercase"
                              style={{ backgroundColor: `${permission.color}20`, color: permission.color }}
                            >
                              {permission.label}
                            </span>
                            <span className={cn(
                              "text-[10px] font-bold px-1.5 py-0.5 rounded-full uppercase",
                              key.status === "active" ? "bg-green-400/10 text-green-400" : "bg-red-400/10 text-red-400",
                            )}>
                              {key.status}
                            </span>
                          </div>
                          <p className="text-[11px] text-muted-foreground mt-1">{key.rateLimit} req/min · Created {new Date(key.createdAt).toLocaleDateString()}</p>
                        </div>
                        {key.status === "active" && (
                          <button
                            type="button"
                            data-testid={`button-revoke-api-key-${key.id}`}
                            onClick={() => {
                              if (window.confirm("Revoke this API key? Any integration using it will stop working.")) {
                                revokeKey.mutate(key.id);
                              }
                            }}
                            disabled={revokeKey.isPending}
                            className="p-2 text-red-400 hover:bg-red-400/10 rounded-xl transition-colors shrink-0 disabled:opacity-50"
                            aria-label={`Revoke ${key.name}`}
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                      <div className="flex items-center gap-2 bg-secondary/60 rounded-xl px-3 py-2">
                        <code className="text-xs font-mono text-muted-foreground flex-1 truncate" data-testid={`text-api-key-preview-${key.id}`}>
                          {key.keyPreview}
                        </code>
                        <span className="text-[10px] text-muted-foreground">Shown once</span>
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            <div className="bg-card border border-border rounded-2xl p-4 space-y-3">
              <div className="flex items-center gap-2">
                <BookOpen className="w-4 h-4 text-primary" />
                <p className="text-sm font-semibold">How to use</p>
              </div>
              <p className="text-xs text-muted-foreground">Send your key in an HTTP header. Requests count against that key's per-minute limit.</p>
              <div className="bg-secondary/60 rounded-xl px-3 py-2.5">
                <code className="text-[11px] font-mono text-green-400">X-API-Key: your_key_here</code>
              </div>
              {copyError && !revealedKey && <p className="text-xs text-red-400" role="alert" data-testid="status-copy-error">{copyError}</p>}
              <p className="text-xs text-muted-foreground">
                Trading and full-access keys do not replace wallet signatures for orders or withdrawals. Never put a key in a URL or commit it to source code.
              </p>
            </div>

            <div className="flex gap-3 p-4 bg-amber-500/5 border border-amber-500/20 rounded-2xl">
              <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
              <p className="text-xs text-muted-foreground">
                A key is a bearer credential. Store it securely and revoke it immediately if it may have been exposed.
              </p>
            </div>
          </>
        )}
      </div>

      {showAdd && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-end sm:items-center justify-center p-4">
          <div className="bg-card border border-border rounded-2xl p-5 w-full max-w-sm shadow-2xl" role="dialog" aria-modal="true" aria-labelledby="new-api-key-title">
            <div className="flex items-center justify-between mb-5">
              <h3 id="new-api-key-title" className="font-bold text-base">New API Key</h3>
              <button
                type="button"
                data-testid="button-close-api-key-modal"
                onClick={() => setShowAdd(false)}
                className="p-1.5 text-muted-foreground hover:text-foreground rounded-xl hover:bg-white/5"
                aria-label="Close"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <Form {...form}>
              <form onSubmit={form.handleSubmit((values) => addKey.mutate(values))} className="space-y-4">
                <FormField
                  control={form.control}
                  name="name"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Key Name</FormLabel>
                      <FormControl>
                        <Input data-testid="input-api-key-name" placeholder="My Trading Bot" autoComplete="off" maxLength={100} {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <fieldset>
                  <legend className="text-xs text-muted-foreground font-medium mb-1.5">Permission Level</legend>
                  <div className="space-y-2">
                    {PERMISSIONS.map((permission) => (
                      <button
                        key={permission.id}
                        type="button"
                        data-testid={`button-permission-${permission.id}`}
                        aria-pressed={form.watch("permission") === permission.id}
                        onClick={() => form.setValue("permission", permission.id, { shouldValidate: true })}
                        className={cn(
                          "w-full flex items-center gap-3 p-3 rounded-xl border text-left transition-all",
                          form.watch("permission") === permission.id ? "border-primary/60 bg-primary/5" : "border-border hover:bg-secondary/30",
                        )}
                      >
                        <div className="w-8 h-8 rounded-xl flex items-center justify-center shrink-0" style={{ backgroundColor: `${permission.color}20` }}>
                          <permission.icon className="w-4 h-4" style={{ color: permission.color }} />
                        </div>
                        <div className="flex-1">
                          <p className="text-sm font-semibold">{permission.label}</p>
                          <p className="text-[11px] text-muted-foreground">{permission.desc}</p>
                        </div>
                        {form.watch("permission") === permission.id && <Check className="w-4 h-4 text-primary shrink-0" />}
                      </button>
                    ))}
                  </div>
                </fieldset>

                <fieldset>
                  <legend className="text-xs text-muted-foreground font-medium mb-1.5">Rate Limit</legend>
                  <div className="flex gap-2">
                    {[60, 100, 200].map((limit) => (
                      <button
                        key={limit}
                        type="button"
                        data-testid={`button-rate-limit-${limit}`}
                        aria-pressed={form.watch("rateLimit") === limit}
                        onClick={() => form.setValue("rateLimit", limit, { shouldValidate: true })}
                        className={cn(
                          "flex-1 py-2 rounded-xl text-sm font-semibold border transition-all",
                          form.watch("rateLimit") === limit ? "bg-primary text-primary-foreground border-primary" : "border-border text-muted-foreground hover:text-foreground",
                        )}
                      >
                        {limit}
                      </button>
                    ))}
                  </div>
                  <p className="text-[10px] text-muted-foreground mt-1">Requests per minute, capped at the API’s global rate limit.</p>
                </fieldset>

                {addKey.error && (
                  <p className="text-xs text-red-400" role="alert" data-testid="status-api-key-create-error">{errorText(addKey.error)}</p>
                )}

                <button
                  type="submit"
                  data-testid="button-create-api-key"
                  disabled={!form.formState.isValid || addKey.isPending}
                  className="w-full bg-primary text-primary-foreground py-3 rounded-xl font-semibold text-sm disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {addKey.isPending
                    ? <><RefreshCw className="w-4 h-4 animate-spin" /> Verifying and creating…</>
                    : <><Key className="w-4 h-4" /> Generate Key</>}
                </button>
              </form>
            </Form>
          </div>
        </div>
      )}
    </div>
  );
}

export default UserApiKeysSecure;
