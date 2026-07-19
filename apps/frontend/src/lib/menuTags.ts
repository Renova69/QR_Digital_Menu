import React from "react";
import {
  Wheat,
  WheatOff,
  Milk,
  MilkOff,
  Egg,
  Fish,
  Shell,
  Snail,
  Bean,
  Nut,
  NutOff,
  Salad,
  Vegan,
  Flame,
  Leaf,
  CandyOff,
  Drumstick,
  MoonStar,
} from "lucide-react";
import {
  CeleryIcon,
  MustardIcon,
  SesameIcon,
  SulphitesIcon,
  LupinIcon,
  KosherIcon,
  KetoIcon,
} from "../components/menu/tag-icons";

// Single source of truth for menu item allergen / dietary tags.
//
// Tags are stored on menu items as stable KEYS (e.g. "gluten", "milk",
// "vegetarian") — never as localized text. A key resolves to an icon + a
// localized display name through this registry, so:
//   - the public menu shows language-independent icons (name via tooltip),
//   - no DeepL translation is needed for preset tags (names live in the
//     app's own locale files under the `presetMenuTags.*` namespace — UI
//     chrome; distinct from the unrelated OCR-import `menuTags.*` labels),
//   - the DB column type (`String[]`) is unchanged (no migration).
//
// MUST stay in sync with the backend allowlist:
//   apps/backend/src/menu/menu-tags.ts  (MENU_TAG_KEYS)
// If you add a key here, add it there too (and add a
// `presetMenuTags.<kind>.<key>` label to every locale file).
//
// Legacy / custom free-text values that don't match a key or alias still
// render as a plain text pill — nothing breaks before an owner re-edits.

export type MenuTagKind = "allergen" | "dietary";

export interface MenuTag {
  /** Stable value persisted in item.allergens / item.dietaryTags. */
  key: string;
  kind: MenuTagKind;
  Icon: React.FC<{ className?: string }>;
  /** i18n key for the localized display name, e.g. "presetMenuTags.allergen.gluten". */
  labelKey: string;
  /** Legacy free-text values (BG/EN) that auto-resolve to this tag. */
  aliases?: string[];
}

// The 14 EU-regulated allergens (Regulation 1169/2011, Annex II). Icon gaps
// (celery, mustard, sesame, sulphites, lupin) use hand-drawn SVGs from
// ../components/menu/tag-icons — lucide has no glyph for these.
export const ALLERGEN_TAGS: readonly MenuTag[] = [
  {
    key: "gluten",
    kind: "allergen",
    Icon: Wheat,
    labelKey: "presetMenuTags.allergen.gluten",
    aliases: ["глутен", "пшеница", "cereals", "wheat", "gluten"],
  },
  {
    key: "crustaceans",
    kind: "allergen",
    Icon: Shell,
    labelKey: "presetMenuTags.allergen.crustaceans",
    aliases: [
      "ракообразни",
      "скариди",
      "shellfish",
      "shrimp",
      "prawns",
      "crustaceans",
    ],
  },
  {
    key: "egg",
    kind: "allergen",
    Icon: Egg,
    labelKey: "presetMenuTags.allergen.egg",
    aliases: ["яйца", "яйце", "eggs", "egg"],
  },
  {
    key: "fish",
    kind: "allergen",
    Icon: Fish,
    labelKey: "presetMenuTags.allergen.fish",
    aliases: ["риба", "fish"],
  },
  {
    key: "peanut",
    kind: "allergen",
    Icon: Nut,
    labelKey: "presetMenuTags.allergen.peanut",
    aliases: ["фъстъци", "фъстък", "peanut", "peanuts"],
  },
  {
    key: "soy",
    kind: "allergen",
    Icon: Bean,
    labelKey: "presetMenuTags.allergen.soy",
    aliases: ["соя", "soy", "soya", "soybeans"],
  },
  {
    key: "milk",
    kind: "allergen",
    Icon: Milk,
    labelKey: "presetMenuTags.allergen.milk",
    aliases: ["мляко", "млечни продукти", "млечни", "milk", "dairy"],
  },
  {
    key: "nuts",
    kind: "allergen",
    Icon: Nut,
    labelKey: "presetMenuTags.allergen.nuts",
    aliases: ["ядки", "орехи", "nuts", "tree nuts", "tree nut"],
  },
  {
    key: "celery",
    kind: "allergen",
    Icon: CeleryIcon,
    labelKey: "presetMenuTags.allergen.celery",
    aliases: ["целина", "celery"],
  },
  {
    key: "mustard",
    kind: "allergen",
    Icon: MustardIcon,
    labelKey: "presetMenuTags.allergen.mustard",
    aliases: ["горчица", "mustard"],
  },
  {
    key: "sesame",
    kind: "allergen",
    Icon: SesameIcon,
    labelKey: "presetMenuTags.allergen.sesame",
    aliases: ["сусам", "sesame"],
  },
  {
    key: "sulphites",
    kind: "allergen",
    Icon: SulphitesIcon,
    labelKey: "presetMenuTags.allergen.sulphites",
    aliases: ["сулфити", "sulphites", "sulfites", "sulphur dioxide"],
  },
  {
    key: "lupin",
    kind: "allergen",
    Icon: LupinIcon,
    labelKey: "presetMenuTags.allergen.lupin",
    aliases: ["лупина", "lupin", "lupine"],
  },
  {
    key: "mollusc",
    kind: "allergen",
    Icon: Snail,
    labelKey: "presetMenuTags.allergen.mollusc",
    aliases: [
      "мекотели",
      "миди",
      "mollusks",
      "molluscs",
      "mussels",
      "squid",
      "mollusc",
    ],
  },
];

// Standard 10 + keto/paleo (not EU-regulated — easy to extend).
export const DIETARY_TAGS: readonly MenuTag[] = [
  {
    key: "vegetarian",
    kind: "dietary",
    Icon: Salad,
    labelKey: "presetMenuTags.dietary.vegetarian",
    aliases: ["вегетарианско", "вегетарианец", "vegetarian"],
  },
  {
    key: "vegan",
    kind: "dietary",
    Icon: Vegan,
    labelKey: "presetMenuTags.dietary.vegan",
    aliases: ["веган", "веганско", "vegan"],
  },
  {
    key: "gluten-free",
    kind: "dietary",
    Icon: WheatOff,
    labelKey: "presetMenuTags.dietary.gluten-free",
    aliases: ["без глутен", "gluten-free", "gluten free"],
  },
  {
    key: "lactose-free",
    kind: "dietary",
    Icon: MilkOff,
    labelKey: "presetMenuTags.dietary.lactose-free",
    aliases: ["без лактоза", "lactose-free", "lactose free"],
  },
  {
    key: "halal",
    kind: "dietary",
    Icon: MoonStar,
    labelKey: "presetMenuTags.dietary.halal",
    aliases: ["халал", "halal"],
  },
  {
    key: "kosher",
    kind: "dietary",
    Icon: KosherIcon,
    labelKey: "presetMenuTags.dietary.kosher",
    aliases: ["кошер", "kosher"],
  },
  {
    key: "spicy",
    kind: "dietary",
    Icon: Flame,
    labelKey: "presetMenuTags.dietary.spicy",
    aliases: ["люто", "пикантно", "spicy", "hot"],
  },
  {
    key: "organic",
    kind: "dietary",
    Icon: Leaf,
    labelKey: "presetMenuTags.dietary.organic",
    aliases: ["био", "органично", "organic"],
  },
  {
    key: "sugar-free",
    kind: "dietary",
    Icon: CandyOff,
    labelKey: "presetMenuTags.dietary.sugar-free",
    aliases: ["без захар", "sugar-free", "sugar free"],
  },
  {
    key: "nut-free",
    kind: "dietary",
    Icon: NutOff,
    labelKey: "presetMenuTags.dietary.nut-free",
    aliases: ["без ядки", "nut-free", "nut free"],
  },
  {
    key: "keto",
    kind: "dietary",
    Icon: KetoIcon,
    labelKey: "presetMenuTags.dietary.keto",
    aliases: ["кето", "keto"],
  },
  {
    key: "paleo",
    kind: "dietary",
    Icon: Drumstick,
    labelKey: "presetMenuTags.dietary.paleo",
    aliases: ["палео", "paleo"],
  },
];

export const MENU_TAGS: readonly MenuTag[] = [
  ...ALLERGEN_TAGS,
  ...DIETARY_TAGS,
];

const TAG_BY_KEY: ReadonlyMap<string, MenuTag> = new Map(
  MENU_TAGS.map((tag) => [tag.key, tag]),
);

const TAG_BY_ALIAS: ReadonlyMap<string, MenuTag> = new Map(
  MENU_TAGS.flatMap((tag) =>
    (tag.aliases ?? []).map(
      (alias) => [alias.trim().toLowerCase(), tag] as const,
    ),
  ),
);

/**
 * Resolve a stored value (canonical key, or legacy free text) to a preset
 * MenuTag, or `null` for genuinely custom values — callers fall back to
 * rendering the raw string as a text pill.
 */
export function resolveTag(value: string): MenuTag | null {
  if (!value) return null;
  const normalized = value.trim().toLowerCase();
  return TAG_BY_KEY.get(normalized) ?? TAG_BY_ALIAS.get(normalized) ?? null;
}
