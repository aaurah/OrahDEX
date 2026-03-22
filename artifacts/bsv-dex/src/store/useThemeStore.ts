import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type Theme = 'dark' | 'light' | 'amoled' | 'system';

function applyTheme(theme: Theme) {
  const html = document.documentElement;
  html.classList.remove('light', 'amoled');
  if (theme === 'light') {
    html.classList.add('light');
  } else if (theme === 'amoled') {
    html.classList.add('amoled');
  } else if (theme === 'system') {
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    if (!prefersDark) html.classList.add('light');
  }
}

interface ThemeState {
  theme: Theme;
  setTheme: (theme: Theme) => void;
}

export const useThemeStore = create<ThemeState>()(
  persist(
    (set) => ({
      theme: 'dark',
      setTheme: (theme) => {
        applyTheme(theme);
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
    applyTheme(state?.theme ?? 'dark');
  } catch {}
}
