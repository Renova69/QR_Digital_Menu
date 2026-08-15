import { validateSlug, SLUG_PATTERN } from './slug-rules';

describe('validateSlug', () => {
  it('accepts a normal slug', () => {
    expect(validateSlug('bistro-oranzh')).toBeNull();
  });

  it('accepts the shortest legal slug', () => {
    expect(validateSlug('ab')).toBeNull();
  });

  // Regression: an earlier single-regex form accepted "a" despite a stated
  // 2-40 rule, because the trailing group was optional. Length is now a
  // separate constraint.
  it('rejects a single character', () => {
    expect(validateSlug('a')).toBe('LENGTH');
  });

  it('rejects more than 40 characters', () => {
    expect(validateSlug('a'.repeat(41))).toBe('LENGTH');
  });

  it.each(['my_bistro', '-bistro', 'bistro-', 'Bistro', 'bistro café'])(
    'rejects malformed slug: %s',
    (slug) => {
      expect(validateSlug(slug)).toBe('FORMAT');
    },
  );

  it('rejects the punycode prefix', () => {
    expect(validateSlug('xn--foo')).toBe('PUNYCODE');
  });

  it('rejects an all-numeric slug', () => {
    expect(validateSlug('12345')).toBe('NUMERIC');
  });

  it.each(['www', 'api', 'admin', 'dashboard', 'checkout'])(
    'rejects reserved name: %s',
    (slug) => {
      expect(validateSlug(slug)).toBe('RESERVED');
    },
  );

  // These are literal path segments in the public menu controller's route
  // table (public/resolve, public/:restaurantId/meta|items|trending,
  // /categories). A restaurant holding one of these as its slug would
  // collide with a sibling route — see the comment on RESERVED_SLUGS.
  it.each(['resolve', 'meta', 'items', 'trending', 'categories'])(
    'rejects reserved public-menu route segment: %s',
    (slug) => {
      expect(validateSlug(slug)).toBe('RESERVED');
    },
  );

  it('rejects Cyrillic homoglyphs — the pattern is a security boundary', () => {
    // U+0430 CYRILLIC SMALL LETTER A, visually identical to Latin "a"
    expect(SLUG_PATTERN.test('bistro-orаnzh')).toBe(false);
  });
});
