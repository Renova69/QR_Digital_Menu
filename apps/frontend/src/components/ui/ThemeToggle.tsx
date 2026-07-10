import { useEffect, useRef, useState } from "react";
import { Sun, Moon } from "lucide-react";
import { useTheme } from "../../context/ThemeContext";

interface ThemeToggleProps {
  storageKey?: string;
  defaultTheme?: "light" | "dark";
  size?: "sm" | "default";
  onThemeChange?: (theme: "light" | "dark") => void;
}

function getInitialPublicTheme(
  storageKey: string,
  defaultTheme: "light" | "dark",
) {
  if (typeof window === "undefined") return defaultTheme;
  const stored = localStorage.getItem(storageKey) as "light" | "dark" | null;
  return stored ?? defaultTheme;
}

function GlobalThemeToggle({ size }: { size: "sm" | "default" }) {
  const { theme, toggleTheme } = useTheme();
  const sizeClass =
    size === "sm" ? "h-9 w-9 rounded-xl" : "h-11 w-11 rounded-2xl";

  return (
    <button
      type="button"
      onClick={toggleTheme}
      className={`relative flex items-center justify-center bg-secondary/80 hover:bg-secondary transition-all active:scale-90 border border-border/50 shadow-lg shadow-black/5 cursor-pointer ${sizeClass}`}
      aria-label={
        theme === "light" ? "Switch to dark mode" : "Switch to light mode"
      }
    >
      <div className="relative overflow-hidden w-5 h-5 flex items-center justify-center">
        <Sun
          className={`absolute h-5 w-5 text-primary transition-all duration-500 transform ${theme === "dark" ? "translate-y-0 rotate-0 opacity-100" : "translate-y-10 rotate-90 opacity-0"}`}
        />
        <Moon
          className={`absolute h-5 w-5 text-primary transition-all duration-500 transform ${theme === "light" ? "translate-y-0 rotate-0 opacity-100" : "translate-y-10 -rotate-90 opacity-0"}`}
        />
      </div>
      <div className="absolute inset-0 rounded-2xl bg-gradient-to-tr from-white/10 to-transparent opacity-0 transition-opacity pointer-events-none" />
    </button>
  );
}

function PublicThemeToggle({
  storageKey,
  defaultTheme = "light",
  size,
  onThemeChange,
}: Required<Pick<ThemeToggleProps, "storageKey">> &
  Pick<ThemeToggleProps, "defaultTheme" | "size" | "onThemeChange">) {
  const [theme, setTheme] = useState<"light" | "dark">(() =>
    getInitialPublicTheme(storageKey, defaultTheme),
  );

  const onThemeChangeRef = useRef(onThemeChange);
  onThemeChangeRef.current = onThemeChange;

  // Notify parent when theme changes so it can update CSS custom properties
  // on the wrapper div. DO NOT touch document.documentElement here — that is
  // ThemeProvider's responsibility. Public-menu dark mode is driven entirely
  // by CSS vars (resolvePublicPalette), not by the .dark class on <html>.
  useEffect(() => {
    onThemeChangeRef.current?.(theme);
  }, [theme]);

  // Re-seed when:
  //   a) storageKey changes (user navigated to a different restaurant), or
  //   b) defaultTheme changes (API data arrived with the restaurant's default)
  //      but ONLY when the user has not stored a preference yet — once they have
  //      an opinion in localStorage we never override it.
  useEffect(() => {
    if (localStorage.getItem(storageKey) === null) {
      setTheme(defaultTheme ?? "light");
    }
  }, [storageKey, defaultTheme]);

  const toggleTheme = () => {
    setTheme((prev) => {
      const next = prev === "light" ? "dark" : "light";
      try {
        localStorage.setItem(storageKey, next);
      } catch {
        /* ignore storage failures */
      }
      return next;
    });
  };

  const sizeClass =
    size === "sm" ? "h-9 w-9 rounded-xl" : "h-11 w-11 rounded-2xl";

  return (
    <button
      type="button"
      onClick={toggleTheme}
      className={`relative flex items-center justify-center bg-secondary/80 hover:bg-secondary transition-all active:scale-90 border border-border/50 shadow-lg shadow-black/5 cursor-pointer ${sizeClass}`}
      aria-label={
        theme === "light" ? "Switch to dark mode" : "Switch to light mode"
      }
    >
      <div className="relative overflow-hidden w-5 h-5 flex items-center justify-center">
        <Sun
          className={`absolute h-5 w-5 text-primary transition-all duration-500 transform ${theme === "dark" ? "translate-y-0 rotate-0 opacity-100" : "translate-y-10 rotate-90 opacity-0"}`}
        />
        <Moon
          className={`absolute h-5 w-5 text-primary transition-all duration-500 transform ${theme === "light" ? "translate-y-0 rotate-0 opacity-100" : "translate-y-10 -rotate-90 opacity-0"}`}
        />
      </div>
      <div className="absolute inset-0 rounded-2xl bg-gradient-to-tr from-white/10 to-transparent opacity-0 transition-opacity pointer-events-none" />
    </button>
  );
}

export const ThemeToggle = ({
  storageKey = "theme",
  defaultTheme = "light",
  size = "default",
  onThemeChange,
}: ThemeToggleProps) => {
  if (storageKey === "theme") {
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
