import { Test, TestingModule } from '@nestjs/testing';
import { FeedbackController } from './feedback.controller';
import { FeedbackService } from './feedback.service';
import { CreateFeedbackDto } from './dto/create-feedback.dto';
import { FeedbackSummaryQueryDto } from './dto/feedback-summary-query.dto';
import { FeedbackListQueryDto } from './dto/feedback-list-query.dto';

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

      const result = await controller.create('session-token-1', dto);

      expect(mockFeedbackService.create).toHaveBeenCalledWith(
        'session-token-1',
        dto,
      );
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
    it('should call feedbackService.findAll with restaurantId, filters, and userId', async () => {
      const query: FeedbackListQueryDto = {
        restaurantId: 'rest-1',
        page: 1,
        limit: 10,
        rating: 4,
        hasComment: true,
        sort: 'OLDEST',
      };
      const req = { user: { id: 'user-1' } };
      mockFeedbackService.findAll.mockResolvedValue({
        data: [],
        total: 0,
      });

      const result = await controller.findAll(query, req);

      expect(mockFeedbackService.findAll).toHaveBeenCalledWith(
        'rest-1',
        query,
        'user-1',
      );
      expect(result).toEqual({ data: [], total: 0 });
    });

    it('should take restaurantId from the validated query DTO, not a second binding', async () => {
      // Previously the handler bound restaurantId twice -- once via
      // @Query('restaurantId') and once inside the whole-object @Query() DTO.
      // The global pipe validates the whole object, so the request 400'd with
      // "property restaurantId should not exist". A missing restaurantId is now
      // rejected by the pipe before the handler runs (covered in
      // feedback-list-query.dto.spec.ts), so the controller's only job is to
      // forward the id the DTO carries.
      const query: FeedbackListQueryDto = {
        restaurantId: 'rest-from-dto',
        page: 1,
        limit: 10,
      };
      const req = { user: { id: 'user-1' } };
      mockFeedbackService.findAll.mockResolvedValue({
        data: [],
        total: 0,
      });

      await controller.findAll(query, req);

      expect(mockFeedbackService.findAll).toHaveBeenCalledWith(
        'rest-from-dto',
        query,
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
