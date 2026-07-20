import React, { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { resolveTag, type MenuTagKind } from "../../lib/menuTags";
import { Tooltip, TooltipContent, TooltipTrigger } from "../ui/tooltip";

interface MenuTagBadgesProps {
  /** Raw stored values (canonical keys or legacy free text). */
  allergens?: string[];
  dietaryTags?: string[];
  /** Legacy translated fallback labels, aligned by index with the raw arrays. */
  allergenLabels?: string[];
  dietaryLabels?: string[];
  className?: string;
}

interface BadgeEntry {
  id: string;
  kind: MenuTagKind;
  /** Preset icon when this is a resolved preset tag; undefined for legacy free text. */
  Icon?: React.FC<{ className?: string }>;
  /** Localized display name. */
  name: string;
  preset: boolean;
}

/** "gluten-free" -> "Gluten Free" — used only as the t() default before the
 * locale key resolves, never shown once translations are in place. */
function titleCaseKey(key: string): string {
  return key
    .split("-")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

function buildEntries(
  values: string[] | undefined,
  labels: string[] | undefined,
  kind: MenuTagKind,
  t: (key: string, fallback: string) => string,
): BadgeEntry[] {
  if (!values?.length) return [];
  return values.map((raw, idx) => {
    const tag = resolveTag(raw);
    if (tag) {
      return {
        id: `${kind}-${tag.key}-${idx}`,
        kind,
        Icon: tag.Icon,
        name: t(tag.labelKey, titleCaseKey(tag.key)),
        preset: true,
      };
    }
    return {
      id: `${kind}-custom-${idx}`,
      kind,
      name: labels?.[idx] || raw,
      preset: false,
    };
  });
}

const KIND_CLASS: Record<MenuTagKind, string> = {
  dietary:
    "border-emerald-500/25 text-emerald-600 dark:text-emerald-400 bg-emerald-500/5",
  allergen:
    "border-amber-500/25 text-amber-600 dark:text-amber-400 bg-amber-500/5",
};

/**
 * Renders allergen/dietary tags on the public menu. Preset tags (resolved
 * via resolveTag()) render as a themed icon with a hover/tap tooltip showing
 * the localized name — legacy free-text values that don't match a preset
 * key keep today's translated text-pill look, so nothing breaks before an
 * owner re-edits the item and picks from the new tag list.
 */
export const MenuTagBadges: React.FC<MenuTagBadgesProps> = ({
  allergens,
  dietaryTags,
  allergenLabels,
  dietaryLabels,
  className,
}) => {
  const { t } = useTranslation();
  // Radix Tooltip only opens on hover/focus — it explicitly ignores touch
  // pointerdown, so it never fires on tap. Track the open badge ourselves
  // and toggle it on click (fires for both mouse click and touch tap), with
  // hover still opening it for free on desktop via onMouseEnter.
  const [openId, setOpenId] = useState<string | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!openId) return;
    const closeOnOutside = (e: PointerEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpenId(null);
      }
    };
    document.addEventListener("pointerdown", closeOnOutside);
    return () => document.removeEventListener("pointerdown", closeOnOutside);
  }, [openId]);

  const entries = [
    ...buildEntries(dietaryTags, dietaryLabels, "dietary", t),
    ...buildEntries(allergens, allergenLabels, "allergen", t),
  ];

  if (entries.length === 0) return null;

  return (
    <div
      ref={rootRef}
      className={`flex flex-wrap gap-1 ${className ?? ""}`}
      role="list"
    >
      {entries.map((entry) => {
        // Legacy free-text values keep the original text-pill look.
        if (!entry.preset || !entry.Icon) {
          return (
            <span
              key={entry.id}
              role="listitem"
              className={`px-1.5 py-0 rounded-full border text-[9px] uppercase font-black tracking-wide leading-[1.5] ${KIND_CLASS[entry.kind]}`}
            >
              {entry.name}
            </span>
          );
        }
        const Icon = entry.Icon;
        const isOpen = openId === entry.id;
        return (
          <span key={entry.id} role="listitem">
            <Tooltip
              open={isOpen}
              onOpenChange={(next) => {
                // Accept Radix's own hover/focus-driven opens; on close,
                // only clear if we're the one currently open.
                if (next) setOpenId(entry.id);
                else setOpenId((cur) => (cur === entry.id ? null : cur));
              }}
            >
              <TooltipTrigger asChild>
                <button
                  type="button"
                  aria-label={entry.name}
                  onPointerDown={(e) => {
                    // Radix's Trigger opens on `focus`, which a touch tap
                    // triggers via the browser's default mousedown-focus
                    // action *before* `click` fires. That race lets the
                    // focus-driven open and our click toggle land in the
                    // same batch and cancel out — the tap requires a
                    // second press to actually show anything. Blocking the
                    // default here suppresses only the pointer-triggered
                    // focus (keyboard Tab focus is unaffected), so the
                    // click toggle below is the sole source of truth.
                    e.preventDefault();
                  }}
                  onClick={(e) => {
                    e.stopPropagation();
                    setOpenId((cur) => (cur === entry.id ? null : entry.id));
                  }}
                  className={`flex items-center justify-center rounded-full border p-1 transition-transform active:scale-90 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 ${KIND_CLASS[entry.kind]}`}
                >
                  <Icon className="h-3.5 w-3.5" />
                </button>
              </TooltipTrigger>
              <TooltipContent>{entry.name}</TooltipContent>
            </Tooltip>
          </span>
        );
      })}
    </div>
  );
};
