import { Test, TestingModule } from '@nestjs/testing';
import { ConsentController } from './consent.controller';
import { ConsentService } from './consent.service';

describe('ConsentController', () => {
  let controller: ConsentController;

  const mockConsentService = {
    recordConsent: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [ConsentController],
      providers: [{ provide: ConsentService, useValue: mockConsentService }],
    }).compile();

    controller = module.get<ConsentController>(ConsentController);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('recordConsent', () => {
    it('delegates to consentService.recordConsent with body fields and request ip', async () => {
      const body = {
        restaurantId: 'rest-1',
        visitorId: 'visitor-123',
        category: 'MARKETING' as const,
        granted: true,
        policyVersion: 2,
      };
      mockConsentService.recordConsent.mockResolvedValue(undefined);

      await controller.recordConsent(body, { ip: '1.2.3.4' });

      expect(mockConsentService.recordConsent).toHaveBeenCalledWith(
        {
          restaurantId: 'rest-1',
          visitorId: 'visitor-123',
          category: 'MARKETING',
          granted: true,
          policyVersion: 2,
        },
        '1.2.3.4',
      );
    });

    it('passes through an undefined restaurantId for platform-scoped consent', async () => {
      const body = {
        visitorId: 'visitor-456',
        category: 'ANALYTICS' as const,
        granted: false,
        policyVersion: 1,
      };
      mockConsentService.recordConsent.mockResolvedValue(undefined);

      await controller.recordConsent(body, { ip: '5.6.7.8' });

      expect(mockConsentService.recordConsent).toHaveBeenCalledWith(
        {
          restaurantId: undefined,
          visitorId: 'visitor-456',
          category: 'ANALYTICS',
          granted: false,
          policyVersion: 1,
        },
        '5.6.7.8',
      );
    });
  });
});
