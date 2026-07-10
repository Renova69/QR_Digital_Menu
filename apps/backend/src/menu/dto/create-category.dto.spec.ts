import { ValidationPipe } from '@nestjs/common';
import { CreateCategoryDto } from './create-category.dto';

describe('CreateCategoryDto', () => {
  it('keeps printStationId through the whitelist validation boundary', async () => {
    const pipe = new ValidationPipe({ transform: true, whitelist: true });

    const result = (await pipe.transform(
      {
        name: 'Drinks',
        printStationId: 'station-1',
        stripped: 'value',
      },
      { type: 'body', metatype: CreateCategoryDto },
    )) as CreateCategoryDto & { stripped?: string };

    expect(result.printStationId).toBe('station-1');
    expect(result.stripped).toBeUndefined();
  });
});
