import React, { useState, useEffect } from "react";
import {
  View, Text, StyleSheet, TouchableOpacity, TextInput,
  Modal, ScrollView, ActivityIndicator,
} from "react-native";
import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useWallet, ExchangeBalance, getCoinColor } from "@/context/WalletContext";
import { Colors } from "@/constants/colors";

const C = Colors.dark;
const BASE_URL = `https://${process.env.EXPO_PUBLIC_DOMAIN}`;

type Step = "form" | "confirm" | "processing" | "success" | "error";

interface Props {
  visible: boolean;
  onClose: () => void;
  /** Pre-select an asset when opening the sheet */
  initialAsset?: ExchangeBalance | null;
}

export function WithdrawSheet({ visible, onClose, initialAsset }: Props) {
  const { wallet, exchangeBalances, refreshBalance } = useWallet();

  const [step, setStep] = useState<Step>("form");
  const [asset, setAsset] = useState<ExchangeBalance | null>(initialAsset ?? null);
  const [amount, setAmount] = useState("");
  const [recipient, setRecipient] = useState("");
  const [errorMsg, setErrorMsg] = useState("");
  const [txId, setTxId] = useState("");

  // Reset form when modal opens
  useEffect(() => {
    if (visible) {
      setStep("form");
      setAmount("");
      setRecipient("");
      setErrorMsg("");
      setTxId("");
      setAsset(initialAsset ?? null);
    }
  }, [visible, initialAsset]);

  const availableBalances = exchangeBalances.filter((b) => b.available > 0);
  const maxAmount = asset?.available ?? 0;
  const amountNum = parseFloat(amount) || 0;
  const amountUSD = amountNum * (asset?.price ?? 1);

  const isValidAmount = amountNum > 0 && amountNum <= maxAmount;
  const isValidRecipient = recipient.trim().length > 8;
  const canReview = !!asset && isValidAmount && isValidRecipient;

  const handleWithdraw = async () => {
    if (!wallet || !asset) return;
    setStep("processing");
    try {
      // Step 1: obtain server challenge (nonce)
      const challengeRes = await fetch(`${BASE_URL}/api/withdraw/challenge`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ walletAddress: wallet.address }),
      });
      const challengeData = await challengeRes.json();
      if (!challengeRes.ok) {
        setErrorMsg(challengeData.error ?? "Failed to get withdrawal challenge");
        setStep("error");
        return;
      }

      // Step 2: submit withdrawal request.
      // Real wallets (MetaMask, HandCash, etc.) would sign the challenge nonce
      // with the private key here. Simulated aura-wallet accounts do not hold
      // private keys, so the request is submitted without a signature — the
      // server will return 401 and the user will see an appropriate message.
      const withdrawBody: Record<string, string> = {
        walletAddress: wallet.address,
        asset: asset.asset,
        amount: amountNum.toString(),
        network: wallet.network,
        networkLabel: wallet.network === "evm" ? "Ethereum" : "Bitcoin SV",
        recipient: recipient.trim(),
        fee: "0",
      };
      // Include the challenge nonce so the server can validate request freshness.
      // Signature must be provided separately by real wallet providers.
      if (challengeData.nonce) withdrawBody.nonce = challengeData.nonce;

      const withdrawRes = await fetch(`${BASE_URL}/api/withdrawals`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(withdrawBody),
      });
      const withdrawData = await withdrawRes.json();

      if (!withdrawRes.ok) {
        if (withdrawRes.status === 401) {
          setErrorMsg(
            "A cryptographic signature from your wallet is required to withdraw. " +
            "Please connect via MetaMask, HandCash, or another supported provider to sign withdrawal requests."
          );
        } else {
          setErrorMsg(withdrawData.error ?? "Withdrawal failed. Please try again.");
        }
        setStep("error");
        return;
      }

      setTxId(withdrawData.id ?? withdrawData.txId ?? "");
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setStep("success");
      refreshBalance();
    } catch {
      setErrorMsg("Network error. Please check your connection and try again.");
      setStep("error");
    }
  };

  const handleClose = () => {
    setStep("form");
    setAmount("");
    setRecipient("");
    setErrorMsg("");
    setTxId("");
    onClose();
  };

  // ── Render helpers ────────────────────────────────────────────────────────────

  const renderProcessing = () => (
    <View style={styles.center}>
      <ActivityIndicator size="large" color={C.primary} style={{ marginBottom: 16 }} />
      <Text style={styles.processingText}>Processing withdrawal…</Text>
    </View>
  );

  const renderSuccess = () => (
    <View style={styles.center}>
      <View style={[styles.resultIcon, { backgroundColor: C.buy + "22" }]}>
        <Feather name="check-circle" size={52} color={C.buy} />
      </View>
      <Text style={styles.resultTitle}>Withdrawal Submitted</Text>
      <Text style={styles.resultSub}>
        {amountNum} {asset?.asset} → {recipient.slice(0, 12)}…{recipient.slice(-6)}
      </Text>
      {txId ? <Text style={styles.txId}>ID: {txId}</Text> : null}
      <TouchableOpacity style={[styles.primaryBtn, { marginTop: 28 }]} onPress={handleClose}>
        <Text style={styles.primaryBtnText}>Done</Text>
      </TouchableOpacity>
    </View>
  );

  const renderError = () => (
    <View style={styles.center}>
      <View style={[styles.resultIcon, { backgroundColor: C.sell + "22" }]}>
        <Feather name="alert-circle" size={52} color={C.sell} />
      </View>
      <Text style={[styles.resultTitle, { color: C.sell }]}>Withdrawal Failed</Text>
      <Text style={styles.resultSub}>{errorMsg}</Text>
      <View style={{ flexDirection: "row", gap: 12, marginTop: 28, width: "100%" }}>
        <TouchableOpacity style={[styles.outlineBtn, { flex: 1 }]} onPress={() => setStep("form")}>
          <Text style={styles.outlineBtnText}>Try Again</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.primaryBtn, { flex: 1 }]} onPress={handleClose}>
          <Text style={styles.primaryBtnText}>Close</Text>
        </TouchableOpacity>
      </View>
    </View>
  );

  const renderConfirm = () => (
    <View style={{ gap: 16 }}>
      <Text style={styles.sectionTitle}>Confirm Withdrawal</Text>
      <View style={styles.confirmCard}>
        <ConfirmRow label="Asset" value={asset?.asset ?? ""} />
        <ConfirmRow
          label="Amount"
          value={`${amountNum} ${asset?.asset} ≈ $${amountUSD.toFixed(2)}`}
        />
        <ConfirmRow label="To" value={`${recipient.slice(0, 14)}…${recipient.slice(-6)}`} />
        <ConfirmRow
          label="Network"
          value={wallet?.network === "evm" ? "EVM / Ethereum" : "Bitcoin SV"}
        />
        <ConfirmRow label="Fee" value="0.00 (absorbed by DEX)" last />
      </View>
      <View style={styles.warnCard}>
        <Feather name="alert-triangle" size={14} color="#FBBF24" />
        <Text style={styles.warnText}>
          Withdrawals are final and irreversible. Double-check the recipient address before confirming.
        </Text>
      </View>
      <View style={{ flexDirection: "row", gap: 12 }}>
        <TouchableOpacity style={[styles.outlineBtn, { flex: 1 }]} onPress={() => setStep("form")}>
          <Text style={styles.outlineBtnText}>Back</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.primaryBtn, { flex: 1 }]}
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
            handleWithdraw();
          }}
        >
          <Feather name="send" size={16} color="#000" />
          <Text style={styles.primaryBtnText}>Confirm</Text>
        </TouchableOpacity>
      </View>
    </View>
  );

  const renderForm = () => (
    <View style={{ gap: 16 }}>
      {/* Asset chips */}
      <View>
        <Text style={styles.label}>Select Asset</Text>
        {availableBalances.length === 0 ? (
          <Text style={styles.emptyText}>No available balance to withdraw.</Text>
        ) : (
          <View style={styles.assetList}>
            {availableBalances.map((b) => {
              const color = getCoinColor(b.asset);
              const selected = asset?.asset === b.asset;
              return (
                <TouchableOpacity
                  key={b.asset}
                  style={[
                    styles.assetChip,
                    selected && { borderColor: color, backgroundColor: color + "18" },
                  ]}
                  onPress={() => {
                    Haptics.selectionAsync();
                    setAsset(b);
                    setAmount("");
                  }}
                >
                  <Text style={[styles.assetChipText, selected && { color }]}>{b.asset}</Text>
                  <Text style={[styles.assetChipSub, selected && { color: color + "BB" }]}>
                    {b.available.toFixed(4)}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        )}
      </View>

      {/* Amount */}
      {asset && (
        <View>
          <View style={styles.labelRow}>
            <Text style={styles.label}>Amount</Text>
            <TouchableOpacity onPress={() => setAmount(maxAmount.toString())}>
              <Text style={styles.maxBtn}>
                Max: {maxAmount.toFixed(6)} {asset.asset}
              </Text>
            </TouchableOpacity>
          </View>
          <TextInput
            style={[styles.input, amount && !isValidAmount && styles.inputError]}
            value={amount}
            onChangeText={setAmount}
            placeholder={`0.00 ${asset.asset}`}
            placeholderTextColor={C.textMuted}
            keyboardType="decimal-pad"
          />
          {amountNum > 0 && (
            <Text style={styles.amountHint}>≈ ${amountUSD.toFixed(2)} USD</Text>
          )}
          {amount !== "" && !isValidAmount && (
            <Text style={styles.fieldError}>
              {amountNum <= 0
                ? "Amount must be greater than 0"
                : `Insufficient balance (max ${maxAmount.toFixed(6)})`}
            </Text>
          )}
        </View>
      )}

      {/* Recipient */}
      <View>
        <Text style={styles.label}>Recipient Address</Text>
        <TextInput
          style={styles.input}
          value={recipient}
          onChangeText={setRecipient}
          placeholder={wallet?.network === "evm" ? "0x…" : "1…"}
          placeholderTextColor={C.textMuted}
          autoCapitalize="none"
          autoCorrect={false}
          spellCheck={false}
        />
      </View>

      <TouchableOpacity
        style={[styles.primaryBtn, !canReview && { opacity: 0.4 }]}
        onPress={() => {
          if (!canReview) return;
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
          setStep("confirm");
        }}
        disabled={!canReview}
      >
        <Feather name="send" size={16} color="#000" />
        <Text style={styles.primaryBtnText}>Review Withdrawal</Text>
      </TouchableOpacity>
    </View>
  );

  const contentByStep: Record<Step, () => React.ReactNode> = {
    form: renderForm,
    confirm: renderConfirm,
    processing: renderProcessing,
    success: renderSuccess,
    error: renderError,
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={handleClose}>
      <View style={styles.overlay}>
        <TouchableOpacity style={styles.backdrop} onPress={handleClose} activeOpacity={1} />
        <View style={styles.sheet}>
          <View style={styles.handle} />
          <View style={styles.sheetHeader}>
            <Text style={styles.sheetTitle}>Withdraw Funds</Text>
            <TouchableOpacity style={styles.closeBtn} onPress={handleClose}>
              <Feather name="x" size={18} color={C.text} />
            </TouchableOpacity>
          </View>
          <ScrollView
            showsVerticalScrollIndicator={false}
            style={{ flex: 1 }}
            contentContainerStyle={{ padding: 20, paddingBottom: 48 }}
            keyboardShouldPersistTaps="handled"
          >
            {contentByStep[step]()}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

function ConfirmRow({
  label, value, last,
}: { label: string; value: string; last?: boolean }) {
  return (
    <View style={[styles.confirmRow, !last && styles.confirmRowBorder]}>
      <Text style={styles.confirmLabel}>{label}</Text>
      <Text style={styles.confirmValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, justifyContent: "flex-end" },
  backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(0,0,0,0.55)" },
  sheet: {
    backgroundColor: C.background,
    borderTopLeftRadius: 24, borderTopRightRadius: 24,
    borderTopWidth: 1, borderLeftWidth: 1, borderRightWidth: 1,
    borderColor: C.cardBorder,
    maxHeight: "88%", minHeight: 320,
  },
  handle: {
    width: 36, height: 4, borderRadius: 2, backgroundColor: C.cardBorder,
    alignSelf: "center", marginTop: 10, marginBottom: 4,
  },
  sheetHeader: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    paddingHorizontal: 20, paddingVertical: 14,
    borderBottomWidth: 1, borderBottomColor: C.separator,
  },
  sheetTitle: { fontFamily: "Inter_700Bold", fontSize: 18, color: C.text },
  closeBtn: {
    width: 32, height: 32, borderRadius: 9, backgroundColor: C.card,
    borderWidth: 1, borderColor: C.cardBorder, alignItems: "center", justifyContent: "center",
  },
  // Form
  label: {
    fontFamily: "Inter_600SemiBold", fontSize: 11, color: C.textMuted,
    textTransform: "uppercase", letterSpacing: 0.6, marginBottom: 8,
  },
  labelRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 8 },
  maxBtn: { fontFamily: "Inter_600SemiBold", fontSize: 12, color: C.primary },
  assetList: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  assetChip: {
    paddingHorizontal: 14, paddingVertical: 10, borderRadius: 20,
    borderWidth: 1.5, borderColor: C.cardBorder, backgroundColor: C.card,
    alignItems: "center",
  },
  assetChipText: { fontFamily: "Inter_700Bold", fontSize: 13, color: C.textSecondary },
  assetChipSub: { fontFamily: "Inter_400Regular", fontSize: 10, color: C.textMuted, marginTop: 2 },
  input: {
    backgroundColor: C.card, borderRadius: 14, borderWidth: 1.5, borderColor: C.cardBorder,
    padding: 14, fontFamily: "Inter_400Regular", fontSize: 15, color: C.text,
  },
  inputError: { borderColor: C.sell + "80" },
  amountHint: { fontFamily: "Inter_400Regular", fontSize: 12, color: C.textMuted, marginTop: 4 },
  fieldError: { fontFamily: "Inter_400Regular", fontSize: 12, color: C.sell, marginTop: 4 },
  emptyText: { fontFamily: "Inter_400Regular", fontSize: 14, color: C.textMuted },
  primaryBtn: {
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8,
    backgroundColor: C.primary, borderRadius: 14, paddingVertical: 15,
  },
  primaryBtnText: { fontFamily: "Inter_700Bold", fontSize: 15, color: "#000" },
  outlineBtn: {
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8,
    borderRadius: 14, paddingVertical: 15, borderWidth: 1.5, borderColor: C.cardBorder,
  },
  outlineBtnText: { fontFamily: "Inter_600SemiBold", fontSize: 15, color: C.textSecondary },
  // Confirm
  sectionTitle: { fontFamily: "Inter_700Bold", fontSize: 18, color: C.text },
  confirmCard: {
    backgroundColor: C.card, borderRadius: 16, borderWidth: 1, borderColor: C.cardBorder, overflow: "hidden",
  },
  confirmRow: { flexDirection: "row", justifyContent: "space-between", paddingHorizontal: 16, paddingVertical: 14 },
  confirmRowBorder: { borderBottomWidth: 1, borderBottomColor: C.separator },
  confirmLabel: { fontFamily: "Inter_400Regular", fontSize: 13, color: C.textMuted },
  confirmValue: { fontFamily: "Inter_600SemiBold", fontSize: 13, color: C.text, flexShrink: 1, textAlign: "right", marginLeft: 12 },
  warnCard: {
    flexDirection: "row", gap: 10, alignItems: "flex-start",
    backgroundColor: "#FBBF2412", borderRadius: 14, borderWidth: 1, borderColor: "#FBBF2432", padding: 14,
  },
  warnText: { flex: 1, fontFamily: "Inter_400Regular", fontSize: 12, color: "#FCD34D", lineHeight: 18 },
  // Status screens
  center: { alignItems: "center", paddingVertical: 24 },
  processingText: { fontFamily: "Inter_500Medium", fontSize: 15, color: C.textSecondary },
  resultIcon: { width: 96, height: 96, borderRadius: 30, alignItems: "center", justifyContent: "center", marginBottom: 16 },
  resultTitle: { fontFamily: "Inter_700Bold", fontSize: 22, color: C.text, marginBottom: 6 },
  resultSub: { fontFamily: "Inter_400Regular", fontSize: 14, color: C.textSecondary, textAlign: "center", lineHeight: 21 },
  txId: { fontFamily: "Inter_400Regular", fontSize: 11, color: C.textMuted, marginTop: 4 },
});
