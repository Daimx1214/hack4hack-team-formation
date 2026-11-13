import { createContext, useContext, useEffect, useState } from 'react';

// Three-way theme (Build Spec §3.4): the PREFERENCE ('light' | 'dark' |
// 'system') persists in localStorage under 'tf-theme'; the RESOLVED theme
// is written to <html data-theme> and drives every CSS token. 'system'
// follows the OS and keeps listening while it is selected. The inline
// script in index.html applies the same resolution before first paint,
// so there is no flash on load.

const ThemeContext = createContext(null);
const STORAGE_KEY = 'tf-theme';
const META_COLORS = { light: '#FAFAF8', dark: '#0B0D10' };

function storedPreference() {
  try {
    return localStorage.getItem(STORAGE_KEY) || 'system';
  } catch {
    return 'system';
  }
}

function systemPrefersDark() {
  return window.matchMedia('(prefers-color-scheme: dark)').matches;
}

export function ThemeProvider({ children }) {
  const [preference, setPreference] = useState(storedPreference);
  const [resolved, setResolved] = useState(() =>
    typeof document !== 'undefined' ? document.documentElement.dataset.theme || 'light' : 'light'
  );

  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const apply = () => {
      const next =
        preference === 'dark' || (preference === 'system' && mq.matches) ? 'dark' : 'light';
      setResolved(next);
      document.documentElement.dataset.theme = next;
      const meta = document.querySelector('meta[name="theme-color"]');
      if (meta) meta.setAttribute('content', META_COLORS[next]);
    };
    apply();
    try {
      localStorage.setItem(STORAGE_KEY, preference);
    } catch {
      // Private mode — the preference still applies for this session.
    }
    if (preference === 'system') {
      mq.addEventListener('change', apply);
      return () => mq.removeEventListener('change', apply);
    }
    return undefined;
  }, [preference]);

  return (
    <ThemeContext.Provider value={{ preference, setPreference, resolved }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used inside ThemeProvider');
  return ctx;
}
