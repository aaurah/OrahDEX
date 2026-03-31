import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import {
  TrendingUp, RefreshCw, CheckCircle, AlertTriangle,
  Play, ExternalLink, Clock, BarChart2, Wifi,
} from "lucide-react";
import { cn } from "@/lib/utils";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

function fetchTvStatus() {
  return fetch(`${BASE}/api/admin/tradingview`).then(r => r.json());
}
function runTest(body: any) {
  return fetch(`${BASE}/api/admin/tradingview/test`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  }).then(r => r.json());
}

function EndpointRow({ label, url }: { label: string; url: string }) {
  const full = `${window.location.origin}${BASE}${url}`;
  return (
    <div className="flex items-center justify-between py-2.5 border-b border-border/40 last:border-0">
      <div>
        <p className="text-xs font-semibold text-foreground">{label}</p>
        <code className="text-[11px] text-muted-foreground font-mono">{url}</code>
      </div>
      <a
        href={full}
        target="_blank"
        rel="noopener noreferrer"
        className="flex items-center gap-1 text-xs text-primary hover:underline"
      >
        <ExternalLink className="w-3 h-3" />
        Open
      </a>
    </div>
  );
}

function StatCard({ label, value, sub, color = "default" }: {
  label: string; value: string; sub?: string; color?: "green" | "blue" | "default";
}) {
  return (
    <div className="bg-secondary/20 rounded-xl p-4">
      <p className="text-[11px] text-muted-foreground uppercase tracking-wider mb-1">{label}</p>
      <p className={cn(
        "text-lg font-bold font-mono",
        color === "green" && "text-green-400",
        color === "blue"  && "text-blue-400",
      )}>{value}</p>
      {sub && <p className="text-[11px] text-muted-foreground mt-0.5">{sub}</p>}
    </div>
  );
}

export function AdminTradingView() {
  const { data, isLoading, refetch } = useQuery({
    queryKey:        ["admin-tv-status"],
    queryFn:         fetchTvStatus,
    refetchInterval: 30_000,
  });

  const [testSymbol, setTestSymbol]     = useState("BSV/USDT");
  const [testResolution, setResolution] = useState("60");
  const [testResult, setTestResult]     = useState<any>(null);

  const testMut = useMutation({
    mutationFn: runTest,
    onSuccess:  (r) => setTestResult(r),
  });

  const handleTest = () => {
    setTestResult(null);
    testMut.mutate({ symbol: testSymbol, resolution: testResolution });
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-xl font-bold flex items-center gap-2">
            <TrendingUp className="w-5 h-5 text-primary" />
            TradingView Datafeed
          </h2>
          <p className="text-sm text-muted-foreground mt-0.5">
            UDF-compatible datafeed status, testing and endpoint reference
          </p>
        </div>
        <button
          onClick={() => refetch()}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-border hover:border-primary/40 text-xs text-muted-foreground hover:text-foreground transition-all"
        >
          <RefreshCw className={cn("w-3.5 h-3.5", isLoading && "animate-spin")} />
          Refresh
        </button>
      </div>

      {/* Status overview */}
      <div className="bg-card border border-border rounded-2xl p-5">
        <div className="flex items-center justify-between mb-4">
          <span className="text-sm font-semibold">Datafeed Status</span>
          {data && (
            <span className={cn(
              "inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold border",
              data.status === "operational"
                ? "bg-green-400/10 text-green-400 border-green-400/20"
                : "bg-red-400/10   text-red-400   border-red-400/20"
            )}>
              {data.status === "operational"
                ? <CheckCircle className="w-3 h-3" />
                : <AlertTriangle className="w-3 h-3" />}
              {data.status ?? "Unknown"}
            </span>
          )}
        </div>

        {isLoading ? (
          <div className="text-sm text-muted-foreground">Loading…</div>
        ) : data && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <StatCard
              label="History Latency" color="green"
              value={data.lastHistoryLatencyMs ? `${data.lastHistoryLatencyMs} ms` : "—"}
              sub="Last /history call"
            />
            <StatCard
              label="Symbols Latency" color="blue"
              value={data.lastSymbolsLatencyMs ? `${data.lastSymbolsLatencyMs} ms` : "—"}
              sub="Last /symbols call"
            />
            <StatCard
              label="History Calls"
              value={(data.historyCallCount ?? 0).toLocaleString()}
              sub="Total since boot"
            />
            <StatCard
              label="Symbols Count"
              value={data.symbolsCount ?? "—"}
              sub="Available pairs"
            />
          </div>
        )}

        {data?.lastCallAt && (
          <p className="text-xs text-muted-foreground mt-3 flex items-center gap-1">
            <Clock className="w-3 h-3" />
            Last activity: {new Date(data.lastCallAt).toLocaleString()}
          </p>
        )}
      </div>

      {/* Test Panel */}
      <div className="bg-card border border-border rounded-2xl p-5">
        <div className="flex items-center gap-2 mb-4">
          <Play className="w-4 h-4 text-primary" />
          <span className="text-sm font-semibold">Test Datafeed</span>
        </div>
        <div className="flex flex-wrap gap-3 mb-4">
          <div className="flex flex-col gap-1">
            <label className="text-xs text-muted-foreground font-medium">Symbol</label>
            <input
              value={testSymbol}
              onChange={e => setTestSymbol(e.target.value)}
              className="bg-secondary/40 border border-border rounded-xl px-3 py-2 text-sm font-mono focus:outline-none focus:border-primary/50 w-36 transition-colors"
              placeholder="BSV/USDT"
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs text-muted-foreground font-medium">Resolution</label>
            <select
              value={testResolution}
              onChange={e => setResolution(e.target.value)}
              className="bg-secondary/40 border border-border rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-primary/50 transition-colors"
            >
              {["1","5","15","30","60","240","1D","1W"].map(r => (
                <option key={r} value={r}>{r === "1D" ? "1D" : r === "1W" ? "1W" : `${r}m`}</option>
              ))}
            </select>
          </div>
          <div className="flex items-end">
            <button
              onClick={handleTest}
              disabled={testMut.isPending}
              className="flex items-center gap-2 px-4 py-2 rounded-xl bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 transition-all disabled:opacity-60"
            >
              <BarChart2 className="w-4 h-4" />
              {testMut.isPending ? "Testing…" : "Run Test"}
            </button>
          </div>
        </div>

        {testResult && (
          <div className={cn(
            "rounded-xl p-4 border text-sm",
            testResult.success
              ? "bg-green-400/5 border-green-400/20"
              : "bg-red-400/5   border-red-400/20"
          )}>
            <div className="flex items-center gap-2 mb-2">
              {testResult.success
                ? <CheckCircle className="w-4 h-4 text-green-400" />
                : <AlertTriangle className="w-4 h-4 text-red-400" />}
              <span className={cn("font-semibold", testResult.success ? "text-green-400" : "text-red-400")}>
                {testResult.success ? "Success" : "Failed"}
              </span>
              <span className="text-muted-foreground text-xs ml-auto">{testResult.latencyMs} ms</span>
            </div>
            {testResult.success ? (
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                <div>
                  <p className="text-muted-foreground">Candles</p>
                  <p className="font-mono font-bold">{testResult.candleCount}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">First</p>
                  <p className="font-mono font-bold">{testResult.firstCandle?.slice(0, 10) ?? "—"}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Last</p>
                  <p className="font-mono font-bold">{testResult.lastCandle?.slice(0, 10) ?? "—"}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Status</p>
                  <p className="font-mono font-bold text-green-400">{testResult.status}</p>
                </div>
              </div>
            ) : (
              <p className="text-red-400 text-xs">{testResult.error}</p>
            )}
          </div>
        )}
      </div>

      {/* Endpoints */}
      <div className="bg-card border border-border rounded-2xl p-5">
        <div className="flex items-center gap-2 mb-3">
          <Wifi className="w-4 h-4 text-primary" />
          <span className="text-sm font-semibold">UDF Endpoints</span>
          {data?.baseUrl && (
            <code className="text-xs text-muted-foreground ml-auto">{data.baseUrl}</code>
          )}
        </div>
        <div>
          {Object.entries(data?.endpoints ?? {
            config:  "/api/tv/config",
            symbols: "/api/tv/symbols?symbol=BSV/USDT",
            search:  "/api/tv/search?query=BSV",
            history: "/api/tv/history?symbol=BSV/USDT&resolution=60",
            time:    "/api/tv/time",
          }).map(([key, url]) => (
            <EndpointRow key={key} label={key.toUpperCase()} url={url as string} />
          ))}
        </div>
      </div>

      {/* Integration snippet */}
      <div className="bg-card border border-border rounded-2xl p-5">
        <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground mb-3">
          TradingView Charting Library Integration
        </p>
        <pre className="text-xs font-mono bg-black/30 rounded-xl p-4 overflow-auto text-green-400/80">
{`// Use with TradingView Charting Library (paid)
const datafeed = new Datafeeds.UDFCompatibleDatafeed(
  "${window.location.origin}${BASE}/api/tv"
);

new TradingView.widget({
  symbol:       "BSV/USDT",
  interval:     "60",
  container_id: "tv_chart",
  datafeed,
  library_path: "/tradingview/",
  locale:       "en",
  theme:        "dark",
  supported_resolutions: ["1","5","15","30","60","240","1D","1W"],
});`}
        </pre>
      </div>
    </div>
  );
}
