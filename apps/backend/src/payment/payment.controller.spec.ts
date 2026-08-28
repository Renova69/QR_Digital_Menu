import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { FeatureGuard } from '../subscription/feature.guard';
import { PaymentController } from './payment.controller';
import { PaymentService } from './payment.service';
import { PrismaService } from '../prisma/prisma.service';

describe('PaymentController table-session credential transport (M-PAY-1)', () => {
  let app: INestApplication;
  const paymentService = {
    getSessionBill: jest.fn(),
  };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [PaymentController],
      providers: [
        { provide: PaymentService, useValue: paymentService },
        { provide: PrismaService, useValue: {} },
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(FeatureGuard)
      .useValue({ canActivate: () => true })
      .compile();

    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app?.close();
  });

  beforeEach(() => {
    jest.clearAllMocks();
    paymentService.getSessionBill.mockResolvedValue({ total: 12 });
  });

  it('accepts the fixed bill route via header and exposes no token path route', async () => {
    await request(app.getHttpServer())
      .get('/payments/session/bill?lang=bg')
      .set('X-Table-Session-Token', 'cm-session-secret')
      .expect(200, { total: 12 });

    expect(paymentService.getSessionBill).toHaveBeenCalledWith(
      'cm-session-secret',
      'bg',
    );

    await request(app.getHttpServer())
      .get('/payments/session/cm-session-secret/bill')
      .expect(404);
  });

  it('rejects a fixed route request without the session-token header', async () => {
    await request(app.getHttpServer())
      .get('/payments/session/bill')
      .expect(401);
    expect(paymentService.getSessionBill).not.toHaveBeenCalled();
  });
});
