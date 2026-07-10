import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { usePos } from "../../context/PosContext";
import PosItemCard from "./PosItemCard";

interface MenuItem {
  id: string;
  name: string;
  price: number;
  categoryId: string;
  options?: Array<{
    id: string;
    name: string;
    type: "VARIATION" | "ADDON";
    required: boolean;
    choices: Array<{ name: string; priceModifier: number }>;
  }>;
}

interface PosItemGridProps {
  items: MenuItem[];
  loading: boolean;
  error: string | null;
}

export default function PosItemGrid({
  items,
  loading,
  error,
}: PosItemGridProps) {
  const { t } = useTranslation();
  const { searchQuery, categoryFilter, setSearchQuery } = usePos();

  // Clear search when items change (restaurant switched)
  useEffect(() => {
    setSearchQuery("");
  }, [items, setSearchQuery]);

  const filtered = items.filter((item) => {
    if (categoryFilter && item.categoryId !== categoryFilter) return false;
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      return item.name.toLowerCase().includes(q);
    }
    return true;
  });

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center py-12 px-4">
        <p className="mb-2 text-sm text-destructive">{error}</p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <div className="animate-spin h-6 w-6 border-2 border-primary border-t-transparent rounded-full" />
      </div>
    );
  }

  if (filtered.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 px-4 text-muted-foreground">
        <p className="text-sm">{t("pos.noItems", "No items found")}</p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 gap-3 px-4 pb-4">
      {filtered.map((item) => (
        <PosItemCard key={item.id} item={item} />
      ))}
    </div>
  );
}
