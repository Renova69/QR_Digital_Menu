import { useState, useEffect } from "react";

interface Category {
  id: string;
  name: string;
}

interface PosCategoryFilterProps {
  categories: Category[];
  menuError: string | null;
}

export default function PosCategoryFilter({ categories, menuError }: PosCategoryFilterProps) {
  const [activeCategory, setActiveCategory] = useState<string | null>(null);

  // Clear active category when categories change (restaurant switched)
  useEffect(() => {
    setActiveCategory(null);
  }, [categories]);

  const handleSelect = (categoryId: string | null) => {
    setActiveCategory(categoryId);
    window.dispatchEvent(
      new CustomEvent("pos:category-filter", { detail: categoryId })
    );
  };

  return (
    <>
      <div className="overflow-x-auto scrollbar-hide px-4 pb-3 flex gap-2">
        <button
          type="button"
          onClick={() => handleSelect(null)}
          className={`shrink-0 px-4 py-2 rounded-full text-sm font-medium min-h-[44px] transition-none ${
            activeCategory === null
              ? "bg-accent/10 border border-accent text-accent"
              : "bg-card border border-border text-foreground"
          }`}
        >
          All
        </button>
        {categories.map((cat) => (
          <button
            key={cat.id}
            type="button"
            onClick={() => handleSelect(cat.id)}
            className={`shrink-0 px-4 py-2 rounded-full text-sm font-medium min-h-[44px] transition-none ${
              activeCategory === cat.id
                ? "bg-accent/10 border border-accent text-accent"
                : "bg-card border border-border text-foreground"
            }`}
          >
            {cat.name}
          </button>
        ))}
      </div>
      {menuError && (
        <p className="text-xs text-red-500 px-4 pb-1">Failed to load categories</p>
      )}
    </>
  );
}
