import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { useAuth } from './AuthContext.jsx';

const STORAGE_KEY = 'nexus-theme';
const ThemeContext = createContext(null);

// 4 modes : 'light'/'dark' forcent explicitement la palette (via data-theme sur
// <html>) ; 'system' suit prefers-color-scheme ; 'schedule' bascule sombre la
// nuit (20h–7h, heure locale du navigateur) et claire le jour, sans dépendre
// du réglage du système d'exploitation.
export const THEME_MODES = [
  { value: 'system', label: 'Système' },
  { value: 'light', label: 'Clair' },
  { value: 'dark', label: 'Sombre' },
  { value: 'schedule', label: 'Auto (horaire)' }
];

function isNightNow() {
  const h = new Date().getHours();
  return h < 7 || h >= 20;
}

function prefersDark() {
  return window.matchMedia?.('(prefers-color-scheme: dark)').matches ?? false;
}

export function ThemeProvider({ children }) {
  const { user } = useAuth();
  const [theme, setThemeState] = useState(() => localStorage.getItem(STORAGE_KEY) || 'system');
  const [systemDark, setSystemDark] = useState(prefersDark);
  const [night, setNight] = useState(isNightNow);

  // Le compte utilisateur (une fois connu) est la source de vérité ; le
  // localStorage ne sert que de valeur de secours pour les pages non
  // authentifiées (login/setup) et pour peindre sans attendre /auth/me.
  useEffect(() => {
    if (user?.theme) setThemeState(user.theme);
  }, [user?.theme]);

  useEffect(() => {
    const mql = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = () => setSystemDark(mql.matches);
    mql.addEventListener('change', onChange);
    return () => mql.removeEventListener('change', onChange);
  }, []);

  useEffect(() => {
    const id = setInterval(() => setNight(isNightNow()), 60_000);
    return () => clearInterval(id);
  }, []);

  const resolved = useMemo(() => {
    if (theme === 'light' || theme === 'dark') return theme;
    if (theme === 'schedule') return night ? 'dark' : 'light';
    return systemDark ? 'dark' : 'light';
  }, [theme, systemDark, night]);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', resolved);
    localStorage.setItem(STORAGE_KEY, theme);
  }, [theme, resolved]);

  const { updateProfile } = useAuth();

  function setTheme(value) {
    setThemeState(value);
    if (user) updateProfile({ theme: value }).catch(() => {});
  }

  const toggle = () => setTheme(resolved === 'dark' ? 'light' : 'dark');

  return (
    <ThemeContext.Provider value={{ theme, resolved, setTheme, toggle }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme doit être utilisé dans <ThemeProvider>');
  return ctx;
}
