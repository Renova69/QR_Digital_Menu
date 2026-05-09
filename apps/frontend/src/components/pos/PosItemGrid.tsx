import { useState, useEffect, useContext } from "react";
import api from "../../lib/api";
import RestaurantContext from "../../context/RestaurantContext";
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

export default function PosItemGrid() {
  const restaurantCtx = useContext(RestaurantContext);
  const activeRestaurant = restaurantCtx?.activeRestaurant ?? null;
  const [items, setItems] = useState<MenuItem[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchMenu = () => {
    if (!activeRestaurant) return;
    setLoading(true);
    setError(null);
    api
      .get(`/menu/public/${activeRestaurant.id}`)
      .then((res) => {
        const allItems: MenuItem[] = [];
        const cats = res.data.categories ?? [];
        for (const cat of cats) {
          for (const item of cat.items ?? []) {
            allItems.push({ ...item, categoryId: cat.id });
          }
        }
        setItems(allItems);
      })
      .catch(() => setError("Failed to load menu. Check your connection."))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    fetchMenu();
  }, [activeRestaurant]);

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
        <button
          type="button"
          onClick={() => fetchMenu()}
          className="px-4 py-2 rounded-lg bg-accent text-accent-foreground text-sm"
        >
          Retry
        </button>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <div className="animate-spin h-6 w-6 border-2 border-accent border-t-transparent rounded-full" />
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
