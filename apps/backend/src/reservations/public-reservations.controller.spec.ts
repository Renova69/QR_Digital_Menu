import { Test, TestingModule } from '@nestjs/testing';
import { PublicReservationsController } from './public-reservations.controller';
import { ReservationsService } from './reservations.service';

describe('PublicReservationsController', () => {
  let c: PublicReservationsController;
  const mockSvc = {
    getPublicConfig: jest.fn(),
    getPublicAvailability: jest.fn(),
    createPublic: jest.fn(),
    getPublicStatus: jest.fn(),
    getByManageToken: jest.fn(),
    cancelByManageToken: jest.fn(),
    modifyByManageToken: jest.fn(),
  };

  beforeEach(async () => {
    const m = await Test.createTestingModule({
      controllers: [PublicReservationsController],
      providers: [{ provide: ReservationsService, useValue: mockSvc }],
    }).compile();
    c = m.get<PublicReservationsController>(PublicReservationsController);
  });
  afterEach(() => jest.clearAllMocks());

  it('should be defined', () => expect(c).toBeDefined());

  it('config delegates to getPublicConfig', async () => {
    mockSvc.getPublicConfig.mockResolvedValue({ enabled: true });
    expect(await c.config('r1')).toEqual({ enabled: true });
    expect(mockSvc.getPublicConfig).toHaveBeenCalledWith('r1');
  });

  it('availability delegates to getPublicAvailability', async () => {
    mockSvc.getPublicAvailability.mockResolvedValue([]);
    const r = await c.availability('r1', {
      date: '2026-08-01',
      adults: 2,
    } as any);
    expect(mockSvc.getPublicAvailability).toHaveBeenCalledWith(
      'r1',
      '2026-08-01',
      2,
      0,
    );
    expect(r).toEqual([]);
  });

  it('create delegates to createPublic', async () => {
    const dto = { name: 'Test', date: '2026-08-01' } as any;
    mockSvc.createPublic.mockResolvedValue({ id: 'res-1' });
    expect(await c.create('r1', dto)).toEqual({ id: 'res-1' });
    expect(mockSvc.createPublic).toHaveBeenCalledWith('r1', dto);
  });

  it('status delegates to getPublicStatus', async () => {
    mockSvc.getPublicStatus.mockResolvedValue({ status: 'CONFIRMED' });
    expect(await c.status('r1', 'ABC123')).toEqual({ status: 'CONFIRMED' });
    expect(mockSvc.getPublicStatus).toHaveBeenCalledWith('r1', 'ABC123');
  });

  it('manageGet delegates to getByManageToken', async () => {
    mockSvc.getByManageToken.mockResolvedValue({ id: 'res-1' });
    expect(await c.manageGet('r1', 'tok')).toEqual({ id: 'res-1' });
    expect(mockSvc.getByManageToken).toHaveBeenCalledWith('r1', 'tok');
  });

  it('manageCancel delegates to cancelByManageToken', async () => {
    mockSvc.cancelByManageToken.mockResolvedValue({ cancelled: true });
    expect(await c.manageCancel('r1', 'tok')).toEqual({ cancelled: true });
    expect(mockSvc.cancelByManageToken).toHaveBeenCalledWith('r1', 'tok');
  });

  it('manageModify delegates to modifyByManageToken', async () => {
    const dto = { date: '2026-08-02' } as any;
    mockSvc.modifyByManageToken.mockResolvedValue({ id: 'res-1' });
    expect(await c.manageModify('r1', 'tok', dto)).toEqual({ id: 'res-1' });
    expect(mockSvc.modifyByManageToken).toHaveBeenCalledWith('r1', 'tok', dto);
  });
});
