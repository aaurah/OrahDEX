/**
 * useInactivityLock.ts — Auto-lock the wallet after N minutes of inactivity.
 *
 * When the lock fires:
 *   1. Emits the "orahdex:wallet-lock" DOM event.
 *   2. Any component holding decrypted state (PIN prompt cache, viem accounts)
 *      listens for this event and clears its in-memory secrets.
 *
 * Mount this hook ONCE in the app root (App.tsx).
 * Subscribe to the lock event anywhere via onWalletLock() or useWalletLockListener().
 */

import { useEffect, useRef, useCallback } from "react";

const LOCK_EVENT = "orahdex:wallet-lock";

const TRACKED_EVENTS = [
  "mousemove",
  "mousedown",
  "keydown",
  "touchstart",
  "scroll",
  "wheel",
  "pointerdown",
] as const;

/** Default inactivity timeout — 10 minutes */
export const DEFAULT_LOCK_TIMEOUT_MS = 10 * 60 * 1000;

// ── Imperative helpers (usable outside React) ─────────────────────────────────

/** Manually trigger a wallet lock immediately. */
export function emitWalletLock(): void {
  window.dispatchEvent(new CustomEvent(LOCK_EVENT, { bubbles: false }));
}

/**
 * Subscribe to wallet lock events.
 * @returns unsubscribe function
 */
export function onWalletLock(handler: () => void): () => void {
  window.addEventListener(LOCK_EVENT, handler);
  return () => window.removeEventListener(LOCK_EVENT, handler);
}

// ── React hook — mount in app root ───────────────────────────────────────────

/**
 * Starts the inactivity timer and resets it on any user interaction.
 * When the timer expires, emits "orahdex:wallet-lock" and clears the timer.
 *
 * @param timeoutMs  Inactivity threshold in ms (default: 10 min).
 */
export function useInactivityLock(timeoutMs = DEFAULT_LOCK_TIMEOUT_MS): void {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const resetTimer = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      emitWalletLock();
      timerRef.current = null;
    }, timeoutMs);
  }, [timeoutMs]);

  useEffect(() => {
    // Start timer immediately on mount
    resetTimer();

    // Reset on any user activity
    const opts = { passive: true } as AddEventListenerOptions;
    for (const ev of TRACKED_EVENTS) {
      window.addEventListener(ev, resetTimer, opts);
    }

    // Also lock on tab/window visibility loss (user switches away)
    const handleVisibilityChange = () => {
      if (document.visibilityState === "hidden") {
        // Do NOT immediately lock on hidden — user may just switch apps briefly.
        // The existing timer already handles absence. No action needed.
      }
    };
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      for (const ev of TRACKED_EVENTS) {
        window.removeEventListener(ev, resetTimer);
      }
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [resetTimer]);
}

// ── React hook — subscribe to lock events in any component ───────────────────

/**
 * Subscribe to wallet lock events inside a React component.
 * The handler is called whenever the wallet locks (inactivity timeout or manual).
 *
 * @example
 *   useWalletLockListener(() => {
 *     setPinCached(null);
 *     setDecryptedKey(null);
 *   });
 */
export function useWalletLockListener(handler: () => void): void {
  const handlerRef = useRef(handler);
  handlerRef.current = handler;

  useEffect(() => {
    const cb = () => handlerRef.current();
    window.addEventListener(LOCK_EVENT, cb);
    return () => window.removeEventListener(LOCK_EVENT, cb);
  }, []);
}
