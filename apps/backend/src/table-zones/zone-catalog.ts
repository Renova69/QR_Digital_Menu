/**
 * Preset seating-zone catalog. Owners pick a zone by KEY from this fixed list so
 * the label can be translated everywhere (public booking form in any language,
 * staff dashboard) without per-restaurant free text that never translates. A
 * zone may still be fully custom (zoneKey = null, free-text name) — that one
 * falls back to its raw name. Frontend mirrors this list in
 * `apps/frontend/src/lib/zoneCatalog.ts`; keep the two in sync, and the
 * translations live under `zones.<KEY>` in the locale files.
 */
export const ZONE_CATALOG_KEYS = [
  'INDOOR',
  'MAIN_HALL',
  'TERRACE',
  'GARDEN',
  'BALCONY',
  'ROOFTOP',
  'BAR',
  'LOUNGE',
  'POOLSIDE',
  'SEASIDE',
  'WINDOW',
  'PRIVATE_ROOM',
  'NON_SMOKING',
  'SMOKING',
  'KIDS_AREA',
  'QUIET',
] as const;

export type ZoneCatalogKey = (typeof ZONE_CATALOG_KEYS)[number];

const ZONE_CATALOG_SET = new Set<string>(ZONE_CATALOG_KEYS);

export function isZoneCatalogKey(value: unknown): value is ZoneCatalogKey {
  return typeof value === 'string' && ZONE_CATALOG_SET.has(value);
}
