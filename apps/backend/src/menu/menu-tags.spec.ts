import { isPresetTagKey, MENU_TAG_KEYS } from './menu-tags';

describe('isPresetTagKey', () => {
  it('returns true for a known preset key', () => {
    expect(isPresetTagKey('gluten')).toBe(true);
    expect(isPresetTagKey('gluten-free')).toBe(true);
  });

  it('is case-insensitive and trims whitespace', () => {
    expect(isPresetTagKey('  Gluten  ')).toBe(true);
    expect(isPresetTagKey('MILK')).toBe(true);
  });

  it('returns false for custom free text', () => {
    expect(isPresetTagKey("chef's secret spice blend")).toBe(false);
  });

  it('has no duplicate keys', () => {
    expect(new Set(MENU_TAG_KEYS).size).toBe(MENU_TAG_KEYS.length);
  });
});
