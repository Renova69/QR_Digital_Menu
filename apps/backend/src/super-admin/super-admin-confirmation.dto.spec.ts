import 'reflect-metadata';
import { validate } from 'class-validator';
import { SuperAdminConfirmationDto } from './dto/update-tenant.dto';

describe('SuperAdminConfirmationDto', () => {
  it.each([undefined, '', 'confirm', 'CONFIRM '])(
    'rejects privileged action confirmation %p',
    async (confirmation) => {
      const dto = Object.assign(new SuperAdminConfirmationDto(), {
        confirmation,
      });

      await expect(validate(dto)).resolves.not.toHaveLength(0);
    },
  );

  it('accepts the exact confirmation token', async () => {
    const dto = Object.assign(new SuperAdminConfirmationDto(), {
      confirmation: 'CONFIRM',
    });

    await expect(validate(dto)).resolves.toHaveLength(0);
  });
});
