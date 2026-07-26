import { Test, TestingModule } from '@nestjs/testing';
import { PlatformSettingsController } from './platform-settings.controller';
import { PlatformSettingsService } from './platform-settings.service';

describe('PlatformSettingsController', () => {
  let c: PlatformSettingsController;
  const mockSvc = {
    getSettings: jest.fn(),
    getPublicPayload: jest.fn(),
    updateSettings: jest.fn(),
  };

  beforeEach(async () => {
    const m = await Test.createTestingModule({
      controllers: [PlatformSettingsController],
      providers: [{ provide: PlatformSettingsService, useValue: mockSvc }],
    }).compile();
    c = m.get<PlatformSettingsController>(PlatformSettingsController);
  });
  afterEach(() => jest.clearAllMocks());

  it('getPublic returns public payload', async () => {
    const settings = { gdprEnabled: true };
    mockSvc.getSettings.mockResolvedValue(settings);
    mockSvc.getPublicPayload.mockReturnValue({ gdprEnabled: true });

    const r = await c.getPublic();

    expect(mockSvc.getSettings).toHaveBeenCalled();
    expect(mockSvc.getPublicPayload).toHaveBeenCalledWith(settings);
    expect(r).toEqual({ gdprEnabled: true });
  });

  it('getAdmin returns full settings for super-admin', async () => {
    mockSvc.getSettings.mockResolvedValue({ id: 'singleton' });

    const r = await c.getAdmin();

    expect(mockSvc.getSettings).toHaveBeenCalled();
    expect(r).toEqual({ id: 'singleton' });
  });

  it('updateAdmin calls updateSettings with dto and userId', async () => {
    const dto = { gdprEnabled: false } as any;
    mockSvc.updateSettings.mockResolvedValue({ id: 'singleton' });

    const r = await c.updateAdmin(dto, { user: { id: 'u1' } });

    expect(mockSvc.updateSettings).toHaveBeenCalledWith(dto, 'u1');
    expect(r).toEqual({ id: 'singleton' });
  });
});
