/**
 * Notification feedback effects (sound + vibration + desktop push).
 *
 * All effects are gated on user preferences:
 *  - per-category mute (skip everything for that category)
 *  - Do Not Disturb (skip sound/vibration/desktop, still log to feed)
 *  - master sound / haptics / desktop toggles
 *
 * Falls back silently on any unsupported browser/OS combination.
 */
import type { NotifType, AppNotification } from "@/store/useNotificationStore";
import { CATEGORY_OF } from "@/lib/notificationCategories";

let _ctx: AudioContext | null = null;

function getCtx(): AudioContext | null {
  if (typeof window === "undefined") return null;
  try {
    if (!_ctx) {
      const Ctor = window.AudioContext || (window as any).webkitAudioContext;
      if (!Ctor) return null;
      _ctx = new Ctor();
    }
    if (_ctx.state === "suspended") void _ctx.resume();
    return _ctx;
  } catch {
    return null;
  }
}

interface ToneSpec { freq: number; dur: number; gain: number; type?: OscillatorType }

function playTones(tones: ToneSpec[]) {
  const ctx = getCtx();
  if (!ctx) return;
  let t = ctx.currentTime;
  for (const tone of tones) {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = tone.type ?? "sine";
    osc.frequency.value = tone.freq;
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(tone.gain, t + 0.015);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + tone.dur);
    osc.connect(gain).connect(ctx.destination);
    osc.start(t);
    osc.stop(t + tone.dur + 0.02);
    t += tone.dur;
  }
}

function tonesFor(type: NotifType): ToneSpec[] {
  switch (type) {
    case "error":
    case "warning":
      return [
        { freq: 660, dur: 0.12, gain: 0.18, type: "triangle" },
        { freq: 440, dur: 0.18, gain: 0.18, type: "triangle" },
      ];
    case "price_alert":
      return [
        { freq: 880,  dur: 0.08, gain: 0.16 },
        { freq: 1175, dur: 0.08, gain: 0.16 },
        { freq: 1568, dur: 0.16, gain: 0.16 },
      ];
    case "success":
    case "order_filled":
    case "deposit":
      return [
        { freq: 784,  dur: 0.10, gain: 0.16 },
        { freq: 1047, dur: 0.16, gain: 0.16 },
      ];
    default:
      return [{ freq: 880, dur: 0.18, gain: 0.14 }];
  }
}

function vibratePattern(type: NotifType): number | number[] {
  switch (type) {
    case "error":
    case "warning":       return [60, 40, 60, 40, 60];
    case "price_alert":   return [40, 30, 40, 30, 80];
    case "success":
    case "order_filled":
    case "deposit":       return [30, 25, 30];
    default:              return 40;
  }
}

export interface NotificationPrefs {
  sound: boolean;
  haptics: boolean;
  desktop: boolean;
  dndUntil: number | null;
  mutedCategories: string[];
}

function isDndActive(prefs: NotificationPrefs): boolean {
  if (prefs.dndUntil === null) return false;
  return Date.now() < prefs.dndUntil;
}

function isMuted(type: NotifType, prefs: NotificationPrefs): boolean {
  return prefs.mutedCategories.includes(CATEGORY_OF[type]);
}

/** Play sound + vibration. Honours DND, mute, and master toggles. */
export function playNotificationFx(type: NotifType, prefs: NotificationPrefs) {
  if (isMuted(type, prefs)) return;
  if (isDndActive(prefs)) return;

  if (prefs.sound) {
    try { playTones(tonesFor(type)); } catch { /* ignore */ }
  }
  if (prefs.haptics) {
    try {
      const nav = typeof navigator !== "undefined" ? navigator : null;
      if (nav && typeof nav.vibrate === "function") {
        nav.vibrate(vibratePattern(type));
      }
    } catch { /* ignore */ }
  }
}

/**
 * Show a native browser/OS notification when the tab is in the background.
 * Honours DND, mute, master desktop toggle, and notification permission.
 */
export function showDesktopNotification(
  entry: AppNotification,
  prefs: NotificationPrefs,
  onClick?: () => void,
) {
  if (!prefs.desktop) return;
  if (isMuted(entry.type, prefs)) return;
  if (isDndActive(prefs)) return;
  if (typeof window === "undefined" || !("Notification" in window)) return;
  if (Notification.permission !== "granted") return;
  // Don't double-notify when the user is actively looking at the tab.
  if (typeof document !== "undefined" && document.visibilityState === "visible") return;

  try {
    const n = new Notification(entry.title, {
      body: entry.body,
      tag: entry.id,         // dedupes if the same notification is re-fired
      icon: "/favicon.ico",
      silent: !prefs.sound,  // honour the user's sound choice for the OS layer
    });
    n.onclick = () => {
      try { window.focus(); } catch { /* ignore */ }
      onClick?.();
      n.close();
    };
    // Auto-close non-critical notifications after 8s so the OS center stays tidy.
    if (entry.type !== "error" && entry.type !== "warning") {
      window.setTimeout(() => { try { n.close(); } catch { /* ignore */ } }, 8000);
    }
  } catch { /* ignore */ }
}

/** Request browser notification permission. Returns the resulting state. */
export async function requestDesktopPermission(): Promise<NotificationPermission | "unsupported"> {
  if (typeof window === "undefined" || !("Notification" in window)) return "unsupported";
  if (Notification.permission === "granted") return "granted";
  if (Notification.permission === "denied")  return "denied";
  try {
    const result = await Notification.requestPermission();
    return result;
  } catch {
    return "default";
  }
}

export function getDesktopPermission(): NotificationPermission | "unsupported" {
  if (typeof window === "undefined" || !("Notification" in window)) return "unsupported";
  return Notification.permission;
}

/** Prime the audio context on first user gesture (browsers require this). */
export function primeAudioContext() {
  const ctx = getCtx();
  if (!ctx) return;
  if (ctx.state === "suspended") void ctx.resume();
}
