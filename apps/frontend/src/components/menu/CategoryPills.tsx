// apps/frontend/src/components/menu/CategoryPills.tsx
import { useEffect, useRef } from "react";
import { Category } from "../../types";
import { getTranslatedField } from "../../lib/translation";

interface CategoryPillsProps {
  categories: Category[];
  activeCategory: string | null;
  selectedLang: string;
  onSelect: (id: string) => void;
}

export function CategoryPills({
  categories,
  activeCategory,
  selectedLang,
  onSelect,
}: CategoryPillsProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const pillRefs = useRef<Record<string, HTMLButtonElement | null>>({});

  useEffect(() => {
    if (!activeCategory) return;
    const el = pillRefs.current[activeCategory];
    if (el) {
      el.scrollIntoView({
        behavior: "smooth",
        block: "nearest",
        inline: "center",
      });
    }
  }, [activeCategory]);

  return (
    <div className="sticky top-[7rem] z-30 px-3 py-2">
      <div
        ref={scrollRef}
        className="flex gap-2 overflow-x-auto hide-scrollbar glass-panel p-1.5 rounded-[1.75rem] border-white/5 shadow-lg"
        style={{
          // Fade the first/last ~1.5rem so partially-visible pills blend out rather than hard-clip
          maskImage:
            "linear-gradient(to right, transparent, black 1.5rem, black calc(100% - 1.5rem), transparent)",
          WebkitMaskImage:
            "linear-gradient(to right, transparent, black 1.5rem, black calc(100% - 1.5rem), transparent)",
          // scrollIntoView respects this padding so it won't land items inside the fade zone
          scrollPaddingInline: "1.5rem",
        }}
      >
        {/* Left spacer keeps first pill clear of the fade zone */}
        <div className="flex-shrink-0 w-3" aria-hidden="true" />
        {categories.map((cat) => {
          const catName =
            getTranslatedField(cat, selectedLang, "name") ||
            cat.originalName ||
            cat.name;
          const isActive = activeCategory === cat.id;
          return (
            <button
              key={cat.id}
              ref={(el) => {
                pillRefs.current[cat.id] = el;
              }}
              onClick={() => onSelect(cat.id)}
              className={`flex min-h-[44px] flex-shrink-0 items-center whitespace-nowrap rounded-full px-5 py-2 text-[11px] font-bold uppercase tracking-wider transition-all duration-200 active:scale-95 ${
                isActive
                  ? "shadow-md"
                  : "text-muted-foreground hover:text-foreground hover:bg-secondary/50"
              }`}
              style={
                isActive
                  ? {
                      background: "var(--gradient-brand)",
                      color: "var(--brand-contrast, #fff)",
                    }
                  : {}
              }
            >
              {catName}
            </button>
          );
        })}
        {/* Right spacer mirrors the left */}
        <div className="flex-shrink-0 w-3" aria-hidden="true" />
      </div>
    </div>
  );
}
