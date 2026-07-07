import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { SetServiceHoursDto } from './reservation-settings.dto';

describe('SetServiceHoursDto', () => {
  it('validates every nested service-hours row', async () => {
    const dto = plainToInstance(SetServiceHoursDto, {
      rows: [{ weekday: 8, openMinute: -1, lastSlotMinute: 2000 }],
    });

    const errors = await validate(dto);

    expect(errors).toHaveLength(1);
    expect(errors[0].property).toBe('rows');
    expect(errors[0].children?.[0].children).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ property: 'weekday' }),
        expect.objectContaining({ property: 'openMinute' }),
        expect.objectContaining({ property: 'lastSlotMinute' }),
      ]),
    );
  });

  it('rejects duplicate weekdays in one replacement payload', async () => {
    const dto = plainToInstance(SetServiceHoursDto, {
      rows: [
        { weekday: 1, openMinute: 600, lastSlotMinute: 900 },
        { weekday: 1, openMinute: 1080, lastSlotMinute: 1260 },
      ],
    });

    const errors = await validate(dto);

    expect(errors).toEqual([
      expect.objectContaining({
        property: 'rows',
        constraints: expect.objectContaining({
          arrayUnique: expect.any(String),
        }),
      }),
    ]);
  });

  it('rejects a null row as validation data instead of throwing', async () => {
    const dto = plainToInstance(SetServiceHoursDto, { rows: [null] });

    await expect(validate(dto)).resolves.toEqual([
      expect.objectContaining({ property: 'rows' }),
    ]);
  });
});
