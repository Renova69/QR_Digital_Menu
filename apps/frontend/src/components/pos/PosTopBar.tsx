import { useState, useContext } from "react";
import { usePos } from "../../context/PosContext";
import RestaurantContext from "../../context/RestaurantContext";

export default function PosTopBar() {
  const { session } = usePos();
  const restaurantCtx = useContext(RestaurantContext);
  const [search, setSearch] = useState("");

  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSearch(e.target.value);
    window.dispatchEvent(
      new CustomEvent("pos:search", { detail: e.target.value })
    );
  };

  const handleOpenTableModal = () => {
    window.dispatchEvent(new CustomEvent("pos:open-table-modal"));
  };

  return (
    <div className="flex items-center gap-3 px-4 py-3">
      <div className="relative flex-1">
        <svg
          className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground"
          xmlns="http://www.w3.org/2000/svg"
          fill="none"
          viewBox="0 0 24 24"
          strokeWidth={2}
          stroke="currentColor"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="m21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.607 10.607Z"
          />
        </svg>
        <input
          type="text"
          value={search}
          onChange={handleSearchChange}
          placeholder="Search items..."
          className="w-full pl-10 pr-4 py-2 rounded-lg bg-card border border-border text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-accent"
        />
      </div>

      <button
        type="button"
        onClick={handleOpenTableModal}
        className="flex items-center gap-2 px-3 py-2 rounded-lg bg-accent/10 border border-accent text-accent text-sm font-medium shrink-0 min-h-[44px]"
      >
        <span className="h-2 w-2 rounded-full bg-green-500" />
        {session?.tableName ?? "Select Table"}
      </button>
    </div>
  );
}
