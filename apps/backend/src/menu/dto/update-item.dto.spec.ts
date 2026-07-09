import { validate } from 'class-validator';
import { UpdateItemDto } from './update-item.dto';

describe('UpdateItemDto', () => {
  it('should accept a valid tags array', async () => {
    const dto = new UpdateItemDto();
    dto.tags = ['MORNING', 'HOT_DRINK'];

    const errors = await validate(dto);

    // We expect no validation errors for the tags property
    const tagsError = errors.find((err) => err.property === 'tags');
    expect(tagsError).toBeUndefined();
  });
});
