import { Test, TestingModule } from '@nestjs/testing';
import { DeviceEnrollmentController } from './device-enrollment.controller';
import { DeviceEnrollmentService } from './device-enrollment.service';
import { VerifyDeviceEnrollmentDto } from './dto/verify-device-enrollment.dto';

describe('DeviceEnrollmentController', () => {
  let controller: DeviceEnrollmentController;
  const mockSvc = { verifyEnrollment: jest.fn(), getDeviceStatus: jest.fn() };

  beforeEach(async () => {
    const m = await Test.createTestingModule({
      controllers: [DeviceEnrollmentController],
      providers: [{ provide: DeviceEnrollmentService, useValue: mockSvc }],
    }).compile();
    controller = m.get<DeviceEnrollmentController>(DeviceEnrollmentController);
  });
  afterEach(() => jest.clearAllMocks());

  it('should be defined', () => expect(controller).toBeDefined());

  it('verify delegates to deviceEnrollment.verifyEnrollment', async () => {
    const dto: VerifyDeviceEnrollmentDto = { token: 'tok-1' };
    mockSvc.verifyEnrollment.mockResolvedValue({ deviceId: 'd1' });
    const r = await controller.verify(dto);
    expect(mockSvc.verifyEnrollment).toHaveBeenCalledWith('tok-1');
    expect(r).toEqual({ deviceId: 'd1' });
  });

  it('status delegates to deviceEnrollment.getDeviceStatus', async () => {
    const dto: VerifyDeviceEnrollmentDto = { token: 'tok-1' };
    mockSvc.getDeviceStatus.mockResolvedValue({ valid: true });
    const r = await controller.status(dto);
    expect(mockSvc.getDeviceStatus).toHaveBeenCalledWith('tok-1');
    expect(r).toEqual({ valid: true });
  });
});
