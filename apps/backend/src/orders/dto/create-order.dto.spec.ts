import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { CreateOrderDto } from './create-order.dto';

/** Phase 1 — order input validation (#5). */
function validate(payload: Record<string, unknown>) {
  const dto = plainToInstance(CreateOrderDto, payload);
  return validateSync(dto, { whitelist: true, forbidNonWhitelisted: false });
}

const baseItem = {
  menuItemId: 'item-1',
  quantity: 2,
  selectedOptions: [],
};

const basePayload = {
  customerName: 'Alice',
  tableId: '1',
  items: [baseItem],
};

/** Recursively collect every constraint key from an error tree. */
function constraintKeys(errors: ReturnType<typeof validateSync>): string[] {
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

describe('CreateOrderDto validation', () => {
  it('accepts a valid order', () => {
    expect(validate(basePayload)).toHaveLength(0);
  });

  describe('quantity', () => {
    it('rejects zero', () => {
      const errors = validate({ ...basePayload, items: [{ ...baseItem, quantity: 0 }] });
      expect(constraintKeys(errors)).toContain('min');
    });

    it('rejects negative', () => {
      const errors = validate({ ...basePayload, items: [{ ...baseItem, quantity: -3 }] });
      expect(constraintKeys(errors)).toContain('min');
    });

    it('rejects fractional', () => {
      const errors = validate({ ...basePayload, items: [{ ...baseItem, quantity: 1.5 }] });
      expect(constraintKeys(errors)).toContain('isInt');
    });
  });

  describe('redeemPoints', () => {
    it('rejects negative', () => {
      const errors = validate({ ...basePayload, redeemPoints: -10 });
      expect(constraintKeys(errors)).toContain('min');
    });

    it('rejects fractional', () => {
      const errors = validate({ ...basePayload, redeemPoints: 12.5 });
      expect(constraintKeys(errors)).toContain('isInt');
    });

    it('accepts zero', () => {
      expect(validate({ ...basePayload, redeemPoints: 0 })).toHaveLength(0);
    });
  });

  describe('selectedOptions', () => {
    it('rejects an option missing optionId', () => {
      const errors = validate({
        ...basePayload,
        items: [
          {
            ...baseItem,
            selectedOptions: [{ optionName: 'Size', choiceName: 'L', priceModifier: 1 }],
          },
        ],
      });
      expect(constraintKeys(errors)).toContain('isString');
    });

    it('accepts a well-formed option', () => {
      const errors = validate({
        ...basePayload,
        items: [
          {
            ...baseItem,
            selectedOptions: [
              { optionId: 'o1', optionName: 'Size', choiceName: 'L', priceModifier: 1.5 },
            ],
          },
        ],
      });
      expect(errors).toHaveLength(0);
    });
  });
});
