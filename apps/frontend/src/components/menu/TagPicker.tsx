import React, { useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown, Search, X } from "lucide-react";
import { useTranslation } from "react-i18next";
import { resolveTag, type MenuTag } from "../../lib/menuTags";

interface TagPickerProps {
  label: string;
  /** Raw stored values — preset keys, or (for legacy items) free text. */
  value: string[];
  onChange: (values: string[]) => void;
  /** ALLERGEN_TAGS or DIETARY_TAGS from ../../lib/menuTags. */
  options: readonly MenuTag[];
  placeholder?: string;
}

/**
 * Multi-select preset tag picker — mirrors FontPicker.tsx's searchable
 * dropdown UX (plain React + Tailwind, no extra dependency), but toggles
 * membership in `value` instead of single-selecting. Selected tags render as
 * removable icon chips below the trigger. Emits preset keys; any legacy
 * free-text value already in `value` that doesn't resolve to a preset is
 * left untouched (shown as a plain removable chip) rather than dropped.
 */
export const TagPicker: React.FC<TagPickerProps> = ({
  label,
  value,
  onChange,
  options,
  placeholder,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState("");
  const rootRef = useRef<HTMLDivElement>(null);
  const { t } = useTranslation();

  useEffect(() => {
    if (!isOpen) return;
    const handler = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [isOpen]);

  const filtered = useMemo(() => {
    if (!search) return options;
    const q = search.toLowerCase();
    return options.filter((opt) => {
      const label = t(opt.labelKey, opt.key);
      return (
        opt.key.toLowerCase().includes(q) || label.toLowerCase().includes(q)
      );
    });
  }, [options, search, t]);

  function toggle(key: string) {
    onChange(
      value.includes(key) ? value.filter((v) => v !== key) : [...value, key],
    );
  }

  function remove(raw: string) {
    onChange(value.filter((v) => v !== raw));
  }

  return (
    <div className="space-y-2" ref={rootRef}>
      <label className="block text-sm font-medium text-foreground/80">
        {label}
      </label>

      <div className="relative">
        <button
          type="button"
          onClick={() => setIsOpen((o) => !o)}
          className="w-full text-left px-3 py-2 border border-border rounded-lg bg-background text-foreground flex justify-between items-center focus:outline-none focus:ring-2 focus:ring-primary/50 transition-all hover:border-primary/30"
          aria-expanded={isOpen}
          aria-haspopup="listbox"
        >
          <span className="text-sm text-muted-foreground">
            {value.length > 0
              ? t("tagPicker.selectedCount", "{{count}} selected", {
                  count: value.length,
                })
              : (placeholder ?? t("tagPicker.select", "Select..."))}
          </span>
          <ChevronDown
            size={13}
            className={`flex-shrink-0 opacity-50 transition-transform duration-200 ${isOpen ? "rotate-180" : ""}`}
          />
        </button>

        {isOpen && (
          <div
            className="absolute z-50 w-full mt-1 bg-card border border-border rounded-xl shadow-xl overflow-hidden"
            role="listbox"
            aria-multiselectable="true"
            style={{
              maxHeight: "280px",
              display: "flex",
              flexDirection: "column",
            }}
          >
            <div className="p-2 border-b border-border bg-card flex-shrink-0">
              <div className="relative">
                <Search
                  size={11}
                  className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none"
                />
                <input
                  type="text"
                  placeholder={t("tagPicker.search", "Search...")}
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  onClick={(e) => e.stopPropagation()}
                  className="w-full pl-7 pr-7 py-1.5 text-xs bg-background border border-border rounded-md focus:outline-none focus:ring-1 focus:ring-primary/50"
                  autoFocus
                />
                {search && (
                  <button
                    type="button"
                    onClick={() => setSearch("")}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  >
                    <X size={11} />
                  </button>
                )}
              </div>
            </div>

            <div className="overflow-y-auto custom-scrollbar flex-1">
              {filtered.length === 0 && (
                <p className="text-xs text-muted-foreground text-center py-6">
                  {t("tagPicker.noneFound", "No matches found")}
                </p>
              )}
              {filtered.map((opt) => {
                const isSelected = value.includes(opt.key);
                const optLabel = t(opt.labelKey, opt.key);
                const Icon = opt.Icon;
                return (
                  <button
                    key={opt.key}
                    type="button"
                    role="option"
                    aria-selected={isSelected}
                    onClick={() => toggle(opt.key)}
                    className={`w-full text-left px-3 py-2 flex items-center gap-2.5 transition-colors ${
                      isSelected
                        ? "bg-primary/10 text-primary"
                        : "hover:bg-muted text-foreground"
                    }`}
                  >
                    <Icon className="h-4 w-4 flex-shrink-0" />
                    <span className="text-sm flex-1 truncate">{optLabel}</span>
                    {isSelected && (
                      <span className="text-[10px] font-semibold text-primary flex-shrink-0">
                        ✓
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {value.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {value.map((raw) => {
            const preset = resolveTag(raw);
            const displayLabel = preset ? t(preset.labelKey, raw) : raw;
            const Icon = preset?.Icon;
            return (
              <span
                key={raw}
                className="inline-flex items-center gap-1 pl-2 pr-1 py-1 rounded-full bg-secondary text-xs font-medium text-foreground"
              >
                {Icon && <Icon className="h-3 w-3" />}
                {displayLabel}
                <button
                  type="button"
                  onClick={() => remove(raw)}
                  className="p-0.5 rounded-full hover:bg-background/60 transition-colors"
                  aria-label={t("tagPicker.remove", "Remove")}
                >
                  <X size={10} />
                </button>
              </span>
            );
          })}
        </div>
      )}
    </div>
  );
};
