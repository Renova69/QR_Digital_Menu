import { transliterateBg } from './transliterate';

describe('transliterateBg', () => {
  it('maps the full Bulgarian alphabet', () => {
    expect(transliterateBg('абвгдежзийклмнопрстуфхцчшщъьюя')).toBe(
      'abvgdezhziyklmnoprstufhtschshshtayyuya',
    );
  });

  it('uses a for ъ, not the ISO-9 breve form', () => {
    expect(transliterateBg('България')).toBe('balgaria');
  });

  it('uses sht for щ', () => {
    expect(transliterateBg('Щастие')).toBe('shtastie');
  });

  it('renders word-final -ия as -ia', () => {
    expect(transliterateBg('Пицария')).toBe('pitsaria');
  });

  it('does not apply the -ия rule mid-word', () => {
    expect(transliterateBg('Пицариян')).toBe('pitsariyan');
  });

  it('transliterates a two-word restaurant name', () => {
    expect(transliterateBg('Бистро Оранж')).toBe('bistro oranzh');
  });

  it('leaves Latin input untouched apart from casing', () => {
    expect(transliterateBg('Restaurant OWEN')).toBe('restaurant owen');
  });
});
