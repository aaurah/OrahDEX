import React from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Platform,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";
import { router } from "expo-router";
import { useWallet } from "@/context/WalletContext";
import { Colors } from "@/constants/colors";

const C = Colors.dark;

const MOCK_BALANCES = [
  { asset: "BSV", amount: 142.5, value: 7899.5, change: 4.41, color: "#EAB308" },
  { asset: "USDT", amount: 4520.5, value: 4520.5, change: 0, color: "#22C55E" },
  { asset: "BTC", amount: 0.0824, value: 5381.3, change: -1.85, color: "#F97316" },
  { asset: "ETH", amount: 1.25, value: 3998.4, change: 1.53, color: "#8B5CF6" },
];

const MOCK_ORDERS = [
  { id: "1", symbol: "BSV/USDT", side: "buy", type: "limit", price: 54.00, qty: 10, status: "open", time: "09:15" },
  { id: "2", symbol: "BTC/USDT", side: "sell", type: "market", price: 65400, qty: 0.01, status: "filled", time: "08:42" },
  { id: "3", symbol: "ETH/USDT", side: "buy", type: "limit", price: 3150, qty: 0.5, status: "cancelled", time: "07:30" },
];

const STATUS_COLORS: Record<string, string> = {
  open: C.primary,
  filled: C.buy,
  cancelled: C.textMuted,
};

export default function PortfolioScreen() {
  const insets = useSafeAreaInsets();
  const { wallet } = useWallet();

  const totalValue = MOCK_BALANCES.reduce((s, b) => s + b.value, 0);
  const totalChange = ((MOCK_BALANCES.reduce((s, b) => s + b.value * b.change / 100, 0) / totalValue) * 100);

  if (!wallet) {
    return (
      <View style={[styles.container, { backgroundColor: C.background }]}>
        <View style={[styles.header, { paddingTop: Platform.OS === "web" ? 67 : insets.top + 12 }]}>
          <Text style={styles.logo}>Portfolio</Text>
        </View>
        <View style={styles.connectPrompt}>
          <View style={styles.connectIconWrap}>
            <Feather name="link" size={36} color={C.primary} />
          </View>
          <Text style={styles.connectTitle}>Connect Your Wallet</Text>
          <Text style={styles.connectSub}>
            Connect your BSV or EVM wallet to view your portfolio, open orders, and transaction history.
          </Text>
          <TouchableOpacity style={styles.connectBtn} onPress={() => router.push("/wallet" as any)}>
            <Feather name="link" size={16} color={C.primaryFg} />
            <Text style={styles.connectBtnText}>Connect Wallet</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: C.background }]}>
      <View style={[styles.header, { paddingTop: Platform.OS === "web" ? 67 : insets.top + 12 }]}>
        <Text style={styles.logo}>Portfolio</Text>
        <View style={styles.walletPill}>
          <View style={styles.dot} />
          <Text style={styles.walletAddr}>{wallet.address.slice(0, 6)}...{wallet.address.slice(-4)}</Text>
        </View>
      </View>

      <ScrollView style={{ flex: 1 }} showsVerticalScrollIndicator={false}>
        {/* Total Value Card */}
        <View style={styles.totalCard}>
          <Text style={styles.totalLabel}>Total Portfolio Value</Text>
          <Text style={styles.totalValue}>${totalValue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</Text>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginTop: 6 }}>
            <Feather name={totalChange >= 0 ? "trending-up" : "trending-down"} size={14} color={totalChange >= 0 ? C.buy : C.sell} />
            <Text style={{ fontFamily: "Inter_600SemiBold", fontSize: 14, color: totalChange >= 0 ? C.buy : C.sell }}>
              {totalChange >= 0 ? "+" : ""}{totalChange.toFixed(2)}% today
            </Text>
          </View>
          {/* Allocation bar */}
          <View style={styles.allocBar}>
            {MOCK_BALANCES.map((b) => (
              <View
                key={b.asset}
                style={[styles.allocSegment, { flex: b.value / totalValue, backgroundColor: b.color }]}
              />
            ))}
          </View>
        </View>

        {/* Assets */}
        <Text style={styles.sectionTitle}>Assets</Text>
        <View style={styles.card}>
          {MOCK_BALANCES.map((b, idx) => (
            <View key={b.asset} style={[styles.assetRow, idx === MOCK_BALANCES.length - 1 && { borderBottomWidth: 0 }]}>
              <View style={[styles.assetIcon, { backgroundColor: b.color + "22", borderColor: b.color + "44" }]}>
                <Text style={[styles.assetIconText, { color: b.color }]}>{b.asset[0]}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.assetName}>{b.asset}</Text>
                <Text style={styles.assetAmount}>{b.amount.toLocaleString()}</Text>
              </View>
              <View style={{ alignItems: "flex-end" }}>
                <Text style={styles.assetValue}>${b.value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</Text>
                <Text style={[styles.assetChange, { color: b.change >= 0 ? C.buy : C.sell }]}>
                  {b.change >= 0 ? "+" : ""}{b.change.toFixed(2)}%
                </Text>
              </View>
            </View>
          ))}
        </View>

        {/* Open Orders */}
        <Text style={styles.sectionTitle}>Orders</Text>
        <View style={styles.card}>
          {MOCK_ORDERS.map((o, idx) => (
            <View key={o.id} style={[styles.orderRow, idx === MOCK_ORDERS.length - 1 && { borderBottomWidth: 0 }]}>
              <View style={{ flex: 1 }}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                  <Text style={styles.orderSymbol}>{o.symbol}</Text>
                  <View style={[styles.sidePill, { backgroundColor: o.side === "buy" ? C.buyBg : C.sellBg }]}>
                    <Text style={[styles.sidePillText, { color: o.side === "buy" ? C.buy : C.sell }]}>{o.side.toUpperCase()}</Text>
                  </View>
                </View>
                <Text style={styles.orderDetail}>{o.type} · {o.qty} @ ${o.price.toLocaleString()}</Text>
              </View>
              <View style={{ alignItems: "flex-end" }}>
                <Text style={[styles.orderStatus, { color: STATUS_COLORS[o.status] }]}>{o.status}</Text>
                <Text style={styles.orderTime}>{o.time}</Text>
              </View>
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
  walletPill: {
    flexDirection: "row", alignItems: "center", gap: 6,
    backgroundColor: C.card, borderRadius: 20, paddingHorizontal: 12, paddingVertical: 6,
    borderWidth: 1, borderColor: C.cardBorder,
  },
  dot: { width: 7, height: 7, borderRadius: 4, backgroundColor: C.buy },
  walletAddr: { fontFamily: "Inter_500Medium", fontSize: 12, color: C.textSecondary },
  connectPrompt: { flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: 40 },
  connectIconWrap: {
    width: 80, height: 80, borderRadius: 24,
    backgroundColor: C.primary + "18",
    alignItems: "center", justifyContent: "center",
    marginBottom: 20,
  },
  connectTitle: { fontFamily: "Inter_700Bold", fontSize: 22, color: C.text, textAlign: "center", marginBottom: 10 },
  connectSub: { fontFamily: "Inter_400Regular", fontSize: 14, color: C.textSecondary, textAlign: "center", lineHeight: 22, marginBottom: 28 },
  connectBtn: {
    flexDirection: "row", alignItems: "center", gap: 8,
    backgroundColor: C.primary, paddingHorizontal: 24, paddingVertical: 14,
    borderRadius: 14,
  },
  connectBtnText: { fontFamily: "Inter_600SemiBold", fontSize: 15, color: C.primaryFg },
  totalCard: {
    marginHorizontal: 20, marginBottom: 24,
    backgroundColor: C.card, borderRadius: 20,
    borderWidth: 1, borderColor: C.cardBorder,
    padding: 20,
  },
  totalLabel: { fontFamily: "Inter_400Regular", fontSize: 13, color: C.textMuted, marginBottom: 6 },
  totalValue: { fontFamily: "Inter_700Bold", fontSize: 32, color: C.text, letterSpacing: -1 },
  allocBar: { flexDirection: "row", height: 4, borderRadius: 4, overflow: "hidden", marginTop: 16, gap: 2 },
  allocSegment: { height: 4, borderRadius: 4 },
  sectionTitle: { fontFamily: "Inter_600SemiBold", fontSize: 15, color: C.text, marginBottom: 10, paddingHorizontal: 20 },
  card: {
    marginHorizontal: 20, marginBottom: 24,
    backgroundColor: C.card, borderRadius: 16,
    borderWidth: 1, borderColor: C.cardBorder, overflow: "hidden",
  },
  assetRow: {
    flexDirection: "row", alignItems: "center", gap: 12,
    paddingHorizontal: 16, paddingVertical: 14,
    borderBottomWidth: 1, borderBottomColor: C.separator,
  },
  assetIcon: {
    width: 36, height: 36, borderRadius: 11,
    alignItems: "center", justifyContent: "center",
    borderWidth: 1,
  },
  assetIconText: { fontFamily: "Inter_700Bold", fontSize: 14 },
  assetName: { fontFamily: "Inter_600SemiBold", fontSize: 14, color: C.text },
  assetAmount: { fontFamily: "Inter_400Regular", fontSize: 12, color: C.textMuted, marginTop: 2 },
  assetValue: { fontFamily: "Inter_700Bold", fontSize: 14, color: C.text },
  assetChange: { fontFamily: "Inter_500Medium", fontSize: 12, marginTop: 2 },
  orderRow: {
    flexDirection: "row", alignItems: "center", gap: 12,
    paddingHorizontal: 16, paddingVertical: 14,
    borderBottomWidth: 1, borderBottomColor: C.separator,
  },
  orderSymbol: { fontFamily: "Inter_600SemiBold", fontSize: 14, color: C.text },
  orderDetail: { fontFamily: "Inter_400Regular", fontSize: 12, color: C.textMuted, marginTop: 3 },
  orderStatus: { fontFamily: "Inter_600SemiBold", fontSize: 12, textTransform: "capitalize" },
  orderTime: { fontFamily: "Inter_400Regular", fontSize: 11, color: C.textMuted, marginTop: 2 },
  sidePill: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6 },
  sidePillText: { fontFamily: "Inter_700Bold", fontSize: 10 },
});
