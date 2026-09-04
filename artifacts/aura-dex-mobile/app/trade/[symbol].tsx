import React, { useState, useMemo } from "react";
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  TextInput, Platform, Alert,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";
import { router, useLocalSearchParams } from "expo-router";
import * as Haptics from "expo-haptics";
import { Colors } from "@/constants/colors";
import { useWallet } from "@/context/WalletContext";
import { getMockMarket, genOrderBook, fmtPrice } from "@/utils/mockMarkets";

const C = Colors.dark;

type Side = "buy" | "sell";
type OrderType = "limit" | "market";

export default function TradeScreen() {
  const insets = useSafeAreaInsets();
  const { symbol: rawSymbol } = useLocalSearchParams<{ symbol: string }>();
  const { wallet } = useWallet();
  const [side, setSide] = useState<Side>("buy");
  const [orderType, setOrderType] = useState<OrderType>("limit");
  const [amount, setAmount] = useState("");
  const [activeTab, setActiveTab] = useState<"book" | "trades">("book");

  // Resolve pair data from the URL slug (e.g. "AERO-USDC" → "AERO/USDC")
  const market = useMemo(() => getMockMarket(rawSymbol ?? "BSV-USDT"), [rawSymbol]);
  const { base, quote, price: currentPrice, change, high, low, volume } = market;
  const displaySymbol = `${base}/${quote}`;

  const [limitPrice, setLimitPrice] = useState(fmtPrice(currentPrice));

  // Generate order book seeded from price
  const { asks, bids } = useMemo(() => genOrderBook(currentPrice, quote), [currentPrice, quote]);
  const maxAsk = Math.max(...asks.map(([, q]) => q));
  const maxBid = Math.max(...bids.map(([, q]) => q));

  // Mock recent trades
  const mockTrades = useMemo(() => {
    const tick = currentPrice * 0.0003;
    return Array.from({ length: 8 }, (_, i) => ({
      price: currentPrice + (Math.random() > 0.5 ? 1 : -1) * tick * (i + 1),
      qty: parseFloat((Math.random() * 50 + 1).toFixed(3)),
      time: `${String(9 + (i % 3)).padStart(2, "0")}:${String(18 + (i % 5)).padStart(2, "0")}:${String(40 + i).padStart(2, "0")}`,
      side: Math.random() > 0.5 ? "buy" : "sell" as Side,
    }));
  }, [currentPrice]);

  const total = parseFloat(limitPrice || "0") * parseFloat(amount || "0");

  const handleOrder = () => {
    if (!wallet) {
      Alert.alert("Connect Wallet", "Connect your wallet to place orders.");
      return;
    }
    if (!amount || parseFloat(amount) <= 0) return;
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    Alert.alert(
      "Order Placed",
      `${side.toUpperCase()} ${amount} ${base} @ ${orderType === "market" ? "Market" : fmtPrice(parseFloat(limitPrice))} ${quote}`,
    );
    setAmount("");
  };

  return (
    <View style={[styles.container, { backgroundColor: C.background }]}>
      {/* Header */}
      <View style={[styles.header, { paddingTop: Platform.OS === "web" ? 67 : insets.top + 12 }]}>
        <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
          <Feather name="arrow-left" size={20} color={C.text} />
        </TouchableOpacity>
        <View style={{ flex: 1, marginLeft: 12 }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
            <Text style={styles.pairTitle}>{displaySymbol}</Text>
            <View style={[styles.changeBadge, { backgroundColor: change >= 0 ? C.buyBg : C.sellBg }]}>
              <Text style={[styles.changeText, { color: change >= 0 ? C.buy : C.sell }]}>
                {change >= 0 ? "+" : ""}{change.toFixed(2)}%
              </Text>
            </View>
          </View>
          <View style={{ flexDirection: "row", gap: 12, marginTop: 3 }}>
            <Text style={styles.priceSmall}>H: {fmtPrice(high)}</Text>
            <Text style={styles.priceSmall}>L: {fmtPrice(low)}</Text>
            <Text style={styles.priceSmall}>Vol: {volume}</Text>
          </View>
        </View>
        <Text style={[styles.priceHero, { color: change >= 0 ? C.buy : C.sell }]}>
          {fmtPrice(currentPrice)}
        </Text>
      </View>

      <View style={{ flex: 1, flexDirection: "row" }}>
        {/* Order Book / Trades panel */}
        <View style={styles.bookPanel}>
          <View style={styles.bookTabs}>
            {(["book", "trades"] as const).map(t => (
              <TouchableOpacity
                key={t}
                style={[styles.bookTab, activeTab === t && styles.bookTabActive]}
                onPress={() => setActiveTab(t)}
              >
                <Text style={[styles.bookTabText, activeTab === t && styles.bookTabTextActive]}>
                  {t === "book" ? "Book" : "Trades"}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          {activeTab === "book" ? (
            <View style={{ flex: 1 }}>
              <View style={styles.bookHeader}>
                <Text style={styles.bookColHdr}>Price({quote})</Text>
                <Text style={[styles.bookColHdr, { textAlign: "right" }]}>Qty</Text>
              </View>
              {[...asks].reverse().map(([p, q], i) => (
                <View key={i} style={styles.bookRow}>
                  <View style={[styles.depthBar, { width: `${(q / maxAsk) * 100}%`, backgroundColor: C.sell + "18" }]} />
                  <Text style={[styles.bookPrice, { color: C.sell }]}>{fmtPrice(p)}</Text>
                  <Text style={styles.bookQty}>{q.toFixed(2)}</Text>
                </View>
              ))}
              <View style={styles.spreadRow}>
                <Text style={styles.spreadPrice}>{fmtPrice(currentPrice)}</Text>
                <Text style={[styles.spreadLabel, { color: change >= 0 ? C.buy : C.sell }]}>Mark</Text>
              </View>
              {bids.map(([p, q], i) => (
                <View key={i} style={styles.bookRow}>
                  <View style={[styles.depthBar, { width: `${(q / maxBid) * 100}%`, backgroundColor: C.buy + "18" }]} />
                  <Text style={[styles.bookPrice, { color: C.buy }]}>{fmtPrice(p)}</Text>
                  <Text style={styles.bookQty}>{q.toFixed(2)}</Text>
                </View>
              ))}
            </View>
          ) : (
            <View style={{ flex: 1 }}>
              <View style={styles.bookHeader}>
                <Text style={styles.bookColHdr}>Price</Text>
                <Text style={[styles.bookColHdr, { textAlign: "right" }]}>Time</Text>
              </View>
              {mockTrades.map((t, i) => (
                <View key={i} style={styles.bookRow}>
                  <Text style={[styles.bookPrice, { color: t.side === "buy" ? C.buy : C.sell }]}>
                    {fmtPrice(t.price)}
                  </Text>
                  <Text style={styles.bookQty}>{t.time.slice(-8)}</Text>
                </View>
              ))}
            </View>
          )}
        </View>

        {/* Order Form */}
        <View style={styles.formPanel}>
          {/* Buy / Sell */}
          <View style={styles.sideTabs}>
            {(["buy", "sell"] as Side[]).map(s => (
              <TouchableOpacity
                key={s}
                style={[styles.sideTab, side === s && { backgroundColor: s === "buy" ? C.buy : C.sell, borderColor: s === "buy" ? C.buy : C.sell }]}
                onPress={() => { Haptics.selectionAsync(); setSide(s); }}
              >
                <Text style={[styles.sideTabText, side === s && { color: "#fff" }]}>
                  {s === "buy" ? "Buy" : "Sell"}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* Limit / Market */}
          <View style={styles.orderTypeTabs}>
            {(["limit", "market"] as OrderType[]).map(t => (
              <TouchableOpacity
                key={t}
                style={[styles.orderTypeBtn, orderType === t && styles.orderTypeBtnActive]}
                onPress={() => setOrderType(t)}
              >
                <Text style={[styles.orderTypeBtnText, orderType === t && styles.orderTypeBtnTextActive]}>
                  {t.charAt(0).toUpperCase() + t.slice(1)}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* Avail */}
          <View style={styles.availRow}>
            <Text style={styles.availLabel}>Avail</Text>
            <Text style={styles.availValue}>
              {side === "buy" ? `0.00 ${quote}` : `0.00 ${base}`}
            </Text>
          </View>

          {/* Price */}
          {orderType === "limit" ? (
            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>Price</Text>
              <View style={styles.inputBox}>
                <TextInput
                  style={styles.input}
                  value={limitPrice}
                  onChangeText={setLimitPrice}
                  keyboardType="decimal-pad"
                  placeholderTextColor={C.textMuted}
                />
                <Text style={styles.inputUnit}>{quote}</Text>
              </View>
            </View>
          ) : (
            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>Price</Text>
              <View style={[styles.inputBox, { opacity: 0.5 }]}>
                <Text style={[styles.input, { color: C.textMuted }]}>Market</Text>
              </View>
            </View>
          )}

          {/* Amount */}
          <View style={styles.inputGroup}>
            <Text style={styles.inputLabel}>Amount</Text>
            <View style={styles.inputBox}>
              <TextInput
                style={styles.input}
                value={amount}
                onChangeText={setAmount}
                keyboardType="decimal-pad"
                placeholder="0.00"
                placeholderTextColor={C.textMuted}
              />
              <Text style={styles.inputUnit}>{base}</Text>
            </View>
          </View>

          {/* % shortcuts */}
          <View style={styles.pctRow}>
            {[25, 50, 75, 100].map(pct => (
              <TouchableOpacity
                key={pct}
                style={styles.pctBtn}
                onPress={() => { Haptics.selectionAsync(); setAmount("0.00"); }}
              >
                <Text style={styles.pctBtnText}>{pct}%</Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* Total */}
          {orderType === "limit" && (
            <View style={styles.totalRow}>
              <Text style={styles.totalLabel}>Total</Text>
              <Text style={styles.totalValue}>
                {isNaN(total) ? "0.00" : total.toFixed(4)} {quote}
              </Text>
            </View>
          )}

          {/* Submit */}
          <TouchableOpacity
            style={[
              styles.orderBtn,
              { backgroundColor: side === "buy" ? C.buy : C.sell },
              (!amount || parseFloat(amount) <= 0) && { opacity: 0.5 },
            ]}
            onPress={handleOrder}
            disabled={!amount || parseFloat(amount) <= 0}
          >
            <Text style={styles.orderBtnText}>
              {wallet ? `${side === "buy" ? "Buy" : "Sell"} ${base}` : "Connect Wallet"}
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: "row", alignItems: "center",
    paddingHorizontal: 16, paddingBottom: 12,
    borderBottomWidth: 1, borderBottomColor: C.separator,
  },
  backBtn: {
    width: 36, height: 36, borderRadius: 10,
    backgroundColor: C.card, alignItems: "center", justifyContent: "center",
    borderWidth: 1, borderColor: C.cardBorder,
  },
  pairTitle: { fontFamily: "Inter_700Bold", fontSize: 16, color: C.text },
  changeBadge: { paddingHorizontal: 7, paddingVertical: 3, borderRadius: 7 },
  changeText: { fontFamily: "Inter_600SemiBold", fontSize: 11 },
  priceSmall: { fontFamily: "Inter_400Regular", fontSize: 11, color: C.textMuted },
  priceHero: { fontFamily: "Inter_700Bold", fontSize: 17 },
  bookPanel: { width: 135, borderRightWidth: 1, borderRightColor: C.separator, backgroundColor: C.card },
  formPanel: { flex: 1, padding: 12 },
  bookTabs: { flexDirection: "row", borderBottomWidth: 1, borderBottomColor: C.separator },
  bookTab: { flex: 1, paddingVertical: 8, alignItems: "center" },
  bookTabActive: { borderBottomWidth: 2, borderBottomColor: C.primary },
  bookTabText: { fontFamily: "Inter_500Medium", fontSize: 11, color: C.textMuted },
  bookTabTextActive: { color: C.primary },
  bookHeader: {
    flexDirection: "row", justifyContent: "space-between",
    paddingHorizontal: 6, paddingVertical: 4,
    borderBottomWidth: 1, borderBottomColor: C.separator,
  },
  bookColHdr: { fontFamily: "Inter_500Medium", fontSize: 8, color: C.textMuted, textTransform: "uppercase" },
  bookRow: {
    flexDirection: "row", justifyContent: "space-between",
    paddingHorizontal: 6, paddingVertical: 3, position: "relative",
  },
  depthBar: { position: "absolute", right: 0, top: 0, bottom: 0, borderRadius: 1 },
  bookPrice: { fontFamily: "Inter_600SemiBold", fontSize: 10, zIndex: 1 },
  bookQty: { fontFamily: "Inter_400Regular", fontSize: 9, color: C.textSecondary, zIndex: 1 },
  spreadRow: {
    flexDirection: "row", justifyContent: "space-between", alignItems: "center",
    paddingHorizontal: 6, paddingVertical: 5, backgroundColor: C.surface,
  },
  spreadPrice: { fontFamily: "Inter_700Bold", fontSize: 11, color: C.text },
  spreadLabel: { fontFamily: "Inter_600SemiBold", fontSize: 10 },
  sideTabs: { flexDirection: "row", gap: 8, marginBottom: 10 },
  sideTab: {
    flex: 1, paddingVertical: 9, borderRadius: 10,
    borderWidth: 1.5, borderColor: C.cardBorder, alignItems: "center",
  },
  sideTabText: { fontFamily: "Inter_700Bold", fontSize: 13, color: C.textSecondary },
  orderTypeTabs: {
    flexDirection: "row", marginBottom: 10,
    backgroundColor: C.surface, borderRadius: 10, padding: 3,
  },
  orderTypeBtn: { flex: 1, paddingVertical: 6, alignItems: "center", borderRadius: 8 },
  orderTypeBtnActive: { backgroundColor: C.card },
  orderTypeBtnText: { fontFamily: "Inter_500Medium", fontSize: 12, color: C.textMuted },
  orderTypeBtnTextActive: { color: C.text },
  availRow: { flexDirection: "row", justifyContent: "space-between", marginBottom: 8 },
  availLabel: { fontFamily: "Inter_400Regular", fontSize: 11, color: C.textMuted },
  availValue: { fontFamily: "Inter_500Medium", fontSize: 11, color: C.textSecondary },
  inputGroup: { marginBottom: 8 },
  inputLabel: { fontFamily: "Inter_400Regular", fontSize: 11, color: C.textMuted, marginBottom: 4 },
  inputBox: {
    flexDirection: "row", alignItems: "center",
    backgroundColor: C.surface, borderRadius: 10,
    borderWidth: 1, borderColor: C.surfaceBorder,
    paddingHorizontal: 10, paddingVertical: 8,
  },
  input: { flex: 1, fontFamily: "Inter_600SemiBold", fontSize: 13, color: C.text },
  inputUnit: { fontFamily: "Inter_500Medium", fontSize: 11, color: C.textMuted },
  pctRow: { flexDirection: "row", gap: 5, marginBottom: 10 },
  pctBtn: {
    flex: 1, paddingVertical: 5,
    backgroundColor: C.surface, borderRadius: 8, borderWidth: 1, borderColor: C.surfaceBorder,
    alignItems: "center",
  },
  pctBtnText: { fontFamily: "Inter_600SemiBold", fontSize: 11, color: C.textSecondary },
  totalRow: { flexDirection: "row", justifyContent: "space-between", marginBottom: 10 },
  totalLabel: { fontFamily: "Inter_400Regular", fontSize: 12, color: C.textMuted },
  totalValue: { fontFamily: "Inter_600SemiBold", fontSize: 12, color: C.text },
  orderBtn: {
    paddingVertical: 12, borderRadius: 12, alignItems: "center",
    shadowColor: "#000", shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3, shadowRadius: 8, elevation: 4,
  },
  orderBtnText: { fontFamily: "Inter_700Bold", fontSize: 14, color: "#fff" },
});
