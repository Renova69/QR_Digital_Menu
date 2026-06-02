import 'reflect-metadata';
import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { PaymentHistoryQueryDto } from './payment-history-query.dto';

describe('PaymentHistoryQueryDto', () => {
  it('should default page to 1 and limit to 50', async () => {
    const dto = plainToInstance(PaymentHistoryQueryDto, {});
    const errors = await validate(dto);
    expect(errors).toHaveLength(0);
    expect(dto.page).toBe(1);
    expect(dto.limit).toBe(50);
  });

  it('should accept optional filter fields', async () => {
    const dto = plainToInstance(PaymentHistoryQueryDto, {
      page: 2,
      limit: 20,
      status: 'SUCCEEDED',
    });
    const errors = await validate(dto);
    expect(errors).toHaveLength(0);
    expect(dto.status).toBe('SUCCEEDED');
  });

  it('should reject a status value outside the allowed enum (#I1)', async () => {
    const dto = plainToInstance(PaymentHistoryQueryDto, { status: 'BOGUS' });
    const errors = await validate(dto);
    expect(errors).toHaveLength(1);
    expect(errors[0].property).toBe('status');
    expect(errors[0].constraints).toHaveProperty('isIn');
  });

  it('should accept each valid status enum value (#I1)', async () => {
    for (const status of ['PENDING', 'SUCCEEDED', 'FAILED', 'REFUNDED']) {
      const dto = plainToInstance(PaymentHistoryQueryDto, { status });
      const errors = await validate(dto);
      expect(errors).toHaveLength(0);
    }
  });

  it('should accept optional startDate and endDate query params', async () => {
    const dto = plainToInstance(PaymentHistoryQueryDto, {
      startDate: '2026-01-01',
      endDate: '2026-01-31',
    });
    const errors = await validate(dto);
    expect(errors).toHaveLength(0);
    expect(dto.startDate).toBe('2026-01-01');
    expect(dto.endDate).toBe('2026-01-31');
  });
});
