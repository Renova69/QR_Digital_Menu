import { validate } from 'class-validator';
import { CreateItemDto, Currency } from './create-item.dto';

describe('CreateItemDto', () => {
  it('should accept a valid tags array', async () => {
    const dto = new CreateItemDto();
    dto.name = 'Test Item';
    dto.price = 10;
    dto.currency = Currency.EUR;
    dto.tags = ['MORNING', 'HOT_DRINK'];

    const errors = await validate(dto);

    // We expect no validation errors for the tags property
    const tagsError = errors.find((err) => err.property === 'tags');
    expect(tagsError).toBeUndefined();
  });
});
