import { validate, validateSync } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { CreateItemDto, Currency } from './create-item.dto';

/**
 * Mirrors the GLOBAL pipe config in main.ts exactly (whitelist +
 * forbidNonWhitelisted). The `forbidNonWhitelisted` flag is what turns an
 * undeclared property into a hard 400 instead of silently stripping it.
 */
function validateWhitelisted(payload: Record<string, unknown>) {
  return validateSync(plainToInstance(CreateItemDto, payload), {
    whitelist: true,
    forbidNonWhitelisted: true,
  });
}

describe('CreateItemDto whitelist enforcement', () => {
  /** The exact shape CreateItemForm -> MenuContext builds for a new item. */
  const basePayload = {
    name: 'Burger',
    description: 'Beef patty',
    price: 12.5,
    currency: Currency.EUR,
    allergens: ['gluten'],
    dietaryTags: [],
    isFeatured: false,
    upsellContexts: [],
    relatedItemIds: [],
    rewardPointsMode: 'OFF',
  };

  it('accepts the payload the create-item form actually sends', () => {
    expect(validateWhitelisted(basePayload)).toHaveLength(0);
  });

  // Regression: useMenu.ts forwarded its whole mutation variable — including
  // the `categoryId` that belongs in the URL — as the request body. categoryId
  // is a @Param, never a body field, so forbidNonWhitelisted rejected every
  // item creation with "property categoryId should not exist".
  it('rejects categoryId in the body (it is a URL param, not a body field)', () => {
    const errors = validateWhitelisted({ ...basePayload, categoryId: 'cat-1' });

    expect(errors).toHaveLength(1);
    expect(errors[0].property).toBe('categoryId');
    expect(errors[0].constraints).toHaveProperty('whitelistValidation');
  });
});

describe('CreateItemDto', () => {
  it('should accept a valid tags array', async () => {
    const payload = {
      name: 'Test Item',
      price: 10,
      currency: Currency.EUR,
      tags: ['MORNING', 'HOT_DRINK'],
    };
    const dto = plainToInstance(CreateItemDto, payload);
    const errors = await validate(dto);

    // We expect no validation errors for the tags property
    const tagsError = errors.find((err) => err.property === 'tags');
    expect(tagsError).toBeUndefined();
  });

  it('should reject invalid tags (not an array)', async () => {
    const payload = {
      name: 'Test Item',
      price: 10,
      currency: Currency.EUR,
      tags: 'MORNING', // invalid, should be array
    };
    const dto = plainToInstance(CreateItemDto, payload);
    const errors = await validate(dto);

    const tagsError = errors.find((err) => err.property === 'tags');
    expect(tagsError).toBeDefined();
    expect(tagsError!.constraints).toHaveProperty('isArray');
  });

  it('should reject invalid tags (array of non-strings)', async () => {
    const payload = {
      name: 'Test Item',
      price: 10,
      currency: Currency.EUR,
      tags: [123, 456], // invalid, should be strings
    };
    const dto = plainToInstance(CreateItemDto, payload);
    const errors = await validate(dto);

    const tagsError = errors.find((err) => err.property === 'tags');
    expect(tagsError).toBeDefined();
    expect(tagsError!.constraints).toHaveProperty('isString');
  });

  it('should reject more than 15 tags', async () => {
    const payload = {
      name: 'Test Item',
      price: 10,
      currency: Currency.EUR,
      tags: Array.from({ length: 16 }, (_, i) => `TAG_${i}`),
    };
    const dto = plainToInstance(CreateItemDto, payload);
    const errors = await validate(dto);

    const tagsError = errors.find((err) => err.property === 'tags');
    expect(tagsError).toBeDefined();
    expect(tagsError!.constraints).toHaveProperty('arrayMaxSize');
  });

  it('should reject a tag longer than 50 characters', async () => {
    const payload = {
      name: 'Test Item',
      price: 10,
      currency: Currency.EUR,
      tags: ['A'.repeat(51)],
    };
    const dto = plainToInstance(CreateItemDto, payload);
    const errors = await validate(dto);

    const tagsError = errors.find((err) => err.property === 'tags');
    expect(tagsError).toBeDefined();
    expect(tagsError!.constraints).toHaveProperty('maxLength');
  });

  it('accepts only recognized, unique upsell contexts', async () => {
    const valid = plainToInstance(CreateItemDto, {
      name: 'Test Item',
      price: 10,
      currency: Currency.EUR,
      upsellContexts: ['MORNING', 'COLD'],
    });
    const invalid = plainToInstance(CreateItemDto, {
      name: 'Test Item',
      price: 10,
      currency: Currency.EUR,
      upsellContexts: ['MORNING', 'MORNING', 'HOT_DRINK'],
    });

    expect(
      (await validate(valid)).find(
        (error) => error.property === 'upsellContexts',
      ),
    ).toBeUndefined();
    expect(
      (await validate(invalid)).find(
        (error) => error.property === 'upsellContexts',
      ),
    ).toBeDefined();
  });

  it('accepts a bounded menu-item weight and rejects oversized values', async () => {
    const valid = plainToInstance(CreateItemDto, {
      name: 'Test Item',
      price: 10,
      currency: Currency.EUR,
      weight: '350 g',
    });
    const invalid = plainToInstance(CreateItemDto, {
      name: 'Test Item',
      price: 10,
      currency: Currency.EUR,
      weight: 'g'.repeat(101),
    });

    expect(
      (await validate(valid)).find((error) => error.property === 'weight'),
    ).toBeUndefined();
    expect(
      (await validate(invalid)).find((error) => error.property === 'weight'),
    ).toBeDefined();
  });
});
