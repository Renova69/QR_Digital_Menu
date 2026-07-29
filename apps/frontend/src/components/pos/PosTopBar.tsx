import { Moon, Search, Sun } from "lucide-react";
import { useTranslation } from "react-i18next";
import { usePos } from "../../context/PosContext";
import { usePosTheme } from "../../context/PosThemeContext";
import PosServiceRequests from "./PosServiceRequests";
import PosSyncStatus from "./PosSyncStatus";

export default function PosTopBar() {
  const { t } = useTranslation();
  const { session, searchQuery, setSearchQuery } = usePos();
  const { theme, toggleTheme } = usePosTheme();

  const handleOpenTableModal = () => {
    window.dispatchEvent(new CustomEvent("pos:open-table-modal"));
  };

  return (
    <div className="flex flex-wrap items-center justify-between gap-2 px-2 py-2 sm:flex-nowrap sm:justify-start sm:gap-3 sm:px-4 sm:py-3">
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

      <div className="relative order-last min-w-0 basis-full sm:order-none sm:basis-auto sm:flex-1">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder={t("pos.searchItems", "Search items...")}
          className="min-w-0 w-full rounded-lg border border-border bg-card py-2 pl-10 pr-4 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
        />
      </div>

      <PosSyncStatus />
      <PosServiceRequests />

      <button
        type="button"
        onClick={handleOpenTableModal}
        className="flex min-h-[44px] max-w-24 shrink-0 items-center gap-2 rounded-lg border border-primary/30 bg-primary/10 px-3 py-2 text-sm font-medium text-primary sm:max-w-none"
      >
        <span className="h-2 w-2 rounded-full bg-success" />
        <span className="truncate">
          {session?.tableName ?? t("pos.selectTable", "Select Table")}
        </span>
      </button>
    </div>
  );
}
