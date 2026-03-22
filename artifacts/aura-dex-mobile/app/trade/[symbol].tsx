import React, { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Platform,
  Alert,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Feather, Ionicons } from "@expo/vector-icons";
import { router, useLocalSearchParams } from "expo-router";
import * as Haptics from "expo-haptics";
import { Colors } from "@/constants/colors";
import { useWallet } from "@/context/WalletContext";

const C = Colors.dark;

const MOCK_BOOK = {
  asks: [
    [56.05, 396.78], [56.04, 336.13], [56.03, 270.59],
    [56.02, 210.33], [56.01, 185.44], [56.00, 343.37],
  ],
  bids: [
    [55.99, 159.33], [55.98, 370.44], [55.97, 448.20],
    [55.96, 428.47], [55.95, 115.82], [55.94, 200.11],
  ],
};

const MOCK_TRADES = [
  { price: 55.45, qty: 6.60, time: "09:18:59", side: "buy" },
  { price: 55.43, qty: 12.30, time: "09:18:55", side: "sell" },
  { price: 55.48, qty: 3.20, time: "09:18:52", side: "buy" },
  { price: 55.41, qty: 8.90, time: "09:18:48", side: "sell" },
  { price: 55.50, qty: 15.10, time: "09:18:44", side: "buy" },
  { price: 55.44, qty: 9.75, time: "09:18:40", side: "sell" },
];

type Side = "buy" | "sell";
type OrderType = "limit" | "market";

export default function TradeScreen() {
  const insets = useSafeAreaInsets();
  const { symbol } = useLocalSearchParams<{ symbol: string }>();
  const { wallet } = useWallet();
  const [side, setSide] = useState<Side>("buy");
  const [orderType, setOrderType] = useState<OrderType>("limit");
  const [price, setPrice] = useState("55.42");
  const [amount, setAmount] = useState("");
  const [activeTab, setActiveTab] = useState<"book" | "trades">("book");

  const displaySymbol = symbol?.replace(/-/g, "/") ?? "BSV/USDT";
  const [base, quote] = displaySymbol.split("/");
  const currentPrice = 55.42;
  const change = 4.41;
  const total = parseFloat(price || "0") * parseFloat(amount || "0");

  const handleOrder = () => {
    if (!wallet) {
      Alert.alert("Connect Wallet", "Please connect your wallet to place orders.");
      return;
    }
    if (!amount || parseFloat(amount) <= 0) return;
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    Alert.alert("Order Placed", `${side.toUpperCase()} ${amount} ${base} @ ${orderType === "market" ? "Market" : "$" + price}`);
    setAmount("");
  };

  const maxAsk = Math.max(...MOCK_BOOK.asks.map(([, q]) => q));
  const maxBid = Math.max(...MOCK_BOOK.bids.map(([, q]) => q));

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
          <View style={{ flexDirection: "row", gap: 12, marginTop: 4 }}>
            <Text style={styles.priceSmall}>H: $57.10</Text>
            <Text style={styles.priceSmall}>L: $53.20</Text>
            <Text style={styles.priceSmall}>Vol: 18.5M</Text>
          </View>
        </View>
        <Text style={styles.priceHero}>${currentPrice.toFixed(2)}</Text>
      </View>

      <View style={{ flex: 1, flexDirection: "row" }}>
        {/* Left: Order Book / Trades */}
        <View style={styles.bookPanel}>
          <View style={styles.bookTabs}>
            <TouchableOpacity
              style={[styles.bookTab, activeTab === "book" && styles.bookTabActive]}
              onPress={() => setActiveTab("book")}
            >
              <Text style={[styles.bookTabText, activeTab === "book" && styles.bookTabTextActive]}>Book</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.bookTab, activeTab === "trades" && styles.bookTabActive]}
              onPress={() => setActiveTab("trades")}
            >
              <Text style={[styles.bookTabText, activeTab === "trades" && styles.bookTabTextActive]}>Trades</Text>
            </TouchableOpacity>
          </View>

          {activeTab === "book" ? (
            <View style={{ flex: 1 }}>
              <View style={styles.bookHeader}>
                <Text style={styles.bookColHeader}>Price</Text>
                <Text style={[styles.bookColHeader, { textAlign: "right" }]}>Qty</Text>
              </View>
              {/* Asks (reversed so highest ask is at top away from spread) */}
              {[...MOCK_BOOK.asks].reverse().map(([p, q], i) => (
                <View key={i} style={styles.bookRow}>
                  <View style={[styles.depthBar, { width: `${(q / maxAsk) * 100}%`, backgroundColor: C.sell + "18" }]} />
                  <Text style={[styles.bookPrice, { color: C.sell }]}>{p.toFixed(2)}</Text>
                  <Text style={styles.bookQty}>{q.toFixed(2)}</Text>
                </View>
              ))}
              {/* Spread */}
              <View style={styles.spreadRow}>
                <Text style={styles.spreadText}>${currentPrice.toFixed(2)}</Text>
                <Text style={[styles.spreadText, { color: C.buy }]}>Spread 0.01</Text>
              </View>
              {MOCK_BOOK.bids.map(([p, q], i) => (
                <View key={i} style={styles.bookRow}>
                  <View style={[styles.depthBar, { width: `${(q / maxBid) * 100}%`, backgroundColor: C.buy + "18" }]} />
                  <Text style={[styles.bookPrice, { color: C.buy }]}>{p.toFixed(2)}</Text>
                  <Text style={styles.bookQty}>{q.toFixed(2)}</Text>
                </View>
              ))}
            </View>
          ) : (
            <View style={{ flex: 1 }}>
              <View style={styles.bookHeader}>
                <Text style={styles.bookColHeader}>Price</Text>
                <Text style={[styles.bookColHeader, { textAlign: "right" }]}>Time</Text>
              </View>
              {MOCK_TRADES.map((t, i) => (
                <View key={i} style={styles.bookRow}>
                  <Text style={[styles.bookPrice, { color: t.side === "buy" ? C.buy : C.sell }]}>{t.price.toFixed(2)}</Text>
                  <Text style={styles.bookQty}>{t.time.slice(-8)}</Text>
                </View>
              ))}
            </View>
          )}
        </View>

        {/* Right: Order Form */}
        <View style={styles.formPanel}>
          {/* Buy/Sell tabs */}
          <View style={styles.sideTabs}>
            <TouchableOpacity
              style={[styles.sideTab, side === "buy" && { backgroundColor: C.buy, borderColor: C.buy }]}
              onPress={() => { Haptics.selectionAsync(); setSide("buy"); }}
            >
              <Text style={[styles.sideTabText, side === "buy" && { color: "#fff" }]}>Buy</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.sideTab, side === "sell" && { backgroundColor: C.sell, borderColor: C.sell }]}
              onPress={() => { Haptics.selectionAsync(); setSide("sell"); }}
            >
              <Text style={[styles.sideTabText, side === "sell" && { color: "#fff" }]}>Sell</Text>
            </TouchableOpacity>
          </View>

          {/* Order type */}
          <View style={styles.orderTypeTabs}>
            {(["limit", "market"] as OrderType[]).map((t) => (
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

          {/* Available */}
          <View style={styles.availRow}>
            <Text style={styles.availLabel}>Avail</Text>
            <Text style={styles.availValue}>{side === "buy" ? "4,520.50 USDT" : "150.00 BSV"}</Text>
          </View>

          {/* Price */}
          {orderType === "limit" ? (
            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>Price</Text>
              <View style={styles.inputBox}>
                <TextInput
                  style={styles.input}
                  value={price}
                  onChangeText={setPrice}
                  keyboardType="decimal-pad"
                  placeholderTextColor={C.textMuted}
                />
                <Text style={styles.inputUnit}>USDT</Text>
              </View>
            </View>
          ) : (
            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>Price</Text>
              <View style={[styles.inputBox, { opacity: 0.5 }]}>
                <Text style={styles.input}>Market</Text>
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

          {/* Pct shortcuts */}
          <View style={styles.pctRow}>
            {[25, 50, 75, 100].map((pct) => (
              <TouchableOpacity
                key={pct}
                style={styles.pctBtn}
                onPress={() => {
                  Haptics.selectionAsync();
                  const bal = side === "buy" ? 4520.5 : 150;
                  setAmount(side === "buy"
                    ? ((bal * pct / 100) / parseFloat(price || "1")).toFixed(4)
                    : (bal * pct / 100).toFixed(4));
                }}
              >
                <Text style={styles.pctBtnText}>{pct}%</Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* Total */}
          {orderType === "limit" && (
            <View style={styles.totalRow}>
              <Text style={styles.totalLabel}>Total</Text>
              <Text style={styles.totalValue}>{isNaN(total) ? "0.00" : total.toFixed(2)} USDT</Text>
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
    backgroundColor: C.card,
    alignItems: "center", justifyContent: "center",
    borderWidth: 1, borderColor: C.cardBorder,
  },
  pairTitle: { fontFamily: "Inter_700Bold", fontSize: 16, color: C.text },
  changeBadge: { paddingHorizontal: 7, paddingVertical: 3, borderRadius: 7 },
  changeText: { fontFamily: "Inter_600SemiBold", fontSize: 11 },
  priceSmall: { fontFamily: "Inter_400Regular", fontSize: 11, color: C.textMuted },
  priceHero: { fontFamily: "Inter_700Bold", fontSize: 17, color: C.text },
  bookPanel: { width: 130, borderRightWidth: 1, borderRightColor: C.separator, backgroundColor: C.card },
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
  bookColHeader: { fontFamily: "Inter_500Medium", fontSize: 9, color: C.textMuted, textTransform: "uppercase" },
  bookRow: {
    flexDirection: "row", justifyContent: "space-between",
    paddingHorizontal: 6, paddingVertical: 3.5, position: "relative",
  },
  depthBar: { position: "absolute", right: 0, top: 0, bottom: 0, borderRadius: 2 },
  bookPrice: { fontFamily: "Inter_600SemiBold", fontSize: 11, zIndex: 1 },
  bookQty: { fontFamily: "Inter_400Regular", fontSize: 10, color: C.textSecondary, zIndex: 1 },
  spreadRow: {
    flexDirection: "row", justifyContent: "space-between",
    paddingHorizontal: 6, paddingVertical: 5,
    backgroundColor: C.surface,
  },
  spreadText: { fontFamily: "Inter_700Bold", fontSize: 11, color: C.text },
  sideTabs: { flexDirection: "row", gap: 8, marginBottom: 10 },
  sideTab: {
    flex: 1, paddingVertical: 9, borderRadius: 10,
    borderWidth: 1.5, borderColor: C.cardBorder,
    alignItems: "center",
  },
  sideTabText: { fontFamily: "Inter_700Bold", fontSize: 13, color: C.textSecondary },
  orderTypeTabs: { flexDirection: "row", gap: 0, marginBottom: 10, backgroundColor: C.surface, borderRadius: 10, padding: 3 },
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
    flex: 1, paddingVertical: 5, backgroundColor: C.surface,
    borderRadius: 8, borderWidth: 1, borderColor: C.surfaceBorder,
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
