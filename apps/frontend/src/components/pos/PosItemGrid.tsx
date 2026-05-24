import { useState, useEffect } from "react";
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

export default function PosItemGrid({ items, loading, error }: PosItemGridProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<string | null>(null);

  // Clear filters when items change (restaurant switched)
  useEffect(() => {
    setSearchQuery("");
    setCategoryFilter(null);
  }, [items]);

  useEffect(() => {
    const onSearch = (e: Event) => {
      setSearchQuery((e as CustomEvent).detail ?? "");
    };
    const onCategory = (e: Event) => {
      setCategoryFilter((e as CustomEvent).detail ?? null);
    };
    window.addEventListener("pos:search", onSearch);
    window.addEventListener("pos:category-filter", onCategory);
    return () => {
      window.removeEventListener("pos:search", onSearch);
      window.removeEventListener("pos:category-filter", onCategory);
    };
  }, []);

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
        <p className="text-sm text-red-600 dark:text-red-400 mb-2">{error}</p>
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
        <p className="text-sm">No items found</p>
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
