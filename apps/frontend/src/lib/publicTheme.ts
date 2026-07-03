// Shared public brand theming (palette + light/dark) used by the public menu
// and the reservation booking page so both look consistent.

export type PublicBrandMode = "light" | "dark";

export interface PublicPalette {
  bg: string;
  text: string;
  card: string;
  accent: string;
}

// Any restaurant-like object carrying the branding/theme columns.
export interface ThemeableRestaurant {
  accentColor?: string | null;
  themeBgColor?: string | null;
  themeTextColor?: string | null;
  themeCardColor?: string | null;
  themeLightBgColor?: string | null;
  themeLightTextColor?: string | null;
  themeLightCardColor?: string | null;
  themeLightAccentColor?: string | null;
  themeDarkBgColor?: string | null;
  themeDarkTextColor?: string | null;
  themeDarkCardColor?: string | null;
  themeDarkAccentColor?: string | null;
}

export const DEFAULT_PUBLIC_LIGHT: PublicPalette = {
  bg: "#FFFFFF",
  text: "#0E0B1A",
  card: "#FFFFFF",
  accent: "#4F46E5",
};

export const DEFAULT_PUBLIC_DARK: PublicPalette = {
  bg: "#0B0A14",
  text: "#F5F4FA",
  card: "#15131F",
  accent: "#8B6FFF",
};

export function resolvePublicPalette(
  restaurant: ThemeableRestaurant | undefined | null,
  mode: PublicBrandMode,
): PublicPalette {
  const fallback = mode === "dark" ? DEFAULT_PUBLIC_DARK : DEFAULT_PUBLIC_LIGHT;
  if (!restaurant) return fallback;

  if (mode === "dark") {
    return {
      bg: restaurant.themeDarkBgColor || DEFAULT_PUBLIC_DARK.bg,
      text: restaurant.themeDarkTextColor || DEFAULT_PUBLIC_DARK.text,
      card: restaurant.themeDarkCardColor || DEFAULT_PUBLIC_DARK.card,
      accent:
        restaurant.themeDarkAccentColor ||
        restaurant.accentColor ||
        DEFAULT_PUBLIC_DARK.accent,
    };
  }

  return {
    bg:
      restaurant.themeLightBgColor ||
      restaurant.themeBgColor ||
      DEFAULT_PUBLIC_LIGHT.bg,
    text:
      restaurant.themeLightTextColor ||
      restaurant.themeTextColor ||
      DEFAULT_PUBLIC_LIGHT.text,
    card:
      restaurant.themeLightCardColor ||
      restaurant.themeCardColor ||
      restaurant.themeBgColor ||
      DEFAULT_PUBLIC_LIGHT.card,
    accent:
      restaurant.themeLightAccentColor ||
      restaurant.accentColor ||
      DEFAULT_PUBLIC_LIGHT.accent,
  };
}

// One shared localStorage key per restaurant, so a theme chosen on the menu and
// on the booking page stay in sync.
function themeKey(restaurantId?: string | null): string {
  return restaurantId ? `theme-${restaurantId}` : "theme";
}

export function getStoredPublicTheme(
  restaurantId: string | undefined | null,
  fallback: PublicBrandMode,
): PublicBrandMode {
  if (typeof window === "undefined") return fallback;
  const stored = localStorage.getItem(
    themeKey(restaurantId),
  ) as PublicBrandMode | null;
  return stored === "light" || stored === "dark" ? stored : fallback;
}

export function setStoredPublicTheme(
  restaurantId: string | undefined | null,
  mode: PublicBrandMode,
): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(themeKey(restaurantId), mode);
  } catch {
    /* ignore */
  }
}

export function hexToRgba(hex: string, alpha: number): string {
  const normalized = hex.replace("#", "");
  if (!/^[0-9a-fA-F]{6}$/.test(normalized)) return hex;
  const r = parseInt(normalized.slice(0, 2), 16);
  const g = parseInt(normalized.slice(2, 4), 16);
  const b = parseInt(normalized.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

export const RTL_LANGS = new Set(["ar", "he", "fa", "ur"]);

export const LANGUAGE_LABELS: Record<string, string> = {
  bg: "БГ",
  en: "EN",
  ro: "RO",
  de: "DE",
  es: "ES",
  fr: "FR",
  it: "IT",
  zh: "中文",
  el: "EL",
  ja: "日本",
  ru: "РУ",
  ar: "ع",
};
