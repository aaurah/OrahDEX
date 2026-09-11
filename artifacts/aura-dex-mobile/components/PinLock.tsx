import React, { useState, useEffect, useCallback } from "react";
import {
  View, Text, StyleSheet, TouchableOpacity, Platform, ActivityIndicator,
} from "react-native";
import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useWallet } from "@/context/WalletContext";
import { Colors } from "@/constants/colors";

const C = Colors.dark;
const PIN_LENGTH = 6;
const MAX_ATTEMPTS = 5;
const LOCKOUT_SECONDS = 30;

const KEYPAD_ROWS = [
  ["1", "2", "3"],
  ["4", "5", "6"],
  ["7", "8", "9"],
  ["bio", "0", "del"],
] as const;

export function PinLock() {
  const { verifyPin, unlock, wallet, biometricsEnabled, authenticateWithBiometrics } = useWallet();
  const [digits, setDigits] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [attempts, setAttempts] = useState(0);
  const [lockoutUntil, setLockoutUntil] = useState<number | null>(null);
  const [countdown, setCountdown] = useState(0);
  const [checking, setChecking] = useState(false);

  // Countdown timer for lockout
  useEffect(() => {
    if (!lockoutUntil) return;
    const id = setInterval(() => {
      const remaining = Math.ceil((lockoutUntil - Date.now()) / 1000);
      if (remaining <= 0) {
        setLockoutUntil(null);
        setAttempts(0);
        setCountdown(0);
      } else {
        setCountdown(remaining);
      }
    }, 500);
    return () => clearInterval(id);
  }, [lockoutUntil]);

  const tryBiometrics = useCallback(async () => {
    const ok = await authenticateWithBiometrics();
    if (ok) unlock();
  }, [authenticateWithBiometrics, unlock]);

  // Auto-prompt biometrics on mount if enabled
  useEffect(() => {
    if (biometricsEnabled) tryBiometrics();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const checkPin = useCallback(
    async (pin: string) => {
      setChecking(true);
      try {
        const ok = await verifyPin(pin);
        if (ok) {
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
          unlock();
        } else {
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
          const next = attempts + 1;
          setAttempts(next);
          setDigits([]);
          if (next >= MAX_ATTEMPTS) {
            const until = Date.now() + LOCKOUT_SECONDS * 1000;
            setLockoutUntil(until);
            setCountdown(LOCKOUT_SECONDS);
            setError(`Too many attempts. Try again in ${LOCKOUT_SECONDS}s`);
          } else {
            setError(
              `Incorrect PIN. ${MAX_ATTEMPTS - next} attempt${MAX_ATTEMPTS - next !== 1 ? "s" : ""} remaining`
            );
          }
        }
      } finally {
        setChecking(false);
      }
    },
    [attempts, unlock, verifyPin]
  );

  const addDigit = useCallback(
    (d: string) => {
      if (lockoutUntil || checking) return;
      if (digits.length >= PIN_LENGTH) return;
      Haptics.selectionAsync();
      const next = [...digits, d];
      setDigits(next);
      if (next.length === PIN_LENGTH) {
        setTimeout(() => checkPin(next.join("")), 80);
      }
    },
    [checkPin, checking, digits, lockoutUntil]
  );

  const removeDigit = useCallback(() => {
    if (lockoutUntil || checking) return;
    Haptics.selectionAsync();
    setDigits((prev) => prev.slice(0, -1));
    setError(null);
  }, [checking, lockoutUntil]);

  const shortAddr = wallet
    ? `${wallet.address.slice(0, 8)}...${wallet.address.slice(-4)}`
    : "Unlock your wallet";

  return (
    <View style={styles.container}>
      <View style={styles.content}>
        {/* Branding */}
        <View style={styles.logoRow}>
          <Text style={styles.logoMark}>✦</Text>
          <Text style={styles.logoText}>Orah DEX</Text>
        </View>

        <Text style={styles.title}>Enter PIN</Text>
        <Text style={styles.subtitle}>{shortAddr}</Text>

        {/* Dot indicators */}
        <View style={styles.dotsRow}>
          {Array.from({ length: PIN_LENGTH }).map((_, i) => (
            <View
              key={i}
              style={[
                styles.dot,
                i < digits.length && (error ? styles.dotError : styles.dotFilled),
              ]}
            />
          ))}
        </View>

        {/* Error / countdown / checking */}
        {checking ? (
          <ActivityIndicator color={C.primary} style={{ height: 20 }} />
        ) : lockoutUntil ? (
          <Text style={styles.errorText}>Locked for {countdown}s</Text>
        ) : error ? (
          <Text style={styles.errorText}>{error}</Text>
        ) : (
          <View style={{ height: 20 }} />
        )}

        {/* Keypad */}
        <View style={styles.keypad}>
          {KEYPAD_ROWS.map((row, ri) => (
            <View key={ri} style={styles.keyRow}>
              {row.map((key) => {
                if (key === "bio") {
                  return biometricsEnabled ? (
                    <TouchableOpacity key="bio" style={styles.keyBtn} onPress={tryBiometrics}>
                      <Feather name="smile" size={24} color={C.textSecondary} />
                    </TouchableOpacity>
                  ) : (
                    <View key="bio" style={styles.keyBtn} />
                  );
                }
                if (key === "del") {
                  return (
                    <TouchableOpacity key="del" style={styles.keyBtn} onPress={removeDigit}>
                      <Feather name="delete" size={22} color={C.textSecondary} />
                    </TouchableOpacity>
                  );
                }
                return (
                  <TouchableOpacity
                    key={key}
                    style={[
                      styles.keyBtn,
                      styles.keyBtnNum,
                      (!!lockoutUntil || checking) && styles.keyDisabled,
                    ]}
                    onPress={() => addDigit(key)}
                    disabled={!!lockoutUntil || checking}
                    activeOpacity={0.7}
                  >
                    <Text style={styles.keyText}>{key}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          ))}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: C.background,
    zIndex: 9999,
    justifyContent: "center",
    alignItems: "center",
    paddingTop: Platform.OS === "web" ? 0 : 40,
  },
  content: { alignItems: "center", width: "100%", paddingHorizontal: 40 },
  logoRow: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 36 },
  logoMark: { fontSize: 26, color: C.primary },
  logoText: { fontFamily: "Inter_700Bold", fontSize: 22, color: C.text },
  title: { fontFamily: "Inter_700Bold", fontSize: 28, color: C.text, marginBottom: 8 },
  subtitle: { fontFamily: "Inter_400Regular", fontSize: 13, color: C.textMuted, marginBottom: 32 },
  dotsRow: { flexDirection: "row", gap: 18, marginBottom: 12 },
  dot: {
    width: 14, height: 14, borderRadius: 7,
    borderWidth: 2, borderColor: C.cardBorder, backgroundColor: "transparent",
  },
  dotFilled: { backgroundColor: C.primary, borderColor: C.primary },
  dotError: { backgroundColor: C.sell, borderColor: C.sell },
  errorText: {
    fontFamily: "Inter_400Regular", fontSize: 13, color: C.sell,
    marginBottom: 8, textAlign: "center",
  },
  keypad: { width: "100%", gap: 14, marginTop: 16 },
  keyRow: { flexDirection: "row", justifyContent: "center", gap: 20 },
  keyBtn: {
    width: 76, height: 76, borderRadius: 38,
    alignItems: "center", justifyContent: "center",
  },
  keyBtnNum: {
    backgroundColor: C.card, borderWidth: 1, borderColor: C.cardBorder,
  },
  keyDisabled: { opacity: 0.35 },
  keyText: { fontFamily: "Inter_600SemiBold", fontSize: 26, color: C.text },
});
