import { Moon, Search, Sun } from "lucide-react";
import { useTranslation } from "react-i18next";
import { usePos } from "../../context/PosContext";
import { usePosTheme } from "../../context/PosThemeContext";
import PosSyncStatus from "./PosSyncStatus";

export default function PosTopBar() {
  const { t } = useTranslation();
  const { session, searchQuery, setSearchQuery } = usePos();
  const { theme, toggleTheme } = usePosTheme();

  const handleOpenTableModal = () => {
    window.dispatchEvent(new CustomEvent("pos:open-table-modal"));
  };

  return (
    <div className="flex items-center gap-3 px-4 py-3">
      <button
        type="button"
        onClick={toggleTheme}
        className="flex h-10 w-10 min-h-[44px] min-w-[44px] shrink-0 items-center justify-center rounded-lg border border-border bg-card text-muted-foreground hover:text-foreground"
        aria-label={
          theme === "dark"
            ? t("pos.switchToLight", "Switch POS to light mode")
            : t("pos.switchToDark", "Switch POS to dark mode")
        }
      >
        {theme === "dark" ? (
          <Sun className="h-5 w-5" />
        ) : (
          <Moon className="h-5 w-5" />
        )}
      </button>

      <div className="relative flex-1">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder={t("pos.searchItems", "Search items...")}
          className="w-full rounded-lg border border-border bg-card py-2 pl-10 pr-4 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
        />
      </div>

      <PosSyncStatus />

      <button
        type="button"
        onClick={handleOpenTableModal}
        className="flex min-h-[44px] shrink-0 items-center gap-2 rounded-lg border border-primary/30 bg-primary/10 px-3 py-2 text-sm font-medium text-primary"
      >
        <span className="h-2 w-2 rounded-full bg-success" />
        {session?.tableName ?? t("pos.selectTable", "Select Table")}
      </button>
    </div>
  );
}
