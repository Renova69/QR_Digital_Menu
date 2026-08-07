import 'reflect-metadata';
import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { FeedbackListQueryDto } from './feedback-list-query.dto';

// main.ts registers the global ValidationPipe with these options, so any DTO
// reached through a whole-object `@Query()` is validated under them. Validating
// with the defaults here would hide whitelist violations entirely -- the bug
// this suite exists to catch only reproduces with forbidNonWhitelisted on.
const PIPE_OPTIONS = { whitelist: true, forbidNonWhitelisted: true };

describe('FeedbackListQueryDto', () => {
  it('accepts restaurantId, which the dashboard sends on every feedback list request', async () => {
    // Regression: GET /api/v1/feedback?restaurantId=...&page=1&limit=3 returned
    // 400 "property restaurantId should not exist". The controller read the id
    // via @Query('restaurantId') but ALSO bound the whole query object to this
    // DTO, so forbidNonWhitelisted rejected the very param the handler needed.
    const dto = plainToInstance(FeedbackListQueryDto, {
      restaurantId: 'cmoye3zem00020z6glgbzf2kx',
      page: '1',
      limit: '3',
    });

    const errors = await validate(dto, PIPE_OPTIONS);

    expect(errors).toHaveLength(0);
    expect(dto.restaurantId).toBe('cmoye3zem00020z6glgbzf2kx');
  });

  it('requires restaurantId', async () => {
    const dto = plainToInstance(FeedbackListQueryDto, { page: '1' });

    const errors = await validate(dto, PIPE_OPTIONS);

    expect(errors.map((e) => e.property)).toContain('restaurantId');
  });

  it('rejects an overlong restaurantId', async () => {
    const dto = plainToInstance(FeedbackListQueryDto, {
      restaurantId: 'x'.repeat(129),
    });

    const errors = await validate(dto, PIPE_OPTIONS);

    const restaurantIdError = errors.find((e) => e.property === 'restaurantId');
    expect(restaurantIdError?.constraints).toHaveProperty('maxLength');
  });

  it('still rejects genuinely unknown query params', async () => {
    // Guards against "fixing" the bug by loosening the whitelist wholesale.
    const dto = plainToInstance(FeedbackListQueryDto, {
      restaurantId: 'cmoye3zem00020z6glgbzf2kx',
      bogusParam: 'nope',
    });

    const errors = await validate(dto, PIPE_OPTIONS);

    expect(errors.map((e) => e.property)).toContain('bogusParam');
  });

  it('accepts the existing optional filters alongside restaurantId', async () => {
    const dto = plainToInstance(FeedbackListQueryDto, {
      restaurantId: 'cmoye3zem00020z6glgbzf2kx',
      rating: '4',
      hasComment: 'true',
      startDate: '2026-01-01',
      endDate: '2026-01-31',
      sort: 'NEWEST',
    });

    const errors = await validate(dto, PIPE_OPTIONS);

    expect(errors).toHaveLength(0);
    expect(dto.rating).toBe(4);
    expect(dto.hasComment).toBe(true);
    expect(dto.sort).toBe('NEWEST');
  });
});
