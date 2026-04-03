import React, { useState, useCallback, useMemo } from "react";
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  RefreshControl, TextInput, Platform, Pressable,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";
import { router } from "expo-router";
import * as Haptics from "expo-haptics";
import { useQuery } from "@tanstack/react-query";
import { Colors } from "@/constants/colors";
import {
  MARKETS_BY_QUOTE, QUOTE_TABS, ALL_SPOT_MARKETS, FUTURES_MARKETS,
  fmtPrice, getMockMarket, type QuoteId, type MobileMarket,
} from "@/utils/mockMarkets";

const C = Colors.dark;
const BASE = `https://${process.env.EXPO_PUBLIC_DOMAIN}`;

const COIN_COLORS: Record<string, string> = {
  BSV: "#EAB308", BTC: "#F97316", ETH: "#8B5CF6", SOL: "#06B6D4",
  XRP: "#3B82F6", BNB: "#EAB308", ADA: "#2563EB", DOGE: "#EAB308",
  ARB: "#3B82F6", OP: "#EF4444", MATIC: "#7C3AED", AVAX: "#EF4444",
  AERO: "#2563EB", BRETT: "#8B5CF6", WETH: "#8B5CF6", CBETH: "#06B6D4",
  PEPE: "#22C55E", SHIB: "#F97316", BONK: "#F97316", WIF: "#F59E0B",
  GMX: "#22C55E", AAVE: "#9333EA", UNI: "#EC4899", CRV: "#F59E0B",
};

function CoinBadge({ base }: { base: string }) {
  const bg = COIN_COLORS[base] ?? C.accent;
  return (
    <View style={[styles.coinBadge, { backgroundColor: bg + "22", borderColor: bg + "55" }]}>
      <Text style={[styles.coinBadgeText, { color: bg }]}>{base.slice(0, 2)}</Text>
    </View>
  );
}

function MiniBar({ change }: { change: number }) {
  const bars = [0.3, 0.5, 0.8, 0.6, 0.9, 0.7, 1.0, 0.85];
  const color = change >= 0 ? C.buy : C.sell;
  return (
    <View style={{ flexDirection: "row", alignItems: "flex-end", gap: 1.5, height: 20, width: 44 }}>
      {bars.map((h, i) => (
        <View key={i} style={{ flex: 1, height: h * 20, backgroundColor: color, borderRadius: 1.5, opacity: 0.55 + i * 0.06 }} />
      ))}
    </View>
  );
}

type MarketTab = QuoteId | "futures";

export default function MarketsScreen() {
  const insets = useSafeAreaInsets();
  const [search, setSearch] = useState("");
  const [tab, setTab] = useState<MarketTab>("USDT");
  const [refreshing, setRefreshing] = useState(false);

  const { data: apiMarkets, refetch } = useQuery({
    queryKey: ["mobile-markets"],
    queryFn: async () => {
      const r = await fetch(`${BASE}/api/markets`);
      return r.json();
    },
    retry: false,
  });

  // Merge API data over mock
  const allMarkets = useMemo<MobileMarket[]>(() => {
    const base = [...ALL_SPOT_MARKETS];
    if (apiMarkets && Array.isArray(apiMarkets) && apiMarkets.length > 0) {
      const apiMap = new Map<string, MobileMarket>();
      (apiMarkets as any[]).forEach((m: any) => {
        const lp = parseFloat(m.lastPrice);
        if (lp > 0) {
          const sym = m.symbol;
          const [b, q] = sym.split("/");
          apiMap.set(sym, {
            symbol: sym, base: b ?? "", quote: q ?? "USDT",
            price: lp, change: parseFloat(m.priceChangePercent) || 0,
            volume: m.volume24h ?? "—", high: parseFloat(m.highPrice) || lp * 1.02,
            low: parseFloat(m.lowPrice) || lp * 0.98, type: "spot",
          });
        }
      });
      return base.map(m => apiMap.get(m.symbol) ?? m);
    }
    return base;
  }, [apiMarkets]);

  const displayList = useMemo<MobileMarket[]>(() => {
    const list: MobileMarket[] = tab === "futures"
      ? FUTURES_MARKETS
      : (allMarkets.filter(m => m.quote === tab));
    if (!search) return list;
    const q = search.toLowerCase();
    return list.filter(m => m.base.toLowerCase().includes(q) || m.symbol.toLowerCase().includes(q));
  }, [allMarkets, tab, search]);

  const topGainers = useMemo(() =>
    [...allMarkets].filter(m => m.quote === "USDT").sort((a, b) => b.change - a.change).slice(0, 4),
  [allMarkets]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    refetch().finally(() => setRefreshing(false));
  }, [refetch]);

  const openTrade = (m: MobileMarket) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const slug = m.symbol.replace(/\//g, "-");
    router.push(`/trade/${slug}` as any);
  };

  return (
    <View style={[styles.container, { backgroundColor: C.background }]}>
      {/* Header */}
      <View style={[styles.header, { paddingTop: Platform.OS === "web" ? 67 : insets.top + 12 }]}>
        <View>
          <Text style={styles.logo}>Orah<Text style={{ color: C.primary }}>DEX</Text></Text>
          <Text style={styles.slogan}>✦ Trade means DEX</Text>
        </View>
        <TouchableOpacity style={styles.walletBtn} onPress={() => router.push("/wallet" as any)}>
          <Feather name="link" size={17} color={C.primary} />
        </TouchableOpacity>
      </View>

      <ScrollView
        style={{ flex: 1 }}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={C.primary} />}
      >
        {/* Stats strip */}
        <View style={styles.statsRow}>
          {[
            { label: "24h Vol", value: "$1.24B" },
            { label: "Markets", value: `${allMarkets.length}+` },
            { label: "Pairs", value: `${QUOTE_TABS.length} Quotes` },
          ].map(s => (
            <View key={s.label} style={styles.statItem}>
              <Text style={styles.statValue}>{s.value}</Text>
              <Text style={styles.statLabel}>{s.label}</Text>
            </View>
          ))}
        </View>

        {/* Top Movers */}
        <Text style={styles.sectionTitle}>Top Movers</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ paddingHorizontal: 20, gap: 10, paddingBottom: 4 }}>
          {topGainers.map(m => (
            <Pressable key={m.symbol} style={styles.moverCard} onPress={() => openTrade(m)}>
              <CoinBadge base={m.base} />
              <Text style={styles.moverBase}>{m.base}</Text>
              <Text style={styles.moverPrice}>{fmtPrice(m.price)}</Text>
              <View style={[styles.pill, { backgroundColor: m.change >= 0 ? C.buyBg : C.sellBg }]}>
                <Text style={[styles.pillText, { color: m.change >= 0 ? C.buy : C.sell }]}>
                  {m.change >= 0 ? "+" : ""}{m.change.toFixed(2)}%
                </Text>
              </View>
            </Pressable>
          ))}
        </ScrollView>

        {/* Search */}
        <View style={styles.searchWrap}>
          <Feather name="search" size={14} color={C.textMuted} />
          <TextInput
            style={styles.searchInput}
            placeholder="Search pairs..."
            placeholderTextColor={C.textMuted}
            value={search}
            onChangeText={setSearch}
          />
          {search.length > 0 && (
            <TouchableOpacity onPress={() => setSearch("")}>
              <Feather name="x" size={14} color={C.textMuted} />
            </TouchableOpacity>
          )}
        </View>

        {/* Quote tabs — scrollable */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.tabsRow}>
          {(QUOTE_TABS as { id: QuoteId; label: string }[]).map(t => (
            <TouchableOpacity
              key={t.id}
              style={[styles.tabBtn, tab === t.id && styles.tabBtnActive]}
              onPress={() => { Haptics.selectionAsync(); setTab(t.id); }}
            >
              <Text style={[styles.tabText, tab === t.id && styles.tabTextActive]}>{t.label}</Text>
            </TouchableOpacity>
          ))}
          <TouchableOpacity
            style={[styles.tabBtn, tab === "futures" && styles.tabBtnActive]}
            onPress={() => { Haptics.selectionAsync(); setTab("futures"); }}
          >
            <Text style={[styles.tabText, tab === "futures" && styles.tabTextActive]}>Futures</Text>
          </TouchableOpacity>
        </ScrollView>

        {/* Column headers */}
        <View style={styles.listHeader}>
          <Text style={[styles.colHdr, { flex: 2 }]}>Pair</Text>
          <Text style={[styles.colHdr, { flex: 2, textAlign: "right" }]}>Price</Text>
          <Text style={[styles.colHdr, { flex: 1.2, textAlign: "center" }]}>Chart</Text>
          <Text style={[styles.colHdr, { flex: 1.5, textAlign: "right" }]}>24h%</Text>
        </View>

        {/* Market rows */}
        <View style={styles.listCard}>
          {displayList.length === 0 ? (
            <View style={{ padding: 32, alignItems: "center" }}>
              <Text style={{ color: C.textMuted, fontFamily: "Inter_400Regular", fontSize: 13 }}>No pairs found</Text>
            </View>
          ) : displayList.map((m, idx) => (
            <TouchableOpacity
              key={m.symbol}
              style={[styles.row, idx === displayList.length - 1 && { borderBottomWidth: 0 }]}
              onPress={() => openTrade(m)}
              activeOpacity={0.7}
            >
              <View style={{ flex: 2, flexDirection: "row", alignItems: "center", gap: 8 }}>
                <CoinBadge base={m.base} />
                <View>
                  <Text style={styles.rowBase}>{m.base}
                    <Text style={styles.rowQuote}>/{m.quote}</Text>
                  </Text>
                  {m.type === "futures" && (
                    <View style={styles.perpPill}>
                      <Text style={styles.perpText}>PERP</Text>
                    </View>
                  )}
                </View>
              </View>

              <View style={{ flex: 2, alignItems: "flex-end" }}>
                <Text style={styles.rowPrice}>{fmtPrice(m.price)}</Text>
                <Text style={styles.rowVol}>{m.volume}</Text>
              </View>

              <View style={{ flex: 1.2, alignItems: "center" }}>
                <MiniBar change={m.change} />
              </View>

              <View style={{ flex: 1.5, alignItems: "flex-end" }}>
                <View style={[styles.pill, { backgroundColor: m.change >= 0 ? C.buyBg : C.sellBg }]}>
                  <Text style={[styles.pillText, { color: m.change >= 0 ? C.buy : C.sell }]}>
                    {m.change >= 0 ? "+" : ""}{m.change.toFixed(2)}%
                  </Text>
                </View>
              </View>
            </TouchableOpacity>
          ))}
        </View>

        <View style={{ height: 110 }} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    paddingHorizontal: 20, paddingBottom: 14,
  },
  logo: { fontFamily: "Inter_700Bold", fontSize: 22, color: C.text, letterSpacing: -0.5 },
  slogan: { fontFamily: "Inter_500Medium", fontSize: 10, color: C.primary, marginTop: 1, opacity: 0.8 },
  walletBtn: {
    width: 38, height: 38, borderRadius: 12,
    backgroundColor: C.primary + "18", borderWidth: 1, borderColor: C.primary + "33",
    alignItems: "center", justifyContent: "center",
  },
  statsRow: {
    flexDirection: "row", marginHorizontal: 20, marginBottom: 18,
    backgroundColor: C.card, borderRadius: 16, borderWidth: 1, borderColor: C.cardBorder, padding: 14,
  },
  statItem: { flex: 1, alignItems: "center" },
  statValue: { fontFamily: "Inter_700Bold", fontSize: 14, color: C.text },
  statLabel: { fontFamily: "Inter_400Regular", fontSize: 10, color: C.textMuted, marginTop: 2 },
  sectionTitle: { fontFamily: "Inter_600SemiBold", fontSize: 14, color: C.text, marginBottom: 10, paddingHorizontal: 20 },
  moverCard: {
    backgroundColor: C.card, borderRadius: 14, borderWidth: 1, borderColor: C.cardBorder,
    padding: 12, width: 120, gap: 6,
  },
  moverBase: { fontFamily: "Inter_600SemiBold", fontSize: 13, color: C.text },
  moverPrice: { fontFamily: "Inter_700Bold", fontSize: 12, color: C.text },
  pill: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 7, alignSelf: "flex-start" },
  pillText: { fontFamily: "Inter_600SemiBold", fontSize: 10 },
  searchWrap: {
    flexDirection: "row", alignItems: "center", gap: 8,
    marginHorizontal: 20, marginTop: 16, marginBottom: 10,
    backgroundColor: C.card, borderRadius: 12, borderWidth: 1, borderColor: C.cardBorder,
    paddingHorizontal: 12, paddingVertical: 9,
  },
  searchInput: { flex: 1, fontFamily: "Inter_400Regular", fontSize: 13, color: C.text },
  tabsRow: { paddingHorizontal: 20, gap: 6, paddingBottom: 12 },
  tabBtn: {
    paddingHorizontal: 12, paddingVertical: 6, borderRadius: 10,
    backgroundColor: C.card, borderWidth: 1, borderColor: C.cardBorder,
  },
  tabBtnActive: { backgroundColor: C.primary + "18", borderColor: C.primary + "55" },
  tabText: { fontFamily: "Inter_600SemiBold", fontSize: 12, color: C.textSecondary },
  tabTextActive: { color: C.primary },
  listHeader: {
    flexDirection: "row", paddingHorizontal: 20, paddingVertical: 8,
  },
  colHdr: { fontFamily: "Inter_500Medium", fontSize: 10, color: C.textMuted, textTransform: "uppercase", letterSpacing: 0.4 },
  listCard: {
    marginHorizontal: 16, backgroundColor: C.card,
    borderRadius: 16, borderWidth: 1, borderColor: C.cardBorder, overflow: "hidden",
  },
  row: {
    flexDirection: "row", alignItems: "center",
    paddingHorizontal: 14, paddingVertical: 12,
    borderBottomWidth: 1, borderBottomColor: C.separator,
  },
  coinBadge: {
    width: 28, height: 28, borderRadius: 9,
    alignItems: "center", justifyContent: "center", borderWidth: 1,
  },
  coinBadgeText: { fontFamily: "Inter_700Bold", fontSize: 10 },
  rowBase: { fontFamily: "Inter_600SemiBold", fontSize: 13, color: C.text },
  rowQuote: { fontFamily: "Inter_400Regular", fontSize: 12, color: C.textMuted },
  rowPrice: { fontFamily: "Inter_700Bold", fontSize: 13, color: C.text },
  rowVol: { fontFamily: "Inter_400Regular", fontSize: 10, color: C.textMuted, marginTop: 1 },
  perpPill: {
    backgroundColor: C.accent + "22", paddingHorizontal: 4, paddingVertical: 1,
    borderRadius: 4, alignSelf: "flex-start", marginTop: 2,
  },
  perpText: { fontFamily: "Inter_600SemiBold", fontSize: 8, color: C.accent },
});
