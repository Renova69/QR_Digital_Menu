import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { UpdateItemDto } from './update-item.dto';

describe('UpdateItemDto', () => {
  it('should accept a valid tags array', async () => {
    const payload = {
      tags: ['MORNING', 'HOT_DRINK'],
    };
    const dto = plainToInstance(UpdateItemDto, payload);
    const errors = await validate(dto);

    // We expect no validation errors for the tags property
    const tagsError = errors.find((err) => err.property === 'tags');
    expect(tagsError).toBeUndefined();
  });

  it('should reject invalid tags (not an array)', async () => {
    const payload = {
      tags: 'MORNING', // invalid, should be array
    };
    const dto = plainToInstance(UpdateItemDto, payload);
    const errors = await validate(dto);
    
    const tagsError = errors.find((err) => err.property === 'tags');
    expect(tagsError).toBeDefined();
    expect(tagsError!.constraints).toHaveProperty('isArray');
  });

  it('should reject invalid tags (array of non-strings)', async () => {
    const payload = {
      tags: [123, 456], // invalid, should be strings
    };
    const dto = plainToInstance(UpdateItemDto, payload);
    const errors = await validate(dto);
    
    const tagsError = errors.find((err) => err.property === 'tags');
    expect(tagsError).toBeDefined();
    expect(tagsError!.constraints).toHaveProperty('isString');
  });
});
