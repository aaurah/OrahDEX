import { create } from "zustand";

/**
 * Global, promise-based PIN prompt for signing-time unlock of imported wallets.
 *
 * Flow:
 *   const result = await usePinPromptStore.getState().prompt({
 *     address,
 *     verify: async (pin) => {
 *       const secret = await unlockWithPin(address, pin); // throws on bad PIN
 *       return secret;
 *     },
 *   });
 *
 * The modal stays open until `verify` resolves (success → closes + resolves)
 * or the user cancels (modal closes + rejects). On a verify-throw, the modal
 * shows an inline error and lets the user retry without closing.
 */

export interface PinPromptOpts<T> {
  address: string;
  title?:  string;
  subtitle?: string;
  verify:  (pin: string) => Promise<T>;
}

interface PinPromptState {
  open:     boolean;
  address:  string | null;
  title:    string;
  subtitle: string;
  busy:     boolean;
  error:    string | null;
  /** internal — wired by `prompt()` */
  _verify:   ((pin: string) => Promise<unknown>) | null;
  _resolve:  ((value: unknown) => void) | null;
  _reject:   ((reason: unknown) => void) | null;

  prompt: <T>(opts: PinPromptOpts<T>) => Promise<T>;
  submit: (pin: string) => Promise<void>;
  cancel: () => void;
}

export const usePinPromptStore = create<PinPromptState>((set, get) => ({
  open: false, address: null, title: "Enter PIN", subtitle: "", busy: false, error: null,
  _verify: null, _resolve: null, _reject: null,

  prompt: <T>(opts: PinPromptOpts<T>) => new Promise<T>((resolve, reject) => {
    const prev = get()._reject;
    if (prev) { try { prev(new Error("Superseded by a new PIN prompt")); } catch { /* noop */ } }
    set({
      open:     true,
      address:  opts.address,
      title:    opts.title    ?? "Enter PIN to sign",
      subtitle: opts.subtitle ?? "Use your OrahDEX PIN to unlock this imported wallet.",
      busy:     false,
      error:    null,
      _verify:  opts.verify as (pin: string) => Promise<unknown>,
      _resolve: resolve as (value: unknown) => void,
      _reject:  reject,
    });
  }),

  submit: async (pin: string) => {
    const { _verify, _resolve } = get();
    if (!_verify) return;
    set({ busy: true, error: null });
    try {
      const value = await _verify(pin);
      set({ open: false, busy: false, address: null, _verify: null, _resolve: null, _reject: null });
      _resolve?.(value);
    } catch (err: any) {
      set({ busy: false, error: err?.message ?? "Wrong PIN" });
    }
  },

  cancel: () => {
    const { _reject } = get();
    set({ open: false, busy: false, address: null, error: null, _verify: null, _resolve: null, _reject: null });
    _reject?.(new Error("PIN entry cancelled"));
  },
}));
