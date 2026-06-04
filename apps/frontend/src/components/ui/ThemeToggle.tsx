import { useEffect, useRef, useState } from 'react';
import { Sun, Moon } from 'lucide-react';
import { useTheme } from '../../context/ThemeContext';

interface ThemeToggleProps {
  storageKey?: string;
  defaultTheme?: 'light' | 'dark';
  size?: 'sm' | 'default';
  onThemeChange?: (theme: 'light' | 'dark') => void;
}

function getInitialPublicTheme(storageKey: string, defaultTheme: 'light' | 'dark') {
  if (typeof window === 'undefined') return defaultTheme;
  const stored = localStorage.getItem(storageKey) as 'light' | 'dark' | null;
  return stored ?? defaultTheme;
}

function GlobalThemeToggle({ size }: { size: 'sm' | 'default' }) {
  const { theme, toggleTheme } = useTheme();
  const sizeClass = size === 'sm' ? 'h-9 w-9 rounded-xl' : 'h-11 w-11 rounded-2xl';

  return (
    <button
      type="button"
      onClick={toggleTheme}
      className={`relative flex items-center justify-center bg-secondary/80 hover:bg-secondary transition-all active:scale-90 border border-border/50 shadow-lg shadow-black/5 cursor-pointer ${sizeClass}`}
      aria-label={theme === 'light' ? 'Switch to dark mode' : 'Switch to light mode'}
    >
      <div className="relative overflow-hidden w-5 h-5 flex items-center justify-center">
        <Sun className={`absolute h-5 w-5 text-primary transition-all duration-500 transform ${theme === 'dark' ? 'translate-y-0 rotate-0 opacity-100' : 'translate-y-10 rotate-90 opacity-0'}`} />
        <Moon className={`absolute h-5 w-5 text-primary transition-all duration-500 transform ${theme === 'light' ? 'translate-y-0 rotate-0 opacity-100' : 'translate-y-10 -rotate-90 opacity-0'}`} />
      </div>
      <div className="absolute inset-0 rounded-2xl bg-gradient-to-tr from-white/10 to-transparent opacity-0 transition-opacity pointer-events-none" />
    </button>
  );
}

function PublicThemeToggle({
  storageKey,
  defaultTheme = 'light',
  size,
  onThemeChange,
}: Required<Pick<ThemeToggleProps, 'storageKey'>> &
  Pick<ThemeToggleProps, 'defaultTheme' | 'size' | 'onThemeChange'>) {
  const [theme, setTheme] = useState<'light' | 'dark'>(() =>
    getInitialPublicTheme(storageKey, defaultTheme),
  );

  const onThemeChangeRef = useRef(onThemeChange);
  onThemeChangeRef.current = onThemeChange;

  // Apply dark class to <html> and notify parent — only re-runs when theme changes.
  useEffect(() => {
    const root = window.document.documentElement;
    if (theme === 'dark') {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }
    onThemeChangeRef.current?.(theme);
  }, [theme]);

  // Re-seed from localStorage when the restaurant changes (different storageKey).
  // Does NOT re-run when defaultTheme changes after a user toggle — once the user
  // has an opinion in localStorage we honour it, not the restaurant default.
  useEffect(() => {
    setTheme(getInitialPublicTheme(storageKey, defaultTheme));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storageKey]);

  const toggleTheme = () => {
    setTheme(prev => {
      const next = prev === 'light' ? 'dark' : 'light';
      try {
        localStorage.setItem(storageKey, next);
      } catch {
        /* ignore storage failures */
      }
      return next;
    });
  };

  const sizeClass = size === 'sm' ? 'h-9 w-9 rounded-xl' : 'h-11 w-11 rounded-2xl';

  return (
    <button
      type="button"
      onClick={toggleTheme}
      className={`relative flex items-center justify-center bg-secondary/80 hover:bg-secondary transition-all active:scale-90 border border-border/50 shadow-lg shadow-black/5 cursor-pointer ${sizeClass}`}
      aria-label={theme === 'light' ? 'Switch to dark mode' : 'Switch to light mode'}
    >
      <div className="relative overflow-hidden w-5 h-5 flex items-center justify-center">
        <Sun className={`absolute h-5 w-5 text-primary transition-all duration-500 transform ${theme === 'dark' ? 'translate-y-0 rotate-0 opacity-100' : 'translate-y-10 rotate-90 opacity-0'}`} />
        <Moon className={`absolute h-5 w-5 text-primary transition-all duration-500 transform ${theme === 'light' ? 'translate-y-0 rotate-0 opacity-100' : 'translate-y-10 -rotate-90 opacity-0'}`} />
      </div>
      <div className="absolute inset-0 rounded-2xl bg-gradient-to-tr from-white/10 to-transparent opacity-0 transition-opacity pointer-events-none" />
    </button>
  );
}

export const ThemeToggle = ({
  storageKey = 'theme',
  defaultTheme = 'light',
  size = 'default',
  onThemeChange,
}: ThemeToggleProps) => {
  if (storageKey === 'theme') {
    return <GlobalThemeToggle size={size} />;
  }
  return (
    <PublicThemeToggle
      storageKey={storageKey}
      defaultTheme={defaultTheme}
      size={size}
      onThemeChange={onThemeChange}
    />
  );
};
