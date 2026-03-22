import React from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Switch,
  Platform,
  Alert,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { router } from "expo-router";
import { useWallet } from "@/context/WalletContext";
import { Colors } from "@/constants/colors";

const C = Colors.dark;

function SettingRow({
  icon, label, value, onPress, rightEl, showChevron = true,
}: {
  icon: string; label: string; value?: string;
  onPress?: () => void; rightEl?: React.ReactNode; showChevron?: boolean;
}) {
  return (
    <TouchableOpacity style={styles.settingRow} onPress={onPress} activeOpacity={onPress ? 0.7 : 1}>
      <View style={styles.settingIcon}>
        <Feather name={icon as any} size={16} color={C.primary} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.settingLabel}>{label}</Text>
        {value && <Text style={styles.settingValue}>{value}</Text>}
      </View>
      {rightEl ?? (showChevron && onPress ? <Feather name="chevron-right" size={16} color={C.textMuted} /> : null)}
    </TouchableOpacity>
  );
}

function SectionHeader({ title }: { title: string }) {
  return <Text style={styles.sectionHeader}>{title}</Text>;
}

export default function SettingsScreen() {
  const insets = useSafeAreaInsets();
  const { wallet, disconnect } = useWallet();
  const [notifications, setNotifications] = React.useState(true);
  const [haptics, setHaptics] = React.useState(true);
  const [biometrics, setBiometrics] = React.useState(false);

  const handleDisconnect = () => {
    Alert.alert("Disconnect Wallet", "Are you sure you want to disconnect your wallet?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Disconnect",
        style: "destructive",
        onPress: () => {
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
          disconnect();
        },
      },
    ]);
  };

  return (
    <View style={[styles.container, { backgroundColor: C.background }]}>
      <View style={[styles.header, { paddingTop: Platform.OS === "web" ? 67 : insets.top + 12 }]}>
        <Text style={styles.logo}>Settings</Text>
      </View>

      <ScrollView style={{ flex: 1 }} showsVerticalScrollIndicator={false}>
        {/* Wallet */}
        <SectionHeader title="Wallet" />
        <View style={styles.card}>
          {wallet ? (
            <>
              <SettingRow
                icon="link"
                label="Connected Wallet"
                value={`${wallet.provider} · ${wallet.address.slice(0, 10)}...`}
                showChevron={false}
              />
              <View style={styles.separator} />
              <SettingRow
                icon="shield"
                label="Network"
                value={wallet.network === "evm" ? "EVM (Ethereum)" : "Bitcoin SV"}
                showChevron={false}
              />
              <View style={styles.separator} />
              <TouchableOpacity style={styles.disconnectRow} onPress={handleDisconnect}>
                <Feather name="log-out" size={16} color={C.sell} />
                <Text style={styles.disconnectText}>Disconnect Wallet</Text>
              </TouchableOpacity>
            </>
          ) : (
            <TouchableOpacity style={styles.connectRow} onPress={() => router.push("/wallet" as any)}>
              <View style={[styles.settingIcon, { backgroundColor: C.primary + "18" }]}>
                <Feather name="link" size={16} color={C.primary} />
              </View>
              <Text style={styles.connectText}>Connect Wallet</Text>
              <Feather name="chevron-right" size={16} color={C.textMuted} />
            </TouchableOpacity>
          )}
        </View>

        {/* Trading Preferences */}
        <SectionHeader title="Trading" />
        <View style={styles.card}>
          <SettingRow
            icon="percent"
            label="Default Slippage"
            value="0.5%"
            onPress={() => {}}
          />
          <View style={styles.separator} />
          <SettingRow
            icon="zap"
            label="Default Leverage"
            value="10x"
            onPress={() => {}}
          />
          <View style={styles.separator} />
          <SettingRow
            icon="dollar-sign"
            label="Quote Currency"
            value="USDT"
            onPress={() => {}}
          />
        </View>

        {/* App Preferences */}
        <SectionHeader title="Preferences" />
        <View style={styles.card}>
          <SettingRow
            icon="bell"
            label="Price Alerts"
            showChevron={false}
            rightEl={
              <Switch
                value={notifications}
                onValueChange={(v) => { Haptics.selectionAsync(); setNotifications(v); }}
                trackColor={{ false: C.surface, true: C.primary + "60" }}
                thumbColor={notifications ? C.primary : C.textMuted}
              />
            }
          />
          <View style={styles.separator} />
          <SettingRow
            icon="activity"
            label="Haptic Feedback"
            showChevron={false}
            rightEl={
              <Switch
                value={haptics}
                onValueChange={(v) => { Haptics.selectionAsync(); setHaptics(v); }}
                trackColor={{ false: C.surface, true: C.primary + "60" }}
                thumbColor={haptics ? C.primary : C.textMuted}
              />
            }
          />
          <View style={styles.separator} />
          <SettingRow
            icon="lock"
            label="Biometric Lock"
            showChevron={false}
            rightEl={
              <Switch
                value={biometrics}
                onValueChange={(v) => { Haptics.selectionAsync(); setBiometrics(v); }}
                trackColor={{ false: C.surface, true: C.primary + "60" }}
                thumbColor={biometrics ? C.primary : C.textMuted}
              />
            }
          />
        </View>

        {/* About */}
        <SectionHeader title="About" />
        <View style={styles.card}>
          <SettingRow icon="info" label="Version" value="1.0.0" showChevron={false} />
          <View style={styles.separator} />
          <SettingRow icon="file-text" label="Terms of Service" onPress={() => {}} />
          <View style={styles.separator} />
          <SettingRow icon="shield" label="Privacy Policy" onPress={() => {}} />
        </View>

        {/* Branding */}
        <View style={styles.brandingSection}>
          <Text style={styles.brandingTitle}>Aura<Text style={{ color: C.primary }}>DEX</Text></Text>
          <Text style={styles.brandingSlogan}>✦ Always comes to Aura</Text>
          <Text style={styles.brandingVersion}>Non-custodial · On-chain settlement · BSV</Text>
        </View>

        <View style={{ height: Platform.OS === "web" ? 100 : 100 }} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { paddingHorizontal: 20, paddingBottom: 16 },
  logo: { fontFamily: "Inter_700Bold", fontSize: 22, color: C.text },
  sectionHeader: {
    fontFamily: "Inter_600SemiBold", fontSize: 12, color: C.textMuted,
    textTransform: "uppercase", letterSpacing: 0.8,
    paddingHorizontal: 20, marginBottom: 8, marginTop: 20,
  },
  card: { marginHorizontal: 20, backgroundColor: C.card, borderRadius: 16, borderWidth: 1, borderColor: C.cardBorder, overflow: "hidden" },
  separator: { height: 1, backgroundColor: C.separator, marginHorizontal: 16 },
  settingRow: { flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 16, paddingVertical: 14 },
  settingIcon: {
    width: 32, height: 32, borderRadius: 9,
    backgroundColor: C.primary + "15",
    alignItems: "center", justifyContent: "center",
  },
  settingLabel: { fontFamily: "Inter_500Medium", fontSize: 14, color: C.text },
  settingValue: { fontFamily: "Inter_400Regular", fontSize: 12, color: C.textMuted, marginTop: 2 },
  disconnectRow: {
    flexDirection: "row", alignItems: "center", gap: 12,
    paddingHorizontal: 16, paddingVertical: 14,
  },
  disconnectText: { fontFamily: "Inter_600SemiBold", fontSize: 14, color: C.sell, flex: 1 },
  connectRow: { flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 16, paddingVertical: 14 },
  connectText: { fontFamily: "Inter_500Medium", fontSize: 14, color: C.text, flex: 1 },
  brandingSection: { alignItems: "center", paddingVertical: 28 },
  brandingTitle: { fontFamily: "Inter_700Bold", fontSize: 24, color: C.text },
  brandingSlogan: { fontFamily: "Inter_500Medium", fontSize: 12, color: C.primary, marginTop: 4, opacity: 0.8 },
  brandingVersion: { fontFamily: "Inter_400Regular", fontSize: 11, color: C.textMuted, marginTop: 8 },
});
