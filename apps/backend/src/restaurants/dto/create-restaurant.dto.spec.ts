import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CreateRestaurantDto } from './create-restaurant.dto';

describe('CreateRestaurantDto slug', () => {
  it('accepts an optional valid owner-edited slug', async () => {
    const dto = plainToInstance(CreateRestaurantDto, {
      name: 'New Place',
      slug: 'owners-choice',
    });

    await expect(validate(dto)).resolves.toHaveLength(0);
  });

  it.each(['A', 'Upper-Case', '12345', 'xn--fake', 'admin'])(
    'rejects invalid onboarding slug %s at the DTO boundary',
    async (slug) => {
      const dto = plainToInstance(CreateRestaurantDto, {
        name: 'New Place',
        slug,
      });

      expect(await validate(dto)).not.toHaveLength(0);
    },
  );
});
