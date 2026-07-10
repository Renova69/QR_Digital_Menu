import { Outlet } from "react-router-dom";
import { PosThemeProvider, usePosTheme } from "../../context/PosThemeContext";
import { AssistanceProvider } from "../../context/AssistanceContext";

function PosThemeShell() {
  const { theme } = usePosTheme();

  return (
    <div
      className={`h-dvh flex flex-col bg-background text-foreground ${theme === "dark" ? "dark" : ""}`}
      data-pos-theme={theme}
      data-testid="pos-theme-shell"
    >
      <Outlet />
    </div>
  );
}

export default function PosLayout() {
  return (
    <PosThemeProvider>
      <AssistanceProvider>
        <PosThemeShell />
      </AssistanceProvider>
    </PosThemeProvider>
  );
}
