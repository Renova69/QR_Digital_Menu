import type { TFunction } from "i18next";

/**
 * Preset seating-zone catalog (mirror of the backend
 * `apps/backend/src/table-zones/zone-catalog.ts`). Owners pick a zone by KEY so
 * the label translates everywhere via `zones.<KEY>` in the locale files. A zone
 * can still be custom (no key) — it falls back to its free-text name.
 */
export const ZONE_CATALOG_KEYS = [
  "INDOOR",
  "MAIN_HALL",
  "TERRACE",
  "GARDEN",
  "BALCONY",
  "ROOFTOP",
  "BAR",
  "LOUNGE",
  "POOLSIDE",
  "SEASIDE",
  "WINDOW",
  "PRIVATE_ROOM",
  "NON_SMOKING",
  "SMOKING",
  "KIDS_AREA",
  "QUIET",
] as const;

export type ZoneCatalogKey = (typeof ZONE_CATALOG_KEYS)[number];

const ZONE_CATALOG_SET = new Set<string>(ZONE_CATALOG_KEYS);

export function isZoneCatalogKey(value: string | null | undefined): boolean {
  return !!value && ZONE_CATALOG_SET.has(value);
}

/** Stable English-ish fallback name for a preset key (e.g. KIDS_AREA → "Kids Area"). */
export function humanizeZoneKey(key: string): string {
  return key
    .toLowerCase()
    .split("_")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

/**
 * Display label for a zone: the translated catalog label when it's a preset
 * key, otherwise the raw custom name. `t` is the i18next translate function.
 */
export function zoneLabel(
  t: TFunction,
  // Accepts either shape: the reservation-config zone (`key`) or a raw TableZone
  // entity (`zoneKey`). Both carry the preset key under a different name.
  zone: { key?: string | null; zoneKey?: string | null; name: string },
): string {
  const presetKey = zone.key ?? zone.zoneKey;
  if (presetKey && ZONE_CATALOG_SET.has(presetKey)) {
    return t(`zones.${presetKey}`, { defaultValue: zone.name });
  }
  return zone.name;
}
