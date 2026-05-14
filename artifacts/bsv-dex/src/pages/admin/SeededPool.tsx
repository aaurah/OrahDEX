import { useState, useEffect, useCallback } from "react";
import { adminFetch } from "@/lib/adminFetch";

interface PoolRow {
  asset_symbol: string;
  total_seeded: string;
  total_available: string;
  wallet_count: string;
}

interface Summary {
  total_wallets: string;
  total_assets: string;
  total_seeded_usdt_equiv: string;
}

export default function SeededPool() {
  const [pool, setPool] = useState<PoolRow[]>([]);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [loading, setLoading] = useState(true);
  const [reclaimAsset, setReclaimAsset] = useState("");
  const [reclaimBusy, setReclaimBusy] = useState(false);
  const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [poolRes, sumRes] = await Promise.all([
        adminFetch("/admin/seeded-pool"),
        adminFetch("/admin/seeded-pool/summary"),
      ]);
      const poolData = await poolRes.json();
      const sumData  = await sumRes.json();
      setPool(poolData.pool ?? []);
      setSummary(sumData);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleReclaim = async () => {
    if (!window.confirm(
      reclaimAsset
        ? `Reclaim all seeded ${reclaimAsset} from user wallets?`
        : "Reclaim ALL seeded balances from ALL user wallets? This cannot be undone."
    )) return;
    setReclaimBusy(true);
    setMsg(null);
    try {
      const res = await adminFetch("/admin/seeded-pool/reclaim", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(reclaimAsset ? { asset: reclaimAsset } : {}),
      });
      const data = await res.json();
      if (res.ok) {
        setMsg({ text: `Reclaimed from ${data.rowsAffected ?? 0} balance rows.`, ok: true });
        load();
      } else {
        setMsg({ text: data.error ?? "Failed", ok: false });
      }
    } finally {
      setReclaimBusy(false);
    }
  };

  const fmt = (n: string | number) => parseFloat(n as string).toLocaleString(undefined, { maximumFractionDigits: 4 });

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white">Seeded Pool</h1>
        <p className="text-gray-400 text-sm mt-1">
          Platform liquidity seeded into user wallets. Users can trade with this balance but
          <span className="text-yellow-400 font-semibold"> cannot withdraw it</span>. Only admin can reclaim.
        </p>
      </div>

      {loading ? (
        <div className="text-gray-400 animate-pulse">Loading…</div>
      ) : (
        <>
          {/* Summary cards */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="bg-gray-900 border border-gray-700 rounded-lg p-4">
              <p className="text-xs text-gray-400 uppercase tracking-wider">Wallets with Seed</p>
              <p className="text-2xl font-bold text-white mt-1">{fmt(summary?.total_wallets ?? 0)}</p>
            </div>
            <div className="bg-gray-900 border border-gray-700 rounded-lg p-4">
              <p className="text-xs text-gray-400 uppercase tracking-wider">Assets Seeded</p>
              <p className="text-2xl font-bold text-white mt-1">{fmt(summary?.total_assets ?? 0)}</p>
            </div>
            <div className="bg-gray-900 border border-gray-700 rounded-lg p-4">
              <p className="text-xs text-gray-400 uppercase tracking-wider">Stable Pool Value</p>
              <p className="text-2xl font-bold text-yellow-400 mt-1">
                ${fmt(summary?.total_seeded_usdt_equiv ?? 0)}
              </p>
            </div>
          </div>

          {/* Pool table */}
          <div className="bg-gray-900 border border-gray-700 rounded-lg overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-700 text-gray-400 text-xs uppercase tracking-wider">
                  <th className="px-4 py-3 text-left">Asset</th>
                  <th className="px-4 py-3 text-right">Total Seeded</th>
                  <th className="px-4 py-3 text-right">Total Available</th>
                  <th className="px-4 py-3 text-right">Wallets</th>
                </tr>
              </thead>
              <tbody>
                {pool.length === 0 && (
                  <tr>
                    <td colSpan={4} className="px-4 py-8 text-center text-gray-500">
                      No seeded balances found.
                    </td>
                  </tr>
                )}
                {pool.map((row) => (
                  <tr key={row.asset_symbol} className="border-b border-gray-800 hover:bg-gray-800/50">
                    <td className="px-4 py-3 font-mono font-semibold text-white">{row.asset_symbol}</td>
                    <td className="px-4 py-3 text-right text-yellow-400">{fmt(row.total_seeded)}</td>
                    <td className="px-4 py-3 text-right text-gray-300">{fmt(row.total_available)}</td>
                    <td className="px-4 py-3 text-right text-gray-400">{row.wallet_count}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Reclaim section */}
          <div className="bg-gray-900 border border-red-900/50 rounded-lg p-5 space-y-4">
            <div>
              <h2 className="text-white font-semibold text-base">Reclaim Platform Seed</h2>
              <p className="text-gray-400 text-xs mt-1">
                Remove seeded balance from user wallets. Their available balance will be reduced by the seeded amount.
                Leave asset blank to reclaim all assets at once.
              </p>
            </div>

            <div className="flex flex-col sm:flex-row gap-3">
              <select
                value={reclaimAsset}
                onChange={e => setReclaimAsset(e.target.value)}
                className="bg-gray-800 border border-gray-600 text-white rounded-md px-3 py-2 text-sm flex-1"
              >
                <option value="">— All assets —</option>
                {pool.map(r => (
                  <option key={r.asset_symbol} value={r.asset_symbol}>{r.asset_symbol}</option>
                ))}
              </select>
              <button
                onClick={handleReclaim}
                disabled={reclaimBusy}
                className="bg-red-700 hover:bg-red-600 disabled:opacity-50 text-white text-sm font-semibold px-5 py-2 rounded-md transition-colors"
              >
                {reclaimBusy ? "Reclaiming…" : "Reclaim"}
              </button>
            </div>

            {msg && (
              <p className={`text-sm font-medium ${msg.ok ? "text-green-400" : "text-red-400"}`}>
                {msg.text}
              </p>
            )}
          </div>
        </>
      )}
    </div>
  );
}
