import { createContext, useCallback, useContext, useMemo, useState } from "react";
import type { ReactNode } from "react";

type PosTheme = "light" | "dark";

interface PosThemeContextValue {
  theme: PosTheme;
  toggleTheme: () => void;
}

const PosThemeContext = createContext<PosThemeContextValue | null>(null);

export function PosThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setTheme] = useState<PosTheme>("light");

  const toggleTheme = useCallback(() => {
    setTheme((current) => (current === "dark" ? "light" : "dark"));
  }, []);

  const value = useMemo(
    () => ({
      theme,
      toggleTheme,
    }),
    [theme, toggleTheme],
  );

  return (
    <PosThemeContext.Provider value={value}>
      {children}
    </PosThemeContext.Provider>
  );
}

export function usePosTheme() {
  const context = useContext(PosThemeContext);
  if (!context) {
    throw new Error("usePosTheme must be used inside PosThemeProvider");
  }
  return context;
}
