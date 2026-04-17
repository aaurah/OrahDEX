import { useQuery } from "@tanstack/react-query";
import {
  Landmark, RefreshCw, ExternalLink, Copy, Check,
  Wallet, AlertTriangle, TrendingUp, Lock, Users,
  Radio, Info,
} from "lucide-react";
import { useState } from "react";
import { cn } from "@/lib/utils";
import { adminFetch } from "@/lib/adminFetch";

interface TreasuryData {
  bsvWallet: {
    address: string;
    customAddress: string | null;
    bsv: number;
    confirmedSatoshis: number;
    unconfirmedSatoshis: number;
    funded: boolean;
    explorerUrl: string;
  };
  ledger: {
    asset: string;
    totalAvailable: number;
    totalLocked: number;
    userCount: number;
  }[];
  fetchedAt: string;
}

function CopyBtn({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      onClick={() => { navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 1500); }}
      className="text-white/30 hover:text-white/70 transition-colors"
      title="Copy"
    >
      {copied ? <Check className="w-3.5 h-3.5 text-green-400" /> : <Copy className="w-3.5 h-3.5" />}
    </button>
  );
}

function fmt(n: number, decimals = 4): string {
  if (n === 0) return "0";
  if (n >= 1e9) return `${(n / 1e9).toFixed(2)}B`;
  if (n >= 1e6) return `${(n / 1e6).toFixed(2)}M`;
  if (n >= 1e3) return `${(n / 1e3).toFixed(2)}K`;
  return n.toFixed(decimals);
}

const ASSET_COLORS: Record<string, string> = {
  BSV:  "text-green-400 bg-green-400/10",
  ETH:  "text-blue-400 bg-blue-400/10",
  BTC:  "text-orange-400 bg-orange-400/10",
  USDT: "text-teal-400 bg-teal-400/10",
  USDC: "text-blue-300 bg-blue-300/10",
  BUSD: "text-yellow-400 bg-yellow-400/10",
  DAI:  "text-yellow-300 bg-yellow-300/10",
  BNB:  "text-yellow-400 bg-yellow-400/10",
  SOL:  "text-purple-400 bg-purple-400/10",
  MATIC:"text-violet-400 bg-violet-400/10",
  ADA:  "text-blue-400 bg-blue-400/10",
  DOGE: "text-yellow-400 bg-yellow-400/10",
  XRP:  "text-blue-300 bg-blue-300/10",
};

function assetColor(asset: string) {
  return ASSET_COLORS[asset] ?? "text-white/60 bg-white/5";
}

export function AdminTreasury() {
  const { data, isLoading, isFetching, dataUpdatedAt, refetch } = useQuery<TreasuryData>({
    queryKey: ["admin-treasury"],
    queryFn: () => adminFetch("/api/admin/treasury").then(r => r.json()),
    refetchInterval: 30_000,
  });

  const lastUpdated = dataUpdatedAt
    ? new Date(dataUpdatedAt).toLocaleTimeString()
    : "—";

  const bsv = data?.bsvWallet;
  const ledger = data?.ledger ?? [];
  const totalAssets = ledger.length;
  const totalUsers = ledger.reduce((s, r) => Math.max(s, r.userCount), 0);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Landmark className="w-6 h-6 text-primary" />
            Exchange Treasury
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Real on-chain settlement wallet + internal ledger liabilities
          </p>
        </div>
        <button
          onClick={() => refetch()}
          disabled={isFetching}
          className="flex items-center gap-2 px-3 py-2 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 text-sm transition-colors disabled:opacity-50"
        >
          <RefreshCw className={cn("w-4 h-4", isFetching && "animate-spin")} />
          Refresh
        </button>
      </div>

      {/* Info notice */}
      <div className="flex items-start gap-3 p-4 bg-blue-400/5 border border-blue-400/20 rounded-xl text-sm text-blue-300">
        <Info className="w-4 h-4 mt-0.5 shrink-0" />
        <div>
          <span className="font-semibold">How this works:</span> BSV settlements use the on-chain wallet below.
          EVM settlements (ETH, USDT, etc.) are processed manually from your connected wallet shown in the top bar.
          The <span className="font-semibold">Internal Ledger</span> shows the total balance obligations the exchange owes to all users.
        </div>
      </div>

      {/* BSV Settlement Wallet */}
      <div className="bg-[#1a1a2e] border border-white/10 rounded-xl p-5">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-base font-semibold text-white flex items-center gap-2">
            <Wallet className="w-4 h-4 text-green-400" />
            BSV Settlement Wallet
          </h2>
          <div className="flex items-center gap-2">
            {bsv?.customAddress && (
              <span className="text-[10px] font-bold px-2 py-1 rounded border bg-violet-500/10 border-violet-500/20 text-violet-400 uppercase tracking-wider">
                Custom Address
              </span>
            )}
            {!isLoading && bsv && (
              <div className={cn(
                "flex items-center gap-1.5 text-[10px] font-bold px-2 py-1 rounded border uppercase tracking-wider",
                bsv.funded
                  ? "bg-green-500/10 border-green-500/20 text-green-400"
                  : "bg-orange-500/10 border-orange-500/20 text-orange-400",
              )}>
                <Radio className="w-3 h-3" />
                {bsv.funded ? "FUNDED" : "AWAITING FUNDS"}
              </div>
            )}
          </div>
        </div>

        {isLoading ? (
          <div className="animate-pulse space-y-3">
            <div className="h-10 bg-white/5 rounded-lg" />
            <div className="grid grid-cols-3 gap-3">
              {[0,1,2].map(i => <div key={i} className="h-16 bg-white/5 rounded-lg" />)}
            </div>
          </div>
        ) : bsv ? (
          <div className="space-y-4">
            {/* Address */}
            <div>
              <p className="text-xs text-white/40 mb-1.5">Deposit Address (P2PKH Mainnet)</p>
              <div className="flex items-center gap-2 bg-white/5 rounded-lg px-3 py-2.5">
                <code className="flex-1 font-mono text-sm text-green-300 break-all">{bsv.address}</code>
                <CopyBtn text={bsv.address} />
                <a href={bsv.explorerUrl} target="_blank" rel="noreferrer"
                  className="text-white/30 hover:text-white/70 transition-colors ml-1">
                  <ExternalLink className="w-3.5 h-3.5" />
                </a>
              </div>
            </div>

            {/* Balance grid */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="bg-white/5 rounded-xl p-4">
                <p className="text-xs text-white/40 mb-1">Confirmed Balance</p>
                <p className="text-2xl font-bold font-mono text-green-300">
                  {bsv.bsv.toFixed(8)}
                </p>
                <p className="text-xs text-white/30 mt-0.5">BSV</p>
              </div>
              <div className="bg-white/5 rounded-xl p-4">
                <p className="text-xs text-white/40 mb-1">Confirmed Satoshis</p>
                <p className="text-2xl font-bold font-mono text-white">
                  {bsv.confirmedSatoshis.toLocaleString()}
                </p>
                <p className="text-xs text-white/30 mt-0.5">sats</p>
              </div>
              <div className="bg-white/5 rounded-xl p-4">
                <p className="text-xs text-white/40 mb-1">Unconfirmed</p>
                <p className={cn(
                  "text-2xl font-bold font-mono",
                  bsv.unconfirmedSatoshis > 0 ? "text-yellow-300" : "text-white/30"
                )}>
                  {bsv.unconfirmedSatoshis.toLocaleString()}
                </p>
                <p className="text-xs text-white/30 mt-0.5">sats pending</p>
              </div>
            </div>

            {!bsv.funded && (
              <div className="flex items-start gap-3 p-3 bg-orange-400/5 border border-orange-400/20 rounded-xl text-sm text-orange-300">
                <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
                <div>
                  Send BSV to <code className="font-mono text-xs">{bsv.address}</code> to enable on-chain BSV withdrawal broadcasting.
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="text-sm text-red-400">Failed to load BSV wallet data.</div>
        )}
      </div>

      {/* Internal Ledger */}
      <div className="bg-[#1a1a2e] border border-white/10 rounded-xl p-5">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-base font-semibold text-white flex items-center gap-2">
            <TrendingUp className="w-4 h-4 text-primary" />
            Internal Ledger — User Balance Obligations
          </h2>
          <div className="flex items-center gap-3 text-xs text-white/40">
            <span className="flex items-center gap-1"><Users className="w-3.5 h-3.5" /> {totalUsers} users</span>
            <span>{totalAssets} assets</span>
            <span>Updated {lastUpdated}</span>
          </div>
        </div>

        <p className="text-xs text-white/40 mb-4">
          Total balances the exchange owes to users across all assets. This is the exchange's liability, not on-chain holdings.
        </p>

        {isLoading ? (
          <div className="space-y-2 animate-pulse">
            {[0,1,2,3,4].map(i => <div key={i} className="h-12 bg-white/5 rounded-lg" />)}
          </div>
        ) : ledger.length === 0 ? (
          <div className="text-center py-8 text-sm text-white/30">No user balances on record.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-white/10">
                  <th className="text-left text-xs text-white/40 font-medium pb-3 pr-4">Asset</th>
                  <th className="text-right text-xs text-white/40 font-medium pb-3 pr-4">
                    <span className="flex items-center justify-end gap-1">Available</span>
                  </th>
                  <th className="text-right text-xs text-white/40 font-medium pb-3 pr-4">
                    <span className="flex items-center justify-end gap-1"><Lock className="w-3 h-3" /> Locked</span>
                  </th>
                  <th className="text-right text-xs text-white/40 font-medium pb-3 pr-4">Total Owed</th>
                  <th className="text-right text-xs text-white/40 font-medium pb-3">
                    <span className="flex items-center justify-end gap-1"><Users className="w-3 h-3" /> Users</span>
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {ledger.map(row => {
                  const total = row.totalAvailable + row.totalLocked;
                  return (
                    <tr key={row.asset} className="hover:bg-white/3 transition-colors">
                      <td className="py-3 pr-4">
                        <span className={cn(
                          "inline-flex items-center px-2 py-0.5 rounded text-xs font-bold font-mono",
                          assetColor(row.asset),
                        )}>
                          {row.asset}
                        </span>
                      </td>
                      <td className="py-3 pr-4 text-right font-mono text-white/80">
                        {fmt(row.totalAvailable)}
                      </td>
                      <td className="py-3 pr-4 text-right font-mono text-orange-300">
                        {row.totalLocked > 0 ? fmt(row.totalLocked) : <span className="text-white/20">—</span>}
                      </td>
                      <td className="py-3 pr-4 text-right font-mono font-semibold text-white">
                        {fmt(total)}
                      </td>
                      <td className="py-3 text-right text-white/40">
                        {row.userCount}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr className="border-t border-white/20">
                  <td className="pt-3 text-xs text-white/40 font-semibold">TOTALS</td>
                  <td className="pt-3 pr-4 text-right font-mono text-sm font-bold text-white">
                    {ledger.reduce((s, r) => s + r.totalAvailable, 0).toFixed(2)}
                  </td>
                  <td className="pt-3 pr-4 text-right font-mono text-sm font-bold text-orange-300">
                    {ledger.reduce((s, r) => s + r.totalLocked, 0).toFixed(2)}
                  </td>
                  <td className="pt-3 pr-4 text-right font-mono text-sm font-bold text-white/60">—</td>
                  <td className="pt-3 text-right text-xs text-white/30">{totalAssets} assets</td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
