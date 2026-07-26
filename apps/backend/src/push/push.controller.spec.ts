import { Test, TestingModule } from '@nestjs/testing';
import { PushController } from './push.controller';
import { PushService } from './push.service';

describe('PushController', () => {
  let controller: PushController;
  let service: PushService;

  const mockPushService = {
    createSubscription: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [PushController],
      providers: [{ provide: PushService, useValue: mockPushService }],
    }).compile();

    controller = module.get<PushController>(PushController);
    service = module.get<PushService>(PushService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('subscribe', () => {
    it('should call pushService.createSubscription with userId and subscription body', async () => {
      const subscription = {
        endpoint: 'https://fcm.googleapis.com/fcm/send/test',
        keys: { p256dh: 'p256dh-key', auth: 'auth-key' },
      };
      const req = { user: { id: 'user-1' } };
      mockPushService.createSubscription.mockResolvedValue({ id: 'sub-1' });

      const result = await controller.subscribe(req, subscription);

      expect(mockPushService.createSubscription).toHaveBeenCalledWith(
        'user-1',
        subscription,
      );
      expect(result).toEqual({ id: 'sub-1' });
    });
  });
});
