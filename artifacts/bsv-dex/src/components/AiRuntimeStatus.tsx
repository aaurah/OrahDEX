import { useQuery } from "@tanstack/react-query";
import { getAdminHeaders } from "@/store/useAdminAuthStore";

/** A configured provider is not a verified response; keep those states distinct. */
export function AiRuntimeStatus({ developer = false }: { developer?: boolean }) {
  const endpoint = developer ? "/api/admin/devai/status" : "/api/anthropic/status";
  const { data, error, isPending } = useQuery({
    queryKey: ["ai-runtime", endpoint],
    queryFn: async () => {
      const response = await fetch(endpoint, {
        headers: developer ? getAdminHeaders() : undefined,
        signal: AbortSignal.timeout(5_000),
      });
      if (!response.ok) throw new Error(response.status === 401
        ? "Sign in as an admin to use DevAI."
        : "Cannot reach the AI status API. Check API availability.");
      return response.json() as Promise<{
        provider: string; model: string; environment: string;
        ready: boolean; code: string; error: string | null;
      }>;
    },
    refetchInterval: 30_000,
    retry: false,
  });
  return (
    <div role="status" className={`shrink-0 border-b px-4 py-2 text-xs break-words ${data?.ready
      ? "border-green-500/20 text-green-300" : "border-amber-500/20 text-amber-200"}`}>
      {isPending ? "Checking AI runtime…" : error ? error.message : (
        <>
          <span className="font-semibold">{data?.provider === "local_ollama" ? "Ollama" : data?.provider} · {data?.model}</span>
          <span className="text-muted-foreground"> · {data?.environment} · {data?.ready ? "Ready" : data?.code === "UNVERIFIED" ? "Not verified" : "Unavailable"}</span>
          {data?.error && <p className="mt-1">{data.error}</p>}
        </>
      )}
    </div>
  );
}
