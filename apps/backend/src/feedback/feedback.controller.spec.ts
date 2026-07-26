import { Test, TestingModule } from '@nestjs/testing';
import { FeedbackController } from './feedback.controller';
import { FeedbackService } from './feedback.service';
import { CreateFeedbackDto } from './dto/create-feedback.dto';
import { PaginationDto } from '../common/dto/pagination.dto';
import { FeedbackSummaryQueryDto } from './dto/feedback-summary-query.dto';

describe('FeedbackController', () => {
  let controller: FeedbackController;
  let service: FeedbackService;

  const mockFeedbackService = {
    create: jest.fn(),
    getGoogleReviewUrl: jest.fn(),
    findAll: jest.fn(),
    getSummary: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [FeedbackController],
      providers: [{ provide: FeedbackService, useValue: mockFeedbackService }],
    }).compile();

    controller = module.get<FeedbackController>(FeedbackController);
    service = module.get<FeedbackService>(FeedbackService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('create', () => {
    it('should call feedbackService.create with dto', async () => {
      const dto: CreateFeedbackDto = {
        restaurantId: 'rest-1',
        orderId: 'order-1',
        rating: 4,
        comment: 'Great food!',
      };
      mockFeedbackService.create.mockResolvedValue({
        id: 'fb-1',
        ...dto,
      });

      const result = await controller.create(dto);

      expect(mockFeedbackService.create).toHaveBeenCalledWith(dto);
      expect(result).toMatchObject({ id: 'fb-1' });
    });
  });

  describe('getGoogleReviewUrl', () => {
    it('should call feedbackService.getGoogleReviewUrl with restaurantId', async () => {
      mockFeedbackService.getGoogleReviewUrl.mockResolvedValue({
        url: 'https://g.page/review/rest-1',
      });

      const result = await controller.getGoogleReviewUrl('rest-1');

      expect(mockFeedbackService.getGoogleReviewUrl).toHaveBeenCalledWith(
        'rest-1',
      );
      expect(result).toEqual({ url: 'https://g.page/review/rest-1' });
    });
  });

  describe('findAll', () => {
    it('should call feedbackService.findAll with restaurantId, pagination, and userId', async () => {
      const pagination: PaginationDto = { page: 0, limit: 10 };
      const req = { user: { id: 'user-1' } };
      mockFeedbackService.findAll.mockResolvedValue({
        data: [],
        total: 0,
      });

      const result = await controller.findAll('rest-1', pagination, req);

      expect(mockFeedbackService.findAll).toHaveBeenCalledWith(
        'rest-1',
        pagination,
        'user-1',
      );
      expect(result).toEqual({ data: [], total: 0 });
    });

    it('should handle missing restaurantId', async () => {
      const pagination: PaginationDto = { page: 0, limit: 10 };
      const req = { user: { id: 'user-1' } };
      mockFeedbackService.findAll.mockResolvedValue({
        data: [],
        total: 0,
      });

      await controller.findAll(undefined as any, pagination, req);

      expect(mockFeedbackService.findAll).toHaveBeenCalledWith(
        undefined,
        pagination,
        'user-1',
      );
    });
  });

  describe('getSummary', () => {
    it('should call feedbackService.getSummary with query params and userId', async () => {
      const query: FeedbackSummaryQueryDto = {
        restaurantId: 'rest-1',
      } as FeedbackSummaryQueryDto;
      const req = { user: { id: 'user-1' } };
      mockFeedbackService.getSummary.mockResolvedValue({
        averageRating: 4.2,
        total: 25,
      });

      const result = await controller.getSummary(query, req);

      expect(mockFeedbackService.getSummary).toHaveBeenCalledWith(
        'rest-1',
        'user-1',
        query,
      );
      expect(result).toEqual({ averageRating: 4.2, total: 25 });
    });
  });
});
