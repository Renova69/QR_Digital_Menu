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

  it('rejects an unknown order source', () => {
    const errors = validate({ ...basePayload, source: 'PUBLIC_POS' });

    expect(constraintKeys(errors)).toContain('isIn');
  });

  describe('quantity', () => {
    it('rejects zero', () => {
      const errors = validate({
        ...basePayload,
        items: [{ ...baseItem, quantity: 0 }],
      });
      expect(constraintKeys(errors)).toContain('min');
    });

    it('rejects negative', () => {
      const errors = validate({
        ...basePayload,
        items: [{ ...baseItem, quantity: -3 }],
      });
      expect(constraintKeys(errors)).toContain('min');
    });

    it('rejects fractional', () => {
      const errors = validate({
        ...basePayload,
        items: [{ ...baseItem, quantity: 1.5 }],
      });
      expect(constraintKeys(errors)).toContain('isInt');
    });
  });

  describe('usePoints', () => {
    it('accepts a boolean loyalty-discount intent', () => {
      expect(validate({ ...basePayload, usePoints: true })).toHaveLength(0);
      expect(validate({ ...basePayload, usePoints: false })).toHaveLength(0);
    });

    it('rejects non-boolean values', () => {
      const errors = validate({ ...basePayload, usePoints: 1 });
      expect(constraintKeys(errors)).toContain('isBoolean');
    });

    it('accepts a positive whole-point redemption amount', () => {
      const dto = plainToInstance(CreateOrderDto, {
        ...basePayload,
        redeemPoints: 500,
      });

      expect(
        validateSync(dto, { whitelist: true, forbidNonWhitelisted: false }),
      ).toHaveLength(0);
      expect(dto.redeemPoints).toBe(500);
    });

    it('rejects zero, negative, and fractional redemption amounts', () => {
      expect(
        constraintKeys(validate({ ...basePayload, redeemPoints: 0 })),
      ).toContain('min');
      expect(
        constraintKeys(validate({ ...basePayload, redeemPoints: -1 })),
      ).toContain('min');
      expect(
        constraintKeys(validate({ ...basePayload, redeemPoints: 1.5 })),
      ).toContain('isInt');
    });
  });

  describe('selectedOptions', () => {
    it('rejects an option missing optionId', () => {
      const errors = validate({
        ...basePayload,
        items: [
          {
            ...baseItem,
            selectedOptions: [
              { optionName: 'Size', choiceName: 'L', priceModifier: 1 },
            ],
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
              {
                optionId: 'o1',
                optionName: 'Size',
                choiceName: 'L',
                priceModifier: 1.5,
              },
            ],
          },
        ],
      });
      expect(errors).toHaveLength(0);
    });
  });

  describe('POS submission metadata', () => {
    it('accepts an explicit empty-session expectation with price snapshots', () => {
      const errors = validate({
        ...basePayload,
        source: 'POS',
        posSubmission: {
          clientOrderId: '018f8f2b-6a36-7e31-a17d-5a9452f31d91',
          restaurantId: 'rest-1',
          tableId: 'table-1',
          expectedTableSessionId: null,
        },
        items: [{ ...baseItem, expectedUnitPrice: 10 }],
      });

      expect(errors).toHaveLength(0);
    });

    it('rejects POS metadata that omits the session expectation', () => {
      const errors = validate({
        ...basePayload,
        source: 'POS',
        posSubmission: {
          clientOrderId: '018f8f2b-6a36-7e31-a17d-5a9452f31d91',
          restaurantId: 'rest-1',
          tableId: 'table-1',
        },
        items: [{ ...baseItem, expectedUnitPrice: 10 }],
      });

      expect(constraintKeys(errors)).toContain('isDefined');
    });
  });
});
