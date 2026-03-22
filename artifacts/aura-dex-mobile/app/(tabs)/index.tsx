import React, { useState, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
  TextInput,
  Platform,
  Pressable,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Feather, Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import * as Haptics from "expo-haptics";
import { useQuery } from "@tanstack/react-query";
import { Colors } from "@/constants/colors";

const C = Colors.dark;
const BASE = `https://${process.env.EXPO_PUBLIC_DOMAIN}`;

const MOCK_MARKETS = [
  { symbol: "BSV/USDT", base: "BSV", quote: "USDT", price: 55.42, change: 4.41, volume: "18.5M", high: 57.10, low: 53.20, type: "spot" },
  { symbol: "BTC/USDT", base: "BTC", quote: "USDT", price: 65234.50, change: -1.85, volume: "1.24B", high: 66800, low: 64200, type: "spot" },
  { symbol: "ETH/USDT", base: "ETH", quote: "USDT", price: 3198.70, change: 1.53, volume: "420M", high: 3250, low: 3120, type: "spot" },
  { symbol: "SOL/USDT", base: "SOL", quote: "USDT", price: 148.32, change: 3.21, volume: "58M", high: 152, low: 144, type: "spot" },
  { symbol: "XRP/USDT", base: "XRP", quote: "USDT", price: 0.5842, change: -0.64, volume: "110M", high: 0.60, low: 0.57, type: "spot" },
  { symbol: "BNB/USDT", base: "BNB", quote: "USDT", price: 408.90, change: 0.88, volume: "95M", high: 415, low: 402, type: "spot" },
  { symbol: "ADA/USDT", base: "ADA", quote: "USDT", price: 0.4421, change: -2.10, volume: "45M", high: 0.46, low: 0.43, type: "spot" },
  { symbol: "BSV/USDT-PERP", base: "BSV", quote: "USDT", price: 55.85, change: 4.12, volume: "8.2M", high: 57.50, low: 53.80, type: "futures" },
  { symbol: "BTC/USDT-PERP", base: "BTC", quote: "USDT", price: 65180.00, change: -1.90, volume: "980M", high: 66900, low: 64100, type: "futures" },
  { symbol: "ETH/USDT-PERP", base: "ETH", quote: "USDT", price: 3195.00, change: 1.48, volume: "340M", high: 3255, low: 3118, type: "futures" },
];

type Filter = "all" | "spot" | "futures";

function formatPrice(price: number): string {
  if (price >= 1000) return price.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  if (price >= 1) return price.toFixed(2);
  return price.toFixed(4);
}

function MiniBar({ change }: { change: number }) {
  const bars = [0.3, 0.5, 0.8, 0.6, 0.9, 0.7, 1.0, 0.85];
  const color = change >= 0 ? C.buy : C.sell;
  return (
    <View style={{ flexDirection: "row", alignItems: "flex-end", gap: 2, height: 24, width: 48 }}>
      {bars.map((h, i) => (
        <View key={i} style={{ flex: 1, height: h * 24, backgroundColor: color, borderRadius: 2, opacity: 0.6 + i * 0.05 }} />
      ))}
    </View>
  );
}

function CoinIcon({ base }: { base: string }) {
  const colors: Record<string, string> = {
    BSV: "#EAB308", BTC: "#F97316", ETH: "#8B5CF6",
    SOL: "#06B6D4", XRP: "#3B82F6", BNB: "#EAB308",
    ADA: "#2563EB", TOKEN: "#EC4899",
  };
  const bg = colors[base] ?? C.accent;
  return (
    <View style={[styles.coinIcon, { backgroundColor: bg + "22", borderColor: bg + "44" }]}>
      <Text style={[styles.coinIconText, { color: bg }]}>{base[0]}</Text>
    </View>
  );
}

export default function MarketsScreen() {
  const insets = useSafeAreaInsets();
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [refreshing, setRefreshing] = useState(false);

  const { data: apiMarkets, refetch } = useQuery({
    queryKey: ["mobile-markets"],
    queryFn: async () => {
      const r = await fetch(`${BASE}/api/markets`);
      return r.json();
    },
  });

  const hasRealData = apiMarkets && Array.isArray(apiMarkets) && apiMarkets.length > 0
    && apiMarkets.some((m: any) => parseFloat(m.lastPrice) > 0);

  const markets = hasRealData ? apiMarkets.map((m: any) => ({
    symbol: m.symbol,
    base: m.baseAsset ?? m.symbol?.split("/")[0],
    quote: m.quoteAsset ?? m.symbol?.split("/")[1],
    price: parseFloat(m.lastPrice) || 0,
    change: parseFloat(m.priceChangePercent) || 0,
    volume: m.volume24h ?? m.volume ?? "—",
    high: parseFloat(m.highPrice) || 0,
    low: parseFloat(m.lowPrice) || 0,
    type: m.type ?? "spot",
  })) : MOCK_MARKETS;

  const filtered = markets.filter((m: typeof MOCK_MARKETS[0]) => {
    const matchSearch = m.symbol.toLowerCase().includes(search.toLowerCase()) || m.base.toLowerCase().includes(search.toLowerCase());
    const matchFilter = filter === "all" || m.type === filter;
    return matchSearch && matchFilter;
  });

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    refetch().finally(() => setRefreshing(false));
  }, [refetch]);

  const openTrade = (m: typeof MOCK_MARKETS[0]) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const slug = m.symbol.replace(/\//g, "-");
    router.push(`/trade/${slug}` as any);
  };

  const topGainers = [...markets].sort((a: any, b: any) => b.change - a.change).slice(0, 3);
  const topVol = markets.slice(0, 3);

  return (
    <View style={[styles.container, { backgroundColor: C.background }]}>
      {/* Header */}
      <View style={[styles.header, { paddingTop: Platform.OS === "web" ? 67 : insets.top + 12 }]}>
        <View>
          <Text style={styles.logo}>Orah<Text style={{ color: C.primary }}>DEX</Text></Text>
          <Text style={styles.slogan}>✦ Always comes to Orah DEX</Text>
        </View>
        <View style={styles.headerRight}>
          <TouchableOpacity style={[styles.iconBtn, { backgroundColor: C.primary + "18" }]} onPress={() => router.push("/wallet" as any)}>
            <Feather name="link" size={18} color={C.primary} />
          </TouchableOpacity>
        </View>
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
            { label: "Markets", value: `${markets.length}` },
            { label: "TVL", value: "$845M" },
          ].map((s) => (
            <View key={s.label} style={styles.statItem}>
              <Text style={styles.statValue}>{s.value}</Text>
              <Text style={styles.statLabel}>{s.label}</Text>
            </View>
          ))}
        </View>

        {/* Top movers */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Top Movers</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 20, gap: 12 }}>
            {topGainers.map((m: typeof MOCK_MARKETS[0]) => (
              <Pressable key={m.symbol} style={styles.moverCard} onPress={() => openTrade(m)}>
                <Text style={styles.moverBase}>{m.base}</Text>
                <Text style={styles.moverPrice}>${formatPrice(m.price)}</Text>
                <View style={[styles.changePill, { backgroundColor: m.change >= 0 ? C.buyBg : C.sellBg }]}>
                  <Text style={[styles.changePillText, { color: m.change >= 0 ? C.buy : C.sell }]}>
                    {m.change >= 0 ? "+" : ""}{m.change.toFixed(2)}%
                  </Text>
                </View>
              </Pressable>
            ))}
          </ScrollView>
        </View>

        {/* Search + Filter */}
        <View style={styles.searchRow}>
          <View style={styles.searchBox}>
            <Feather name="search" size={15} color={C.textMuted} />
            <TextInput
              style={styles.searchInput}
              placeholder="Search markets..."
              placeholderTextColor={C.textMuted}
              value={search}
              onChangeText={setSearch}
            />
            {search.length > 0 && (
              <TouchableOpacity onPress={() => setSearch("")}>
                <Feather name="x" size={15} color={C.textMuted} />
              </TouchableOpacity>
            )}
          </View>
        </View>

        <View style={styles.filterRow}>
          {(["all", "spot", "futures"] as Filter[]).map((f) => (
            <TouchableOpacity
              key={f}
              style={[styles.filterBtn, filter === f && styles.filterBtnActive]}
              onPress={() => { Haptics.selectionAsync(); setFilter(f); }}
            >
              <Text style={[styles.filterBtnText, filter === f && styles.filterBtnTextActive]}>
                {f.charAt(0).toUpperCase() + f.slice(1)}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Market list */}
        <View style={styles.listContainer}>
          <View style={styles.listHeader}>
            <Text style={[styles.colHeader, { flex: 2 }]}>Pair</Text>
            <Text style={[styles.colHeader, { flex: 2, textAlign: "right" }]}>Price</Text>
            <Text style={[styles.colHeader, { flex: 1.5, textAlign: "center" }]}>Chart</Text>
            <Text style={[styles.colHeader, { flex: 1.5, textAlign: "right" }]}>24h</Text>
          </View>

          {filtered.map((m: typeof MOCK_MARKETS[0], idx: number) => (
            <TouchableOpacity
              key={m.symbol}
              style={[styles.marketRow, idx === filtered.length - 1 && { borderBottomWidth: 0 }]}
              onPress={() => openTrade(m)}
              activeOpacity={0.7}
            >
              <View style={[{ flex: 2, flexDirection: "row", alignItems: "center", gap: 10 }]}>
                <View>
                  <Text style={styles.pairBase}>{m.base}<Text style={styles.pairQuote}>/{m.quote}</Text></Text>
                  {m.type === "futures" && (
                    <View style={styles.perpBadge}>
                      <Text style={styles.perpBadgeText}>PERP</Text>
                    </View>
                  )}
                </View>
              </View>

              <View style={{ flex: 2, alignItems: "flex-end" }}>
                <Text style={styles.priceText}>${formatPrice(m.price)}</Text>
                <Text style={styles.volText}>{m.volume}</Text>
              </View>

              <View style={{ flex: 1.5, alignItems: "center" }}>
                <MiniBar change={m.change} />
              </View>

              <View style={{ flex: 1.5, alignItems: "flex-end" }}>
                <View style={[styles.changePill, { backgroundColor: m.change >= 0 ? C.buyBg : C.sellBg }]}>
                  <Text style={[styles.changePillText, { color: m.change >= 0 ? C.buy : C.sell }]}>
                    {m.change >= 0 ? "+" : ""}{m.change.toFixed(2)}%
                  </Text>
                </View>
              </View>
            </TouchableOpacity>
          ))}
        </View>

        <View style={{ height: Platform.OS === "web" ? 100 : 100 }} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingBottom: 16,
  },
  logo: { fontSize: 22, fontFamily: "Inter_700Bold", color: Colors.dark.text, letterSpacing: -0.5 },
  slogan: { fontSize: 10, color: Colors.dark.primary, fontFamily: "Inter_500Medium", marginTop: 1, opacity: 0.8 },
  headerRight: { flexDirection: "row", gap: 8 },
  iconBtn: {
    width: 38, height: 38, borderRadius: 12,
    backgroundColor: Colors.dark.card,
    borderWidth: 1, borderColor: Colors.dark.cardBorder,
    alignItems: "center", justifyContent: "center",
  },
  statsRow: {
    flexDirection: "row",
    marginHorizontal: 20,
    marginBottom: 20,
    backgroundColor: Colors.dark.card,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: Colors.dark.cardBorder,
    padding: 16,
  },
  statItem: { flex: 1, alignItems: "center" },
  statValue: { fontFamily: "Inter_700Bold", fontSize: 15, color: Colors.dark.text },
  statLabel: { fontFamily: "Inter_400Regular", fontSize: 11, color: Colors.dark.textMuted, marginTop: 2 },
  section: { marginBottom: 20 },
  sectionTitle: { fontFamily: "Inter_600SemiBold", fontSize: 15, color: Colors.dark.text, marginBottom: 12, paddingHorizontal: 20 },
  moverCard: {
    backgroundColor: Colors.dark.card,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: Colors.dark.cardBorder,
    padding: 14,
    width: 130,
    gap: 6,
  },
  moverBase: { fontFamily: "Inter_600SemiBold", fontSize: 14, color: Colors.dark.text },
  moverPrice: { fontFamily: "Inter_700Bold", fontSize: 13, color: Colors.dark.text },
  coinIcon: {
    width: 32, height: 32, borderRadius: 10,
    alignItems: "center", justifyContent: "center",
    borderWidth: 1,
  },
  coinIconText: { fontFamily: "Inter_700Bold", fontSize: 13 },
  changePill: {
    paddingHorizontal: 7, paddingVertical: 3,
    borderRadius: 8, alignSelf: "flex-start",
  },
  changePillText: { fontFamily: "Inter_600SemiBold", fontSize: 11 },
  searchRow: { paddingHorizontal: 20, marginBottom: 10 },
  searchBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: Colors.dark.card,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.dark.cardBorder,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  searchInput: {
    flex: 1,
    fontFamily: "Inter_400Regular",
    fontSize: 14,
    color: Colors.dark.text,
  },
  filterRow: { flexDirection: "row", gap: 8, paddingHorizontal: 20, marginBottom: 16 },
  filterBtn: {
    paddingHorizontal: 14, paddingVertical: 7,
    borderRadius: 10,
    backgroundColor: Colors.dark.card,
    borderWidth: 1, borderColor: Colors.dark.cardBorder,
  },
  filterBtnActive: {
    backgroundColor: Colors.dark.primary + "18",
    borderColor: Colors.dark.primary + "60",
  },
  filterBtnText: { fontFamily: "Inter_500Medium", fontSize: 13, color: Colors.dark.textSecondary },
  filterBtnTextActive: { color: Colors.dark.primary },
  listContainer: {
    marginHorizontal: 20,
    backgroundColor: Colors.dark.card,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: Colors.dark.cardBorder,
    overflow: "hidden",
  },
  listHeader: {
    flexDirection: "row",
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: Colors.dark.separator,
  },
  colHeader: { fontFamily: "Inter_500Medium", fontSize: 11, color: Colors.dark.textMuted, textTransform: "uppercase", letterSpacing: 0.5 },
  marketRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: Colors.dark.separator,
  },
  pairBase: { fontFamily: "Inter_600SemiBold", fontSize: 14, color: Colors.dark.text },
  pairQuote: { fontFamily: "Inter_400Regular", fontSize: 13, color: Colors.dark.textMuted },
  priceText: { fontFamily: "Inter_700Bold", fontSize: 14, color: Colors.dark.text },
  volText: { fontFamily: "Inter_400Regular", fontSize: 11, color: Colors.dark.textMuted, marginTop: 2 },
  perpBadge: {
    backgroundColor: Colors.dark.accent + "22",
    paddingHorizontal: 5, paddingVertical: 2,
    borderRadius: 5, alignSelf: "flex-start", marginTop: 2,
  },
  perpBadgeText: { fontFamily: "Inter_600SemiBold", fontSize: 9, color: Colors.dark.accent },
});
