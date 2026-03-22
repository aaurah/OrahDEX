import React, { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Platform,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";
import { router } from "expo-router";
import * as Haptics from "expo-haptics";
import { Colors } from "@/constants/colors";
import { useWallet } from "@/context/WalletContext";

const C = Colors.dark;

const EVM_WALLETS = [
  { id: "metamask", name: "MetaMask", icon: "🦊", desc: "Most popular Ethereum wallet", network: "evm" as const, popular: true },
  { id: "walletconnect", name: "WalletConnect", icon: "🔗", desc: "Connect any mobile wallet via QR", network: "evm" as const, popular: true },
  { id: "coinbase", name: "Coinbase Wallet", icon: "🔵", desc: "Self-custody by Coinbase", network: "evm" as const, popular: true },
  { id: "rainbow", name: "Rainbow", icon: "🌈", desc: "Fun, simple Ethereum wallet", network: "evm" as const },
  { id: "trust", name: "Trust Wallet", icon: "🛡️", desc: "Multi-chain mobile wallet", network: "evm" as const },
  { id: "phantom", name: "Phantom", icon: "👻", desc: "Multichain — ETH, SOL, BTC", network: "evm" as const },
];

const BSV_WALLETS = [
  { id: "handcash", name: "HandCash", icon: "✋", desc: "Social BSV wallet", network: "bsv" as const, popular: true },
  { id: "relayx", name: "RelayX", icon: "⚡", desc: "BSV DeFi wallet", network: "bsv" as const, popular: true },
  { id: "panda", name: "Panda Wallet", icon: "🐼", desc: "Browser extension for BSV", network: "bsv" as const, popular: true },
  { id: "sensilet", name: "Sensilet", icon: "🔷", desc: "sCrypt smart contract wallet", network: "bsv" as const },
  { id: "yours", name: "Yours Wallet", icon: "💛", desc: "Open-source BSV wallet", network: "bsv" as const },
];

type Tab = "evm" | "bsv";

function generateAddress(network: "evm" | "bsv"): string {
  const hex = () => Math.floor(Math.random() * 16).toString(16);
  if (network === "evm") {
    return "0x" + Array.from({ length: 40 }, hex).join("");
  }
  const chars = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
  return "1" + Array.from({ length: 33 }, () => chars[Math.floor(Math.random() * chars.length)]).join("");
}

export default function WalletScreen() {
  const insets = useSafeAreaInsets();
  const { connect, wallet, disconnect } = useWallet();
  const [tab, setTab] = useState<Tab>("evm");
  const [connecting, setConnecting] = useState<string | null>(null);

  const wallets = tab === "evm" ? EVM_WALLETS : BSV_WALLETS;
  const popular = wallets.filter((w) => w.popular);
  const others = wallets.filter((w) => !w.popular);

  const handleConnect = (w: typeof EVM_WALLETS[0]) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setConnecting(w.id);
    setTimeout(() => {
      connect({ address: generateAddress(w.network), provider: w.id, network: w.network });
      setConnecting(null);
      router.back();
    }, 1200);
  };

  return (
    <View style={[styles.container, { backgroundColor: C.background }]}>
      <View style={[styles.header, { paddingTop: Platform.OS === "web" ? 50 : insets.top + 8 }]}>
        <View>
          <Text style={styles.title}>Connect Wallet</Text>
          <Text style={styles.subtitle}>✦ Always comes to Aura</Text>
        </View>
        <TouchableOpacity style={styles.closeBtn} onPress={() => router.back()}>
          <Feather name="x" size={20} color={C.text} />
        </TouchableOpacity>
      </View>

      {/* Network Tabs */}
      <View style={styles.networkTabs}>
        <TouchableOpacity
          style={[styles.networkTab, tab === "evm" && styles.networkTabActive]}
          onPress={() => { Haptics.selectionAsync(); setTab("evm"); }}
        >
          <Text style={[styles.networkTabText, tab === "evm" && styles.networkTabTextActive]}>🌐 EVM / Web3</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.networkTab, tab === "bsv" && styles.networkTabActive]}
          onPress={() => { Haptics.selectionAsync(); setTab("bsv"); }}
        >
          <Text style={[styles.networkTabText, tab === "bsv" && styles.networkTabTextActive]}>₿ Bitcoin SV</Text>
        </TouchableOpacity>
      </View>

      <ScrollView style={{ flex: 1 }} showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 40 }}>
        {/* Connected wallet */}
        {wallet && (
          <View style={styles.connectedCard}>
            <View style={styles.connectedLeft}>
              <View style={styles.connectedDot} />
              <View>
                <Text style={styles.connectedTitle}>Connected: {wallet.provider}</Text>
                <Text style={styles.connectedAddr}>{wallet.address.slice(0, 16)}...{wallet.address.slice(-8)}</Text>
              </View>
            </View>
            <TouchableOpacity style={styles.disconnectBtn} onPress={() => { disconnect(); }}>
              <Feather name="log-out" size={14} color={C.sell} />
            </TouchableOpacity>
          </View>
        )}

        <Text style={styles.sectionLabel}>Popular</Text>
        {popular.map((w) => (
          <WalletRow key={w.id} wallet={w} connecting={connecting} onConnect={handleConnect} />
        ))}

        <Text style={styles.sectionLabel}>More Wallets</Text>
        {others.map((w) => (
          <WalletRow key={w.id} wallet={w} connecting={connecting} onConnect={handleConnect} />
        ))}

        {/* Non-custodial info */}
        <View style={styles.infoCard}>
          <Feather name="shield" size={16} color={C.primary} />
          <Text style={styles.infoText}>
            <Text style={{ fontFamily: "Inter_700Bold", color: C.primary }}>Non-custodial & Trustless. </Text>
            Aura DEX never holds your funds. All trades settle directly on-chain — no registration, no KYC.
          </Text>
        </View>
      </ScrollView>
    </View>
  );
}

function WalletRow({
  wallet, connecting, onConnect,
}: {
  wallet: typeof EVM_WALLETS[0];
  connecting: string | null;
  onConnect: (w: typeof EVM_WALLETS[0]) => void;
}) {
  const isConnecting = connecting === wallet.id;
  const isDisabled = !!connecting;
  return (
    <TouchableOpacity
      style={[styles.walletRow, isConnecting && styles.walletRowActive, isDisabled && !isConnecting && { opacity: 0.4 }]}
      onPress={() => onConnect(wallet)}
      disabled={isDisabled}
      activeOpacity={0.75}
    >
      <Text style={styles.walletEmoji}>{wallet.icon}</Text>
      <View style={{ flex: 1 }}>
        <Text style={styles.walletName}>{wallet.name}</Text>
        <Text style={styles.walletDesc}>{wallet.desc}</Text>
      </View>
      {isConnecting ? (
        <View style={styles.spinner}>
          <Text style={{ color: C.primary, fontSize: 12 }}>...</Text>
        </View>
      ) : (
        <Feather name="chevron-right" size={16} color={C.textMuted} />
      )}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between",
    paddingHorizontal: 20, paddingBottom: 16,
    borderBottomWidth: 1, borderBottomColor: C.separator,
  },
  title: { fontFamily: "Inter_700Bold", fontSize: 22, color: C.text },
  subtitle: { fontFamily: "Inter_500Medium", fontSize: 11, color: C.primary, marginTop: 3, opacity: 0.8 },
  closeBtn: {
    width: 36, height: 36, borderRadius: 10, backgroundColor: C.card,
    borderWidth: 1, borderColor: C.cardBorder,
    alignItems: "center", justifyContent: "center",
  },
  networkTabs: { flexDirection: "row", margin: 16, gap: 8 },
  networkTab: {
    flex: 1, paddingVertical: 11, borderRadius: 12,
    borderWidth: 1.5, borderColor: C.cardBorder,
    alignItems: "center",
  },
  networkTabActive: { backgroundColor: C.primary + "15", borderColor: C.primary + "60" },
  networkTabText: { fontFamily: "Inter_600SemiBold", fontSize: 13, color: C.textSecondary },
  networkTabTextActive: { color: C.primary },
  connectedCard: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    marginHorizontal: 20, marginBottom: 12,
    backgroundColor: C.buyBg, borderRadius: 12, borderWidth: 1, borderColor: C.buy + "30",
    paddingHorizontal: 16, paddingVertical: 12,
  },
  connectedLeft: { flexDirection: "row", alignItems: "center", gap: 10 },
  connectedDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: C.buy },
  connectedTitle: { fontFamily: "Inter_600SemiBold", fontSize: 13, color: C.buy },
  connectedAddr: { fontFamily: "Inter_400Regular", fontSize: 11, color: C.textSecondary, marginTop: 2 },
  disconnectBtn: { padding: 8 },
  sectionLabel: {
    fontFamily: "Inter_600SemiBold", fontSize: 11, color: C.textMuted,
    textTransform: "uppercase", letterSpacing: 0.8,
    paddingHorizontal: 20, marginBottom: 8, marginTop: 4,
  },
  walletRow: {
    flexDirection: "row", alignItems: "center", gap: 14,
    marginHorizontal: 20, marginBottom: 8,
    backgroundColor: C.card, borderRadius: 14,
    borderWidth: 1, borderColor: C.cardBorder,
    paddingHorizontal: 16, paddingVertical: 14,
  },
  walletRowActive: { borderColor: C.primary + "60", backgroundColor: C.primary + "08" },
  walletEmoji: { fontSize: 24, width: 36, textAlign: "center" },
  walletName: { fontFamily: "Inter_600SemiBold", fontSize: 14, color: C.text },
  walletDesc: { fontFamily: "Inter_400Regular", fontSize: 12, color: C.textMuted, marginTop: 2 },
  spinner: { width: 24, height: 24, borderRadius: 12, borderWidth: 2, borderColor: C.primary, borderTopColor: "transparent" },
  infoCard: {
    flexDirection: "row", gap: 10, alignItems: "flex-start",
    marginHorizontal: 20, marginTop: 16,
    backgroundColor: C.primary + "08", borderRadius: 14,
    borderWidth: 1, borderColor: C.primary + "20",
    padding: 14,
  },
  infoText: { flex: 1, fontFamily: "Inter_400Regular", fontSize: 13, color: C.textSecondary, lineHeight: 19 },
});
