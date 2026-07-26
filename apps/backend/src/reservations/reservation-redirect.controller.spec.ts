import { Test, TestingModule } from '@nestjs/testing';
import { ReservationRedirectController } from './reservation-redirect.controller';
import { ReservationsService } from './reservations.service';

describe('ReservationRedirectController', () => {
  let c: ReservationRedirectController;
  const mockSvc = { resolveManageRedirect: jest.fn() };

  beforeEach(async () => {
    const m = await Test.createTestingModule({
      controllers: [ReservationRedirectController],
      providers: [{ provide: ReservationsService, useValue: mockSvc }],
    }).compile();
    c = m.get<ReservationRedirectController>(ReservationRedirectController);
  });
  afterEach(() => jest.clearAllMocks());

  it('should be defined', () => expect(c).toBeDefined());

  it('redirects to resolved URL when found', async () => {
    mockSvc.resolveManageRedirect.mockResolvedValue(
      'https://app.example.com/booking/manage?r=r1&token=tok',
    );
    const res = { redirect: jest.fn() } as any;
    await c.redirect('tok', res);
    expect(res.redirect).toHaveBeenCalledWith(
      302,
      'https://app.example.com/booking/manage?r=r1&token=tok',
    );
  });

  it('redirects to fallback when resolve returns null', async () => {
    mockSvc.resolveManageRedirect.mockResolvedValue(null);
    const res = { redirect: jest.fn() } as any;
    await c.redirect('tok', res);
    expect(res.redirect).toHaveBeenCalledWith(
      302,
      expect.stringContaining('/booking'),
    );
  });
});
