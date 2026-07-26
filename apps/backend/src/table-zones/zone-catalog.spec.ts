import { ZONE_CATALOG_KEYS, isZoneCatalogKey } from './zone-catalog';

describe('zone-catalog', () => {
  it('exports all expected zone keys', () => {
    expect(ZONE_CATALOG_KEYS).toContain('INDOOR');
    expect(ZONE_CATALOG_KEYS).toContain('TERRACE');
    expect(ZONE_CATALOG_KEYS).toContain('BAR');
    expect(ZONE_CATALOG_KEYS.length).toBeGreaterThan(10);
  });

  describe('isZoneCatalogKey', () => {
    it.each(['INDOOR', 'TERRACE', 'GARDEN', 'BAR', 'ROOFTOP', 'QUIET'])(
      'returns true for valid key: %s',
      (key) => {
        expect(isZoneCatalogKey(key)).toBe(true);
      },
    );

    it.each([null, undefined, 123, '', 'RANDOM', 'indoor', 'terrace'])(
      'returns false for invalid value: %s',
      (value) => {
        expect(isZoneCatalogKey(value)).toBe(false);
      },
    );
  });
});
