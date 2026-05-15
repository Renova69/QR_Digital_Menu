// apps/frontend/src/components/menu/CategoryPills.tsx
import { useEffect, useRef } from 'react';
import { Category } from '../../types';
import { getTranslatedField } from '../../lib/translation';

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
      el.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
    }
  }, [activeCategory]);

  return (
    <div className="sticky top-[4.5rem] z-30 px-3 py-2">
      <div
        ref={scrollRef}
        className="flex gap-2 overflow-x-auto hide-scrollbar glass-panel p-1.5 rounded-[1.75rem] border-white/5 shadow-lg"
      >
        {categories.map((cat) => {
          const catName =
            getTranslatedField(cat, selectedLang, 'name') || cat.name;
          const isActive = activeCategory === cat.id;
          return (
            <button
              key={cat.id}
              ref={(el) => { pillRefs.current[cat.id] = el; }}
              onClick={() => onSelect(cat.id)}
              className={`whitespace-nowrap px-4 py-2 rounded-full text-[11px] font-black uppercase tracking-wider transition-all duration-200 active:scale-95 flex-shrink-0 ${
                isActive
                  ? 'bg-foreground text-background shadow-md'
                  : 'text-muted-foreground hover:text-foreground hover:bg-secondary/50'
              }`}
            >
              {catName}
            </button>
          );
        })}
      </div>
    </div>
  );
}
