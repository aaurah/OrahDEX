import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type Theme = 'dark' | 'light' | 'amoled';

interface ThemeState {
  theme: Theme;
  setTheme: (theme: Theme) => void;
}

export const useThemeStore = create<ThemeState>()(
  persist(
    (set) => ({
      theme: 'dark',
      setTheme: (theme) => {
        const html = document.documentElement;
        html.classList.remove('light', 'amoled');
        if (theme === 'light') html.classList.add('light');
        if (theme === 'amoled') html.classList.add('amoled');
        set({ theme });
      },
    }),
    { name: 'aura-dex-theme' }
  )
);

export function applyStoredTheme() {
  const raw = localStorage.getItem('aura-dex-theme');
  if (!raw) return;
  try {
    const { state } = JSON.parse(raw);
    const html = document.documentElement;
    html.classList.remove('light', 'amoled');
    if (state?.theme === 'light') html.classList.add('light');
    if (state?.theme === 'amoled') html.classList.add('amoled');
  } catch {}
}
