import React, { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Platform,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Feather, Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { Colors } from "@/constants/colors";

const C = Colors.dark;

const FUTURES = [
  { symbol: "BSV/USDT", markPrice: 55.85, indexPrice: 55.72, fundingRate: 0.0082, change: 4.12, openInterest: "$12.4M", volume: "$8.2M" },
  { symbol: "BTC/USDT", markPrice: 65180, indexPrice: 65200, fundingRate: -0.0041, change: -1.90, openInterest: "$890M", volume: "$980M" },
  { symbol: "ETH/USDT", markPrice: 3195, indexPrice: 3198, fundingRate: 0.0102, change: 1.48, openInterest: "$340M", volume: "$340M" },
];

const POSITIONS = [
  { symbol: "BSV/USDT", side: "long", size: 500, leverage: 10, entryPrice: 52.40, markPrice: 55.85, pnl: 329.5, pnlPct: 6.58, margin: 2620 },
];

export default function FuturesScreen() {
  const insets = useSafeAreaInsets();
  const [leverage, setLeverage] = useState(10);

  return (
    <View style={[styles.container, { backgroundColor: C.background }]}>
      <View style={[styles.header, { paddingTop: Platform.OS === "web" ? 67 : insets.top + 12 }]}>
        <Text style={styles.logo}>Futures</Text>
        <View style={styles.badgeRow}>
          <View style={styles.perpBadge}><Text style={styles.perpBadgeText}>PERP</Text></View>
          <View style={styles.liveBadge}>
            <View style={styles.liveDot} />
            <Text style={styles.liveText}>Live</Text>
          </View>
        </View>
      </View>

      <ScrollView style={{ flex: 1 }} showsVerticalScrollIndicator={false}>
        {/* Positions */}
        <Text style={styles.sectionTitle}>Open Positions</Text>
        {POSITIONS.map((pos) => (
          <View key={pos.symbol} style={styles.positionCard}>
            <View style={styles.positionHeader}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                <Text style={styles.posSymbol}>{pos.symbol}</Text>
                <View style={[styles.sidePill, { backgroundColor: C.buyBg }]}>
                  <Text style={[styles.sidePillText, { color: C.buy }]}>{pos.side.toUpperCase()}</Text>
                </View>
                <View style={styles.leveragePill}>
                  <Text style={styles.leverageText}>{pos.leverage}x</Text>
                </View>
              </View>
              <Text style={[styles.pnlValue, { color: pos.pnl >= 0 ? C.buy : C.sell }]}>
                +${pos.pnl.toFixed(2)}
              </Text>
            </View>

            <View style={styles.positionGrid}>
              {[
                { label: "Size", value: `${pos.size} BSV` },
                { label: "Entry", value: `$${pos.entryPrice}` },
                { label: "Mark", value: `$${pos.markPrice}` },
                { label: "PnL %", value: `+${pos.pnlPct.toFixed(2)}%`, color: C.buy },
              ].map((item) => (
                <View key={item.label} style={styles.posGridItem}>
                  <Text style={styles.posGridLabel}>{item.label}</Text>
                  <Text style={[styles.posGridValue, item.color ? { color: item.color } : {}]}>{item.value}</Text>
                </View>
              ))}
            </View>

            <TouchableOpacity style={styles.closeBtn}>
              <Text style={styles.closeBtnText}>Close Position</Text>
            </TouchableOpacity>
          </View>
        ))}

        {/* Futures Markets */}
        <Text style={styles.sectionTitle}>Perpetual Contracts</Text>
        <View style={styles.card}>
          {FUTURES.map((f, idx) => (
            <View key={f.symbol} style={[styles.futuresRow, idx === FUTURES.length - 1 && { borderBottomWidth: 0 }]}>
              <View style={{ flex: 1 }}>
                <Text style={styles.futSymbol}>{f.symbol} <Text style={{ color: C.accent, fontSize: 11 }}>PERP</Text></Text>
                <View style={{ flexDirection: "row", gap: 8, marginTop: 4 }}>
                  <Text style={styles.futMeta}>OI: {f.openInterest}</Text>
                  <Text style={styles.futMeta}>Vol: {f.volume}</Text>
                </View>
              </View>
              <View style={{ alignItems: "flex-end" }}>
                <Text style={styles.futPrice}>${f.markPrice.toLocaleString()}</Text>
                <View style={{ flexDirection: "row", gap: 8, marginTop: 4, alignItems: "center" }}>
                  <Text style={[styles.futChange, { color: f.change >= 0 ? C.buy : C.sell }]}>
                    {f.change >= 0 ? "+" : ""}{f.change.toFixed(2)}%
                  </Text>
                  <View style={[styles.fundingBadge, { backgroundColor: f.fundingRate >= 0 ? C.buyBg : C.sellBg }]}>
                    <Feather name="clock" size={9} color={f.fundingRate >= 0 ? C.buy : C.sell} />
                    <Text style={[styles.fundingText, { color: f.fundingRate >= 0 ? C.buy : C.sell }]}>
                      {f.fundingRate >= 0 ? "+" : ""}{(f.fundingRate * 100).toFixed(4)}%
                    </Text>
                  </View>
                </View>
              </View>
            </View>
          ))}
        </View>

        {/* Leverage Simulator */}
        <Text style={styles.sectionTitle}>Leverage</Text>
        <View style={styles.leverageCard}>
          <View style={{ flexDirection: "row", justifyContent: "space-between", marginBottom: 12 }}>
            <Text style={styles.leverageCardLabel}>Selected Leverage</Text>
            <Text style={styles.leverageCardValue}>{leverage}x</Text>
          </View>
          <View style={styles.leverageRow}>
            {[1, 3, 5, 10, 20, 50, 100, 125].map((lv) => (
              <TouchableOpacity
                key={lv}
                style={[styles.lvBtn, leverage === lv && styles.lvBtnActive]}
                onPress={() => { Haptics.selectionAsync(); setLeverage(lv); }}
              >
                <Text style={[styles.lvBtnText, leverage === lv && styles.lvBtnTextActive]}>{lv}x</Text>
              </TouchableOpacity>
            ))}
          </View>
          <View style={styles.leverageInfo}>
            <Feather name="alert-triangle" size={12} color={C.textMuted} />
            <Text style={styles.leverageInfoText}>High leverage increases risk. Trade responsibly.</Text>
          </View>
        </View>

        {/* Stats */}
        <Text style={styles.sectionTitle}>Market Stats</Text>
        <View style={styles.statsGrid}>
          {[
            { label: "Total OI", value: "$1.24B" },
            { label: "24h Volume", value: "$328M" },
            { label: "Liquidations", value: "$4.2M" },
            { label: "Long/Short", value: "58% / 42%" },
          ].map((s) => (
            <View key={s.label} style={styles.statCard}>
              <Text style={styles.statCardValue}>{s.value}</Text>
              <Text style={styles.statCardLabel}>{s.label}</Text>
            </View>
          ))}
        </View>

        <View style={{ height: 100 }} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    paddingHorizontal: 20, paddingBottom: 16,
  },
  logo: { fontFamily: "Inter_700Bold", fontSize: 22, color: C.text },
  badgeRow: { flexDirection: "row", gap: 8, alignItems: "center" },
  perpBadge: { backgroundColor: C.accent + "22", paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8 },
  perpBadgeText: { fontFamily: "Inter_700Bold", fontSize: 11, color: C.accent },
  liveBadge: { flexDirection: "row", alignItems: "center", gap: 5, backgroundColor: C.buyBg, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8 },
  liveDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: C.buy },
  liveText: { fontFamily: "Inter_600SemiBold", fontSize: 11, color: C.buy },
  sectionTitle: { fontFamily: "Inter_600SemiBold", fontSize: 15, color: C.text, marginBottom: 12, paddingHorizontal: 20 },
  card: { marginHorizontal: 20, marginBottom: 24, backgroundColor: C.card, borderRadius: 16, borderWidth: 1, borderColor: C.cardBorder, overflow: "hidden" },
  positionCard: { marginHorizontal: 20, marginBottom: 16, backgroundColor: C.card, borderRadius: 16, borderWidth: 1, borderColor: C.primary + "30", padding: 16 },
  positionHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 16 },
  posSymbol: { fontFamily: "Inter_700Bold", fontSize: 15, color: C.text },
  sidePill: { paddingHorizontal: 7, paddingVertical: 3, borderRadius: 7 },
  sidePillText: { fontFamily: "Inter_700Bold", fontSize: 10 },
  leveragePill: { backgroundColor: C.primary + "20", paddingHorizontal: 7, paddingVertical: 3, borderRadius: 7 },
  leverageText: { fontFamily: "Inter_700Bold", fontSize: 10, color: C.primary },
  pnlValue: { fontFamily: "Inter_700Bold", fontSize: 18 },
  positionGrid: { flexDirection: "row", flexWrap: "wrap", gap: 12, marginBottom: 16 },
  posGridItem: { flex: 1, minWidth: "40%" },
  posGridLabel: { fontFamily: "Inter_400Regular", fontSize: 11, color: C.textMuted, marginBottom: 3 },
  posGridValue: { fontFamily: "Inter_600SemiBold", fontSize: 13, color: C.text },
  closeBtn: { backgroundColor: C.sell + "15", borderWidth: 1, borderColor: C.sell + "40", borderRadius: 10, paddingVertical: 10, alignItems: "center" },
  closeBtnText: { fontFamily: "Inter_600SemiBold", fontSize: 13, color: C.sell },
  futuresRow: { flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingVertical: 16, borderBottomWidth: 1, borderBottomColor: C.separator },
  futSymbol: { fontFamily: "Inter_600SemiBold", fontSize: 14, color: C.text },
  futMeta: { fontFamily: "Inter_400Regular", fontSize: 11, color: C.textMuted },
  futPrice: { fontFamily: "Inter_700Bold", fontSize: 14, color: C.text },
  futChange: { fontFamily: "Inter_600SemiBold", fontSize: 12 },
  fundingBadge: { flexDirection: "row", alignItems: "center", gap: 3, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6 },
  fundingText: { fontFamily: "Inter_600SemiBold", fontSize: 10 },
  leverageCard: { marginHorizontal: 20, marginBottom: 24, backgroundColor: C.card, borderRadius: 16, borderWidth: 1, borderColor: C.cardBorder, padding: 16 },
  leverageCardLabel: { fontFamily: "Inter_500Medium", fontSize: 13, color: C.textSecondary },
  leverageCardValue: { fontFamily: "Inter_700Bold", fontSize: 22, color: C.primary },
  leverageRow: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 12 },
  lvBtn: { paddingHorizontal: 12, paddingVertical: 7, backgroundColor: C.surface, borderRadius: 10, borderWidth: 1, borderColor: C.surfaceBorder },
  lvBtnActive: { backgroundColor: C.primary + "20", borderColor: C.primary + "60" },
  lvBtnText: { fontFamily: "Inter_600SemiBold", fontSize: 13, color: C.textSecondary },
  lvBtnTextActive: { color: C.primary },
  leverageInfo: { flexDirection: "row", alignItems: "center", gap: 6 },
  leverageInfoText: { fontFamily: "Inter_400Regular", fontSize: 11, color: C.textMuted },
  statsGrid: { flexDirection: "row", flexWrap: "wrap", paddingHorizontal: 20, gap: 10, marginBottom: 24 },
  statCard: { flex: 1, minWidth: "45%", backgroundColor: C.card, borderRadius: 14, borderWidth: 1, borderColor: C.cardBorder, padding: 14 },
  statCardValue: { fontFamily: "Inter_700Bold", fontSize: 16, color: C.text },
  statCardLabel: { fontFamily: "Inter_400Regular", fontSize: 11, color: C.textMuted, marginTop: 4 },
});
