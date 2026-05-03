/**
 * Notification feedback effects (sound + vibration).
 *
 * - Sound: a short two-tone "ding" synthesised via Web Audio API (no asset
 *   download). Falls back silently on unsupported browsers.
 * - Vibration: uses navigator.vibrate; honours the OS-level vibration setting
 *   automatically. Falls back silently on iOS Safari (no support).
 *
 * Both are gated on user preferences read from useSettingsStore.
 */
import type { NotifType } from "@/store/useNotificationStore";

let _ctx: AudioContext | null = null;

function getCtx(): AudioContext | null {
  if (typeof window === "undefined") return null;
  try {
    if (!_ctx) {
      const Ctor = window.AudioContext || (window as any).webkitAudioContext;
      if (!Ctor) return null;
      _ctx = new Ctor();
    }
    // Browsers suspend the context until a user gesture; resume best-effort.
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
    // Quick attack, exponential decay = pleasant chime.
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(tone.gain, t + 0.015);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + tone.dur);
    osc.connect(gain).connect(ctx.destination);
    osc.start(t);
    osc.stop(t + tone.dur + 0.02);
    t += tone.dur;
  }
}

/** Choose a tone palette based on the notification type. */
function tonesFor(type: NotifType): ToneSpec[] {
  switch (type) {
    case "error":
    case "warning":
      // Descending two-tone alert.
      return [
        { freq: 660, dur: 0.12, gain: 0.18, type: "triangle" },
        { freq: 440, dur: 0.18, gain: 0.18, type: "triangle" },
      ];
    case "price_alert":
      // Bright triple-chime so it stands out from order events.
      return [
        { freq: 880,  dur: 0.08, gain: 0.16 },
        { freq: 1175, dur: 0.08, gain: 0.16 },
        { freq: 1568, dur: 0.16, gain: 0.16 },
      ];
    case "success":
    case "order_filled":
    case "deposit":
      // Cheerful ascending two-tone.
      return [
        { freq: 784,  dur: 0.10, gain: 0.16 },
        { freq: 1047, dur: 0.16, gain: 0.16 },
      ];
    default:
      // Neutral single soft chime.
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

/**
 * Public API: play sound + vibration for a notification.
 * Call sites pass the user prefs so we don't re-import zustand here.
 */
export function playNotificationFx(
  type: NotifType,
  prefs: { sound: boolean; haptics: boolean },
) {
  if (prefs.sound) {
    try { playTones(tonesFor(type)); } catch { /* ignore audio errors */ }
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
 * Prime the audio context on first user gesture (most browsers require this).
 * Mounted once at app boot via useNotificationFxPrimer.
 */
export function primeAudioContext() {
  const ctx = getCtx();
  if (!ctx) return;
  if (ctx.state === "suspended") void ctx.resume();
}
