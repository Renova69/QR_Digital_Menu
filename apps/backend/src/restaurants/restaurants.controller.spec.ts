import { Test, TestingModule } from '@nestjs/testing';
import { Reflector } from '@nestjs/core';
import { BadRequestException } from '@nestjs/common';
import { RestaurantsController } from './restaurants.controller';
import { RestaurantsService } from './restaurants.service';
import { StorageService } from '../storage/storage.service';
import { DeviceEnrollmentService } from './device-enrollment.service';
import { FeatureService } from '../subscription/feature.service';
import { PrismaService } from '../prisma/prisma.service';

describe('RestaurantsController', () => {
  let controller: RestaurantsController;
  let service: RestaurantsService;
  let storage: StorageService;
  let enrollment: DeviceEnrollmentService;

  const mockRestaurantsService = {
    create: jest.fn(),
    findAll: jest.fn(),
    findOneOrStaff: jest.fn(),
    update: jest.fn(),
    remove: jest.fn(),
    findOneForManagement: jest.fn(),
    enqueueTranslateAll: jest.fn(),
    getTranslationStatus: jest.fn(),
    generateConnectLink: jest.fn(),
    getLogoBase64: jest.fn(),
    getStripeStatus: jest.fn(),
    disconnectStripe: jest.fn(),
  };

  const mockStorageService = {
    uploadWithThumbnail: jest.fn(),
    delete: jest.fn(),
  };

  const mockDeviceEnrollment = {
    createEnrollment: jest.fn(),
    listEnrollments: jest.fn(),
    revokeEnrollment: jest.fn(),
  };

  const mockFeatureService = { hasFeature: jest.fn() };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [RestaurantsController],
      providers: [
        { provide: RestaurantsService, useValue: mockRestaurantsService },
        { provide: StorageService, useValue: mockStorageService },
        { provide: DeviceEnrollmentService, useValue: mockDeviceEnrollment },
        { provide: FeatureService, useValue: mockFeatureService },
        { provide: PrismaService, useValue: {} },
        { provide: Reflector, useValue: { get: jest.fn() } },
      ],
    }).compile();

    controller = module.get<RestaurantsController>(RestaurantsController);
    service = module.get<RestaurantsService>(RestaurantsService);
    storage = module.get<StorageService>(StorageService);
    enrollment = module.get<DeviceEnrollmentService>(DeviceEnrollmentService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('create', () => {
    it('should call restaurantsService.create with dto and userId', async () => {
      const dto = { name: 'New Restaurant' } as any;
      const req = { user: { id: 'user-1' } };
      mockRestaurantsService.create.mockResolvedValue({ id: 'rest-1' });

      const result = await controller.create(dto, req);

      expect(mockRestaurantsService.create).toHaveBeenCalledWith(dto, 'user-1');
      expect(result).toEqual({ id: 'rest-1' });
    });
  });

  describe('findAll', () => {
    it('should call restaurantsService.findAll with userId', async () => {
      const req = { user: { id: 'user-1' } };
      mockRestaurantsService.findAll.mockResolvedValue([]);

      const result = await controller.findAll(req);

      expect(mockRestaurantsService.findAll).toHaveBeenCalledWith('user-1');
      expect(result).toEqual([]);
    });
  });

  describe('findOne', () => {
    it('should call restaurantsService.findOneOrStaff with id and userId', async () => {
      const req = { user: { id: 'user-1' } };
      mockRestaurantsService.findOneOrStaff.mockResolvedValue({
        id: 'rest-1',
        name: 'Test',
      });

      const result = await controller.findOne('rest-1', req);

      expect(mockRestaurantsService.findOneOrStaff).toHaveBeenCalledWith(
        'rest-1',
        'user-1',
      );
      expect(result).toEqual({ id: 'rest-1', name: 'Test' });
    });
  });

  describe('update', () => {
    it('should call restaurantsService.update with id, dto, and userId', async () => {
      const dto = { name: 'Updated' } as any;
      const req = { user: { id: 'user-1' } };
      mockRestaurantsService.update.mockResolvedValue({ id: 'rest-1', ...dto });

      const result = await controller.update('rest-1', dto, req);

      expect(mockRestaurantsService.update).toHaveBeenCalledWith(
        'rest-1',
        dto,
        'user-1',
      );
      expect(result).toEqual({ id: 'rest-1', name: 'Updated' });
    });
  });

  describe('remove', () => {
    it('should call restaurantsService.remove with id and userId', async () => {
      const req = { user: { id: 'user-1' } };
      mockRestaurantsService.remove.mockResolvedValue({ deleted: true });

      const result = await controller.remove('rest-1', req);

      expect(mockRestaurantsService.remove).toHaveBeenCalledWith(
        'rest-1',
        'user-1',
      );
      expect(result).toEqual({ deleted: true });
    });
  });

  describe('uploadLogo', () => {
    it('should throw BadRequestException when no file provided', async () => {
      await expect(
        controller.uploadLogo('rest-1', undefined as any, {
          user: { id: 'user-1' },
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should upload logo after verifying ownership', async () => {
      const file = {
        buffer: Buffer.from('fake-image'),
        originalname: 'logo.png',
        mimetype: 'image/png',
      } as Express.Multer.File;
      const req = { user: { id: 'user-1' } };
      mockRestaurantsService.findOneForManagement.mockResolvedValue({
        id: 'rest-1',
      });
      mockStorageService.uploadWithThumbnail.mockResolvedValue({
        url: 'https://r2.example.com/logo.webp',
        thumbnailUrl: 'https://r2.example.com/logo-thumb.webp',
      });

      const result = await controller.uploadLogo('rest-1', file, req);

      expect(mockRestaurantsService.findOneForManagement).toHaveBeenCalledWith(
        'rest-1',
        'user-1',
      );
      expect(storage.uploadWithThumbnail).toHaveBeenCalledWith(
        file.buffer,
        file.originalname,
        file.mimetype,
      );
      expect(result).toEqual({
        logoUrl: 'https://r2.example.com/logo.webp',
        logoThumbnailUrl: 'https://r2.example.com/logo-thumb.webp',
      });
    });
  });

  describe('createDeviceEnrollment', () => {
    it('should call deviceEnrollment.createEnrollment', async () => {
      const dto = {} as any;
      const req = { user: { id: 'user-1' } };
      process.env.FRONTEND_URL = 'https://app.example.com';
      mockDeviceEnrollment.createEnrollment.mockResolvedValue({
        token: 'tok-1',
      });

      const result = await controller.createDeviceEnrollment(
        'rest-1',
        dto,
        req,
      );

      expect(mockDeviceEnrollment.createEnrollment).toHaveBeenCalledWith(
        'rest-1',
        'user-1',
        'https://app.example.com',
      );
      expect(result).toEqual({ token: 'tok-1' });
      delete process.env.FRONTEND_URL;
    });
  });

  describe('translateAll', () => {
    it('should call restaurantsService.enqueueTranslateAll', async () => {
      const req = { user: { id: 'user-1' } };
      mockRestaurantsService.enqueueTranslateAll.mockResolvedValue({
        jobId: 'job-1',
      });

      const result = await controller.translateAll('rest-1', req);

      expect(mockRestaurantsService.enqueueTranslateAll).toHaveBeenCalledWith(
        'rest-1',
        'user-1',
      );
      expect(result).toEqual({ jobId: 'job-1' });
    });
  });

  describe('generateConnectLink', () => {
    it('should call restaurantsService.generateConnectLink', async () => {
      const req = { user: { id: 'user-1' } };
      mockRestaurantsService.generateConnectLink.mockResolvedValue({
        url: 'https://connect.stripe.com/...',
      });

      const result = await controller.generateConnectLink('rest-1', req);

      expect(mockRestaurantsService.generateConnectLink).toHaveBeenCalledWith(
        'rest-1',
        'user-1',
        undefined,
        undefined,
      );
      expect(result).toEqual({ url: 'https://connect.stripe.com/...' });
    });
  });

  describe('getStripeStatus', () => {
    it('should call restaurantsService.getStripeStatus', async () => {
      const req = { user: { id: 'user-1' } };
      mockRestaurantsService.getStripeStatus.mockResolvedValue({
        connected: true,
      });

      const result = await controller.getStripeStatus('rest-1', req);

      expect(mockRestaurantsService.getStripeStatus).toHaveBeenCalledWith(
        'rest-1',
        'user-1',
      );
      expect(result).toEqual({ connected: true });
    });
  });
});
