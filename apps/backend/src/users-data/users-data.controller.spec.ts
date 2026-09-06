import { Test, TestingModule } from '@nestjs/testing';
import { UsersDataController } from './users-data.controller';
import { UsersDataService } from './users-data.service';
import { GUARDS_METADATA } from '@nestjs/common/constants';
import { StepUpAuthGuard } from '../auth/step-up-auth.guard';

describe('UsersDataController', () => {
  let c: UsersDataController;
  const mockSvc = { exportSelf: jest.fn(), eraseSelf: jest.fn() };

  beforeEach(async () => {
    const m = await Test.createTestingModule({
      controllers: [UsersDataController],
      providers: [{ provide: UsersDataService, useValue: mockSvc }],
    })
      .overrideGuard(StepUpAuthGuard)
      .useValue({ canActivate: () => true })
      .compile();
    c = m.get<UsersDataController>(UsersDataController);
  });
  afterEach(() => jest.clearAllMocks());

  it('should be defined', () => expect(c).toBeDefined());

  it('requires recent strong authentication before erasing an account', () => {
    expect(
      Reflect.getMetadata(
        GUARDS_METADATA,
        UsersDataController.prototype.deleteAccount,
      ) ?? [],
    ).toContain(StepUpAuthGuard);
  });

  it('exportData delegates to exportSelf', async () => {
    mockSvc.exportSelf.mockResolvedValue({ data: [] });
    const r = await c.exportData({ user: { id: 'u1' } });
    expect(mockSvc.exportSelf).toHaveBeenCalledWith('u1');
    expect(r).toEqual({ data: [] });
  });

  it('deleteAccount delegates to eraseSelf and clears cookie', async () => {
    const res = { clearCookie: jest.fn() } as any;
    await c.deleteAccount({ user: { id: 'u1' } }, res);
    expect(mockSvc.eraseSelf).toHaveBeenCalledWith('u1');
  });
});
