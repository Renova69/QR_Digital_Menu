import {
  computeSourceHash,
  computeSetHash,
} from './menu-translation-hash.util';

describe('computeSourceHash', () => {
  it('is deterministic for the same input', () => {
    expect(computeSourceHash('Шопска салата')).toBe(
      computeSourceHash('Шопска салата'),
    );
  });

  it('is a 32-character hex string (md5)', () => {
    expect(computeSourceHash('test')).toMatch(/^[a-f0-9]{32}$/);
  });

  it('normalizes case — matches the same text in a different case', () => {
    expect(computeSourceHash('Кебапче')).toBe(computeSourceHash('кебапче'));
    expect(computeSourceHash('Kebapche')).toBe(computeSourceHash('KEBAPCHE'));
  });

  it('normalizes leading/trailing whitespace', () => {
    expect(computeSourceHash('  Мезета  ')).toBe(computeSourceHash('Мезета'));
  });

  it('does NOT normalize internal whitespace (a real content change)', () => {
    expect(computeSourceHash('Кисело мляко')).not.toBe(
      computeSourceHash('Киселомляко'),
    );
  });

  it('produces different hashes for different content', () => {
    expect(computeSourceHash('Кебапче')).not.toBe(computeSourceHash('Кюфте'));
  });
});

describe('computeSetHash', () => {
  it('is order-independent — same members in a different order hash equal', () => {
    expect(computeSetHash(['gluten', 'milk'])).toBe(
      computeSetHash(['milk', 'gluten']),
    );
  });

  it('is case/whitespace-insensitive per member', () => {
    expect(computeSetHash(['Gluten', ' milk '])).toBe(
      computeSetHash(['gluten', 'milk']),
    );
  });

  it('is duplicate-insensitive', () => {
    expect(computeSetHash(['gluten', 'gluten', 'milk'])).toBe(
      computeSetHash(['gluten', 'milk']),
    );
  });

  it('changes when a member is added', () => {
    expect(computeSetHash(['gluten'])).not.toBe(
      computeSetHash(['gluten', 'milk']),
    );
  });

  it('changes when a member is removed', () => {
    expect(computeSetHash(['gluten', 'milk'])).not.toBe(
      computeSetHash(['gluten']),
    );
  });

  it('hashes an empty set consistently', () => {
    expect(computeSetHash([])).toBe(computeSetHash([]));
  });
});
