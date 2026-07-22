import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { CreateItemDto, Currency } from './create-item.dto';

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
