import { generateSlugBase, withSuffix } from './slug-generator';
import { validateSlug } from './slug-rules';

const ID = 'cmf3k9x2b0001qw8h7d2n4p6t';

describe('generateSlugBase', () => {
  it('transliterates a Bulgarian name', () => {
    expect(generateSlugBase('Бистро Оранж', ID)).toBe('bistro-oranzh');
  });

  it('slugifies a Latin name', () => {
    expect(generateSlugBase('Restaurant OWEN', ID)).toBe('restaurant-owen');
  });

  it('strips Latin diacritics', () => {
    expect(generateSlugBase('Café Münchén', ID)).toBe('cafe-munchen');
  });

  it('collapses runs of separators', () => {
    expect(generateSlugBase('Bistro   ---   Orange!!', ID)).toBe(
      'bistro-orange',
    );
  });

  it('falls back when nothing survives', () => {
    expect(generateSlugBase('🍕🍕🍕', ID)).toBe('restaurant-cmf3k9');
  });

  it('falls back for an all-numeric name', () => {
    expect(generateSlugBase('12345', ID)).toBe('restaurant-cmf3k9');
  });

  it('truncates at a hyphen boundary, never mid-word', () => {
    const name = 'aaaaaaaaaa bbbbbbbbbb cccccccccc dddddddddd eeeeeeeeee';
    const slug = generateSlugBase(name, ID);
    expect(slug.length).toBeLessThanOrEqual(40);
    expect(slug.endsWith('-')).toBe(false);
    expect(slug).toBe('aaaaaaaaaa-bbbbbbbbbb-cccccccccc');
  });

  it('always produces a slug that passes validation', () => {
    for (const name of ['Бистро Оранж', '🍕', '12345', 'a', 'Café Münchén']) {
      expect(validateSlug(generateSlugBase(name, ID))).toBeNull();
    }
  });

  // Regression: when the first token alone is >= SLUG_MAX_LENGTH, the
  // 40-char truncation window contains no hyphen to prefer. This is a
  // deliberate hard-cut, not a bug — see truncateAtBoundary in
  // slug-generator.ts. Bulgarian transliteration reaches this more easily
  // than it looks, since ж/ч/ш/щ each expand one letter into 2-3 Latin
  // characters.
  it('hard-cuts when the first token alone exceeds the length bound', () => {
    const name = 'a'.repeat(50);
    const slug = generateSlugBase(name, ID);
    expect(slug.length).toBe(40);
    expect(slug.endsWith('-')).toBe(false);
    expect(validateSlug(slug)).toBeNull();
  });

  it('hard-cuts a long first token even when later words would have a hyphen', () => {
    const name = `${'a'.repeat(50)} bbbbb ccccc`;
    const slug = generateSlugBase(name, ID);
    expect(slug.length).toBe(40);
    expect(slug.endsWith('-')).toBe(false);
    expect(validateSlug(slug)).toBeNull();
  });
});

describe('withSuffix', () => {
  it('is deterministic, never random', () => {
    expect(withSuffix('bistro-oranzh', 2)).toBe('bistro-oranzh-2');
    expect(withSuffix('bistro-oranzh', 3)).toBe('bistro-oranzh-3');
  });

  it('keeps the suffixed slug within the length bound', () => {
    const base = 'a'.repeat(40);
    const suffixed = withSuffix(base, 10);
    expect(suffixed.length).toBeLessThanOrEqual(40);
    expect(suffixed.endsWith('-10')).toBe(true);
  });
});
