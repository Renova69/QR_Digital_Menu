import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { ImportMenuDto } from './import-menu.dto';

function constraintKeys(payload: Record<string, unknown>): string[] {
  const errors = validateSync(plainToInstance(ImportMenuDto, payload), { whitelist: true });
  const keys: string[] = [];
  const walk = (errs: typeof errors) => {
    for (const e of errs) {
      if (e.constraints) keys.push(...Object.keys(e.constraints));
      if (e.children?.length) walk(e.children);
    }
  };
  walk(errors);
  return keys;
}

const menu = (categories: unknown[]) => ({ restaurantId: 'r1', categories });

describe('ImportMenuDto validation', () => {
  it('accepts a minimal valid menu', () => {
    expect(
      constraintKeys(menu([{ name: 'Mains', items: [{ name: 'Soup', price: 5 }] }])),
    ).toHaveLength(0);
  });

  it('rejects a negative item price', () => {
    expect(
      constraintKeys(menu([{ name: 'Mains', items: [{ name: 'Soup', price: -5 }] }])),
    ).toContain('min');
  });

  it('rejects a negative choice price', () => {
    const payload = menu([
      {
        name: 'Mains',
        items: [
          {
            name: 'Pizza',
            price: 10,
            options: [{ name: 'Size', choices: [{ name: 'L', price: -2 }] }],
          },
        ],
      },
    ]);
    expect(constraintKeys(payload)).toContain('min');
  });

  it('rejects too many categories', () => {
    const categories = Array.from({ length: 201 }, (_, i) => ({ name: `c${i}`, items: [] }));
    expect(constraintKeys(menu(categories))).toContain('arrayMaxSize');
  });

  it('rejects too many items in a category', () => {
    const items = Array.from({ length: 501 }, (_, i) => ({ name: `i${i}`, price: 1 }));
    expect(constraintKeys(menu([{ name: 'Mains', items }]))).toContain('arrayMaxSize');
  });
});
