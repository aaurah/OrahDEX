import React, { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Platform,
  ActivityIndicator,
  RefreshControl,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";
import { router } from "expo-router";
import { useWallet, ExchangeBalance, getCoinColor } from "@/context/WalletContext";
import { WithdrawSheet } from "@/components/WithdrawSheet";
import { Colors } from "@/constants/colors";

const C = Colors.dark;

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
  const {
    wallet,
    exchangeBalances,
    isLoadingBalances,
    totalValueUSD,
    totalPnlPercent,
    refreshBalance,
  } = useWallet();
  const [withdrawAsset, setWithdrawAsset] = useState<ExchangeBalance | null>(null);
  const [showWithdraw, setShowWithdraw] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const handleRefresh = async () => {
    setRefreshing(true);
    await refreshBalance();
    setRefreshing(false);
  };

  const openWithdraw = (b: ExchangeBalance) => {
    setWithdrawAsset(b);
    setShowWithdraw(true);
  };

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

  const hasBalances = exchangeBalances.length > 0;

  return (
    <View style={[styles.container, { backgroundColor: C.background }]}>
      <View style={[styles.header, { paddingTop: Platform.OS === "web" ? 67 : insets.top + 12 }]}>
        <Text style={styles.logo}>Portfolio</Text>
        <View style={styles.walletPill}>
          <View style={styles.dot} />
          <Text style={styles.walletAddr}>{wallet.address.slice(0, 6)}...{wallet.address.slice(-4)}</Text>
        </View>
      </View>

      <ScrollView
        style={{ flex: 1 }}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={C.primary} />}
      >
        {/* Total Value Card */}
        <View style={styles.totalCard}>
          <Text style={styles.totalLabel}>Exchange Balance</Text>
          {isLoadingBalances && !hasBalances ? (
            <ActivityIndicator color={C.primary} style={{ marginVertical: 12 }} />
          ) : (
            <>
              <Text style={styles.totalValue}>
                ${totalValueUSD.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </Text>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginTop: 6 }}>
                <Feather
                  name={totalPnlPercent >= 0 ? "trending-up" : "trending-down"}
                  size={14}
                  color={totalPnlPercent >= 0 ? C.buy : C.sell}
                />
                <Text style={{ fontFamily: "Inter_600SemiBold", fontSize: 14, color: totalPnlPercent >= 0 ? C.buy : C.sell }}>
                  {totalPnlPercent >= 0 ? "+" : ""}{totalPnlPercent.toFixed(2)}% today
                </Text>
              </View>
              {/* Allocation bar */}
              {hasBalances && (
                <View style={styles.allocBar}>
                  {exchangeBalances.map((b) => (
                    <View
                      key={b.asset}
                      style={[
                        styles.allocSegment,
                        { flex: totalValueUSD > 0 ? b.valueUSD / totalValueUSD : 0, backgroundColor: getCoinColor(b.asset) },
                      ]}
                    />
                  ))}
                </View>
              )}
            </>
          )}
        </View>

        {/* Assets */}
        <View style={styles.sectionRow}>
          <Text style={styles.sectionTitle}>Assets</Text>
          <TouchableOpacity onPress={handleRefresh}>
            <Feather name="refresh-cw" size={14} color={C.textMuted} />
          </TouchableOpacity>
        </View>
        <View style={styles.card}>
          {!hasBalances && !isLoadingBalances ? (
            <View style={{ padding: 20, alignItems: "center" }}>
              <Text style={{ fontFamily: "Inter_400Regular", fontSize: 14, color: C.textMuted }}>
                No balances found. Pull down to refresh.
              </Text>
            </View>
          ) : (
            exchangeBalances.map((b, idx) => {
              const color = getCoinColor(b.asset);
              return (
                <View
                  key={b.asset}
                  style={[styles.assetRow, idx === exchangeBalances.length - 1 && { borderBottomWidth: 0 }]}
                >
                  <View style={[styles.assetIcon, { backgroundColor: color + "22", borderColor: color + "44" }]}>
                    <Text style={[styles.assetIconText, { color }]}>{b.asset.slice(0, 2)}</Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.assetName}>{b.asset}</Text>
                    <Text style={styles.assetAmount}>{b.total.toLocaleString()} total</Text>
                    {b.locked > 0 && (
                      <Text style={styles.assetLocked}>{b.locked.toFixed(6)} locked</Text>
                    )}
                  </View>
                  <View style={{ alignItems: "flex-end", gap: 4 }}>
                    <Text style={styles.assetValue}>
                      ${b.valueUSD.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </Text>
                    <Text style={[styles.assetChange, { color: b.change24hPercent >= 0 ? C.buy : C.sell }]}>
                      {b.change24hPercent >= 0 ? "+" : ""}{b.change24hPercent.toFixed(2)}%
                    </Text>
                    {b.available > 0 && (
                      <TouchableOpacity style={styles.withdrawBtn} onPress={() => openWithdraw(b)}>
                        <Feather name="arrow-up-right" size={11} color={C.primary} />
                        <Text style={styles.withdrawBtnText}>Withdraw</Text>
                      </TouchableOpacity>
                    )}
                  </View>
                </View>
              );
            })
          )}
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

      <WithdrawSheet
        visible={showWithdraw}
        onClose={() => setShowWithdraw(false)}
        initialAsset={withdrawAsset}
      />
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
  assetLocked: { fontFamily: "Inter_400Regular", fontSize: 11, color: C.textMuted },
  sectionRow: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    paddingHorizontal: 20, marginBottom: 10,
  },
  withdrawBtn: {
    flexDirection: "row", alignItems: "center", gap: 4,
    backgroundColor: C.primary + "15", borderRadius: 8,
    paddingHorizontal: 8, paddingVertical: 4,
    borderWidth: 1, borderColor: C.primary + "40",
  },
  withdrawBtnText: { fontFamily: "Inter_600SemiBold", fontSize: 10, color: C.primary },
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
