/**
 * LetsExchangeWidget — Embeds the official LetsExchange widget iframe.
 *
 * The widget supports:
 *   - Swap (crypto ↔ crypto)
 *   - Buy/Sell (fiat ↔ crypto: cards, Apple Pay, Google Pay, bank, 20+ currencies)
 *   - Bridge (cross-chain)
 *   - DEX (on-chain)
 *
 * URL params:
 *   ref_code       — affiliate/partner ID (from our API key JWT)
 *   theme          — "dark" | "light"
 *   from_currency  — default "from" coin
 *   to_currency    — default "to" coin
 *   tab            — "swap" | "buy_sell" | "bridge" | "dex"
 */

import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { API_BASE } from "@/lib/api";

interface LetsExchangeWidgetProps {
  tab?: "swap" | "buy_sell" | "bridge" | "dex";
  fromCurrency?: string;
  toCurrency?: string;
  className?: string;
}

export function LetsExchangeWidget({
  tab = "buy_sell",
  fromCurrency,
  toCurrency,
  className = "",
}: LetsExchangeWidgetProps) {
  const [affiliateId, setAffiliateId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`${API_BASE}/letsexchange/config`)
      .then(r => r.json())
      .then(d => setAffiliateId(d.affiliateId ?? null))
      .catch(() => setAffiliateId(null))
      .finally(() => setLoading(false));
  }, []);

  const widgetUrl = (() => {
    const base = "https://widget.letsexchange.io/";
    const params = new URLSearchParams();
    params.set("theme", "dark");
    params.set("tab", tab);
    if (fromCurrency) params.set("from_currency", fromCurrency);
    if (toCurrency)   params.set("to_currency",   toCurrency);
    if (affiliateId)  params.set("ref_code",       affiliateId);
    return `${base}?${params.toString()}`;
  })();

  if (loading) {
    return (
      <div className={`flex items-center justify-center rounded-2xl bg-zinc-900/60 border border-white/10 min-h-[520px] ${className}`}>
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className={`rounded-2xl overflow-hidden border border-white/10 shadow-xl ${className}`}>
      <iframe
        key={widgetUrl}
        src={widgetUrl}
        title="LetsExchange"
        allow="payment; clipboard-write"
        sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-popups-to-escape-sandbox allow-top-navigation-by-user-activation"
        className="w-full min-h-[560px] border-0 bg-transparent"
        style={{ colorScheme: "dark" }}
      />
    </div>
  );
}
