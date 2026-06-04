import { Test, TestingModule } from '@nestjs/testing';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { FeedbackService } from './feedback.service';
import { PrismaService } from '../prisma/prisma.service';

const mockPrisma = {
  feedback: {
    findUnique: jest.fn(),
    create: jest.fn(),
    findMany: jest.fn(),
    count: jest.fn(),
  },
  order: {
    findUnique: jest.fn(),
  },
  restaurant: {
    findUnique: jest.fn(),
  },
  user: {
    findUnique: jest.fn(),
  },
};

describe('FeedbackService', () => {
  let service: FeedbackService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        FeedbackService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    service = module.get<FeedbackService>(FeedbackService);
    jest.clearAllMocks();
  });

  describe('create', () => {
    const dto = {
      orderId: 'order-1',
      restaurantId: 'rest-1',
      rating: 5,
      comment: 'Great!',
    };

    it('creates feedback when no existing entry and order exists', async () => {
      mockPrisma.feedback.findUnique.mockResolvedValue(null);
      mockPrisma.order.findUnique.mockResolvedValue({
        id: 'order-1',
        restaurantId: 'rest-1',
      });
      mockPrisma.feedback.create.mockResolvedValue({ id: 'fb-1', ...dto });

      const result = await service.create(dto);

      expect(result).toHaveProperty('id', 'fb-1');
      expect(mockPrisma.feedback.create).toHaveBeenCalledWith({
        data: {
          rating: dto.rating,
          comment: dto.comment,
          redirectedToGoogle: false,
          orderId: dto.orderId,
          restaurantId: dto.restaurantId,
        },
      });
    });

    it('throws ConflictException when feedback already exists for order', async () => {
      mockPrisma.feedback.findUnique.mockResolvedValue({ id: 'existing' });

      await expect(service.create(dto)).rejects.toThrow(ConflictException);
      expect(mockPrisma.order.findUnique).not.toHaveBeenCalled();
    });

    it('throws NotFoundException when order not found', async () => {
      mockPrisma.feedback.findUnique.mockResolvedValue(null);
      mockPrisma.order.findUnique.mockResolvedValue(null);

      await expect(service.create(dto)).rejects.toThrow(NotFoundException);
    });

    it('passes redirectedToGoogle when provided', async () => {
      const dtoWithRedirect = { ...dto, redirectedToGoogle: true };
      mockPrisma.feedback.findUnique.mockResolvedValue(null);
      mockPrisma.order.findUnique.mockResolvedValue({
        id: 'order-1',
        restaurantId: 'rest-1',
      });
      mockPrisma.feedback.create.mockResolvedValue({ id: 'fb-2' });

      await service.create(dtoWithRedirect);

      expect(mockPrisma.feedback.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ redirectedToGoogle: true }),
        }),
      );
    });

    it('rejects a restaurantId that does not match the order', async () => {
      mockPrisma.feedback.findUnique.mockResolvedValue(null);
      mockPrisma.order.findUnique.mockResolvedValue({
        id: 'order-1',
        restaurantId: 'rest-1',
      });

      await expect(
        service.create({ ...dto, restaurantId: 'rest-2' }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('getGoogleReviewUrl', () => {
    it('returns googleReviewUrl and name for existing restaurant', async () => {
      mockPrisma.restaurant.findUnique.mockResolvedValue({
        googleReviewUrl: 'https://g.co/review/abc',
        name: 'My Restaurant',
      });

      const result = await service.getGoogleReviewUrl('rest-1');

      expect(result.googleReviewUrl).toBe('https://g.co/review/abc');
      expect(result.name).toBe('My Restaurant');
    });

    it('throws NotFoundException when restaurant not found', async () => {
      mockPrisma.restaurant.findUnique.mockResolvedValue(null);

      await expect(service.getGoogleReviewUrl('bad-id')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('findAll', () => {
    beforeEach(() => {
      mockPrisma.restaurant.findUnique.mockResolvedValue({
        ownerId: 'owner-1',
      });
      mockPrisma.user.findUnique.mockResolvedValue({ restaurantId: null });
      mockPrisma.feedback.findMany.mockResolvedValue([{ id: 'fb-1' }]);
      mockPrisma.feedback.count.mockResolvedValue(1);
    });

    it('returns paginated data with total and totalPages', async () => {
      const result = await service.findAll(
        'rest-1',
        { page: 1, limit: 10 },
        'owner-1',
      );

      expect(result.data).toHaveLength(1);
      expect(result.total).toBe(1);
      expect(result.page).toBe(1);
      expect(result.totalPages).toBe(1);
    });

    it('uses default page/limit for undefined pagination', async () => {
      const result = await service.findAll('rest-1', {}, 'owner-1');

      expect(result.page).toBe(1);
      expect(result).toHaveProperty('totalPages');
    });

    it('throws ForbiddenException for another restaurant', async () => {
      mockPrisma.restaurant.findUnique.mockResolvedValue({
        ownerId: 'owner-1',
      });
      mockPrisma.user.findUnique.mockResolvedValue({ restaurantId: 'rest-2' });

      await expect(
        service.findAll('rest-1', { page: 1, limit: 10 }, 'staff-2'),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe('getSummary', () => {
    beforeEach(() => {
      mockPrisma.restaurant.findUnique.mockResolvedValue({
        ownerId: 'owner-1',
      });
      mockPrisma.user.findUnique.mockResolvedValue({ restaurantId: null });
    });

    it('returns zero stats when no feedback exists', async () => {
      mockPrisma.feedback.findMany.mockResolvedValue([]);

      const result = await service.getSummary('rest-1', 'owner-1');

      expect(result.totalFeedbacks).toBe(0);
      expect(result.averageRating).toBe(0);
      expect(result.googleRedirects).toBe(0);
      expect(result.positiveRate).toBe(0);
    });

    it('calculates correct average rating', async () => {
      mockPrisma.feedback.findMany.mockResolvedValue([
        { rating: 4, redirectedToGoogle: false },
        { rating: 5, redirectedToGoogle: true },
        { rating: 3, redirectedToGoogle: false },
      ]);

      const result = await service.getSummary('rest-1', 'owner-1');

      expect(result.totalFeedbacks).toBe(3);
      expect(result.averageRating).toBe(4);
      expect(result.googleRedirects).toBe(1);
    });

    it('calculates positiveRate as % of ratings >= 4', async () => {
      mockPrisma.feedback.findMany.mockResolvedValue([
        { rating: 5, redirectedToGoogle: false },
        { rating: 4, redirectedToGoogle: false },
        { rating: 2, redirectedToGoogle: false },
        { rating: 1, redirectedToGoogle: false },
      ]);

      const result = await service.getSummary('rest-1', 'owner-1');

      expect(result.positiveRate).toBe(50); // 2 out of 4
    });

    it('populates ratingDistribution for all 5 rating levels', async () => {
      mockPrisma.feedback.findMany.mockResolvedValue([
        { rating: 5, redirectedToGoogle: false },
        { rating: 5, redirectedToGoogle: false },
        { rating: 3, redirectedToGoogle: false },
      ]);

      const result = await service.getSummary('rest-1', 'owner-1');

      expect(result.ratingDistribution[5]).toBe(2);
      expect(result.ratingDistribution[3]).toBe(1);
      expect(result.ratingDistribution[1]).toBe(0);
    });
  });
});
