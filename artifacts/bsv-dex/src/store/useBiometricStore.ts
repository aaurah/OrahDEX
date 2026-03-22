import { create } from "zustand";
import { persist } from "zustand/middleware";

interface BiometricState {
  isEnabled: boolean;
  credentialId: string | null;
  isLocked: boolean;
  setEnabled: (enabled: boolean, credentialId?: string | null) => void;
  lock: () => void;
  unlock: () => void;
}

export const useBiometricStore = create<BiometricState>()(
  persist(
    (set) => ({
      isEnabled: false,
      credentialId: null,
      isLocked: false,
      setEnabled: (enabled, credentialId) =>
        set({
          isEnabled: enabled,
          credentialId: credentialId ?? null,
          isLocked: enabled,
        }),
      lock: () => set({ isLocked: true }),
      unlock: () => set({ isLocked: false }),
    }),
    {
      name: "orahdex-biometric",
      partialize: (s) => ({
        isEnabled: s.isEnabled,
        credentialId: s.credentialId,
      }),
    }
  )
);
