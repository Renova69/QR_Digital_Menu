import { useEffect, useState } from 'react';
import { Sun, Moon } from 'lucide-react';

interface ThemeToggleProps {
  storageKey?: string;
  defaultTheme?: 'light' | 'dark';
  size?: 'sm' | 'default';
}

export const ThemeToggle = ({ storageKey = 'theme', defaultTheme = 'light', size = 'default' }: ThemeToggleProps) => {
    const [theme, setTheme] = useState<'light' | 'dark'>(() => {
        if (typeof window !== 'undefined') {
            const stored = localStorage.getItem(storageKey) as 'light' | 'dark' | null;
            if (stored) return stored;
            if (storageKey === 'theme') {
                return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
            }
            return defaultTheme;
        }
        return defaultTheme;
    });

    useEffect(() => {
        const root = window.document.documentElement;
        if (theme === 'dark') {
            root.classList.add('dark');
        } else {
            root.classList.remove('dark');
        }
        localStorage.setItem(storageKey, theme);
    }, [theme, storageKey]);

    const toggleTheme = () => {
        setTheme(prev => prev === 'light' ? 'dark' : 'light');
    };

    const sizeClass = size === 'sm'
        ? 'h-9 w-9 rounded-xl'
        : 'h-11 w-11 rounded-2xl';

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
            <div className="absolute inset-0 rounded-2xl bg-gradient-to-tr from-white/10 to-transparent opacity-0 transition-opacity pointer-events-none"></div>
        </button>
    );
};
