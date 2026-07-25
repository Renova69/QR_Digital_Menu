import { validateRows } from './validate-glossary';
import type { TermRow } from './seed-glossary-terms';

const VALID_ROW: TermRow = {
  bg: 'мезе',
  t: {
    en: 'Appetizer',
    de: 'Vorspeise',
    ru: 'Закуска',
    ro: 'Aperitiv',
    it: 'Antipasto',
    es: 'Aperitivo',
    fr: 'Entrée',
  },
};

describe('validateRows', () => {
  it('returns no errors for a well-formed row set', () => {
    expect(validateRows([VALID_ROW])).toEqual([]);
  });

  it('flags a duplicate bg term (case-insensitive)', () => {
    const errors = validateRows([VALID_ROW, { ...VALID_ROW, bg: 'МЕЗЕ' }]);
    expect(errors.some((e) => e.includes('Duplicate'))).toBe(true);
  });

  it('flags leading/trailing whitespace on the bg term', () => {
    const errors = validateRows([{ ...VALID_ROW, bg: ' мезе' }]);
    expect(errors.some((e) => e.includes('leading/trailing spaces'))).toBe(
      true,
    );
  });

  it('flags a bg term that is not lowercase', () => {
    const errors = validateRows([{ ...VALID_ROW, bg: 'Мезе' }]);
    expect(errors.some((e) => e.includes('not lowercase'))).toBe(true);
  });

  it('flags a missing required target language', () => {
    const { fr: _fr, ...rest } = VALID_ROW.t;
    const errors = validateRows([{ bg: 'мезе', t: rest }]);
    expect(errors.some((e) => e.includes('missing language: fr'))).toBe(true);
  });

  it('flags leading/trailing whitespace on a translation', () => {
    const errors = validateRows([
      { bg: 'мезе', t: { ...VALID_ROW.t, en: ' Appetizer ' } },
    ]);
    expect(
      errors.some((e) => e.includes('translation for en has leading')),
    ).toBe(true);
  });

  it('returns an empty array for an empty row set', () => {
    expect(validateRows([])).toEqual([]);
  });
});
