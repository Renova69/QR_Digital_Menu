import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { usePos } from "../../context/PosContext";

interface Category {
  id: string;
  name: string;
}

interface PosCategoryFilterProps {
  categories: Category[];
  menuError: string | null;
}

export default function PosCategoryFilter({
  categories,
  menuError,
}: PosCategoryFilterProps) {
  const { t } = useTranslation();
  const { categoryFilter, setCategoryFilter } = usePos();

  // Clear active category when categories change (restaurant switched)
  useEffect(() => {
    setCategoryFilter(null);
  }, [categories, setCategoryFilter]);

  return (
    <>
      <div className="overflow-x-auto scrollbar-hide px-4 pb-3 flex gap-2">
        <button
          type="button"
          onClick={() => setCategoryFilter(null)}
          className={`shrink-0 px-4 py-2 rounded-full text-sm font-medium min-h-[44px] transition-none ${
            categoryFilter === null
              ? "bg-primary/10 border border-primary text-primary"
              : "bg-card border border-border text-foreground"
          }`}
        >
          {t("pos.allCategories", "All")}
        </button>
        {categories.map((cat) => (
          <button
            key={cat.id}
            type="button"
            onClick={() => setCategoryFilter(cat.id)}
            className={`shrink-0 px-4 py-2 rounded-full text-sm font-medium min-h-[44px] transition-none ${
              categoryFilter === cat.id
                ? "bg-primary/10 border border-primary text-primary"
                : "bg-card border border-border text-foreground"
            }`}
          >
            {cat.name}
          </button>
        ))}
      </div>
      {menuError && (
        <p className="px-4 pb-1 text-xs text-destructive">
          {t("pos.failedCategories", "Failed to load categories")}
        </p>
      )}
    </>
  );
}
