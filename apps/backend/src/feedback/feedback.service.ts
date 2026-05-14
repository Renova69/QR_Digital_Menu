import {
  Injectable,
  NotFoundException,
  ConflictException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateFeedbackDto } from './dto/create-feedback.dto';
import { PaginationDto } from '../common/dto/pagination.dto';

@Injectable()
export class FeedbackService {
  private readonly logger = new Logger(FeedbackService.name);

  constructor(private readonly prisma: PrismaService) {}

  async create(createFeedbackDto: CreateFeedbackDto) {
    // Check if feedback already exists for this order
    const existing = await this.prisma.feedback.findUnique({
      where: { orderId: createFeedbackDto.orderId },
    });
    if (existing) {
      throw new ConflictException('Feedback already submitted for this order');
    }

    // Verify the order exists
    const order = await this.prisma.order.findUnique({
      where: { id: createFeedbackDto.orderId },
    });
    if (!order) {
      throw new NotFoundException('Order not found');
    }

    return this.prisma.feedback.create({
      data: {
        rating: createFeedbackDto.rating,
        comment: createFeedbackDto.comment,
        redirectedToGoogle: createFeedbackDto.redirectedToGoogle || false,
        orderId: createFeedbackDto.orderId,
        restaurantId: createFeedbackDto.restaurantId,
      },
    });
  }

  // Get the Google Review URL for the restaurant (public)
  async getGoogleReviewUrl(restaurantId: string) {
    const restaurant = await this.prisma.restaurant.findUnique({
      where: { id: restaurantId },
      select: { googleReviewUrl: true, name: true },
    });
    if (!restaurant) {
      throw new NotFoundException('Restaurant not found');
    }
    return {
      googleReviewUrl: restaurant.googleReviewUrl,
      name: restaurant.name,
    };
  }

  // Get all feedback for a restaurant (owner-only)
  async findAll(restaurantId: string, pagination: PaginationDto) {
    const page = Number.isFinite(pagination.page) ? pagination.page : 1;
    const limit = Number.isFinite(pagination.limit) ? pagination.limit : 50;
    const skip = (page - 1) * limit;

    const [data, total] = await Promise.all([
      this.prisma.feedback.findMany({
        where: { restaurantId },
        include: {
          order: {
            select: {
              customerName: true,
              tableId: true,
              totalPrice: true,
              createdAt: true,
            },
          },
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      this.prisma.feedback.count({
        where: { restaurantId },
      }),
    ]);

    return {
      data,
      total,
      page,
      totalPages: Math.ceil(total / limit),
    };
  }

  // Get feedback summary stats (owner-only)
  async getSummary(restaurantId: string) {
    const feedbacks = await this.prisma.feedback.findMany({
      where: { restaurantId },
      select: { rating: true, redirectedToGoogle: true },
    });

    if (feedbacks.length === 0) {
      return {
        totalFeedbacks: 0,
        averageRating: 0,
        ratingDistribution: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 },
        googleRedirects: 0,
        positiveRate: 0,
      };
    }

    const totalFeedbacks = feedbacks.length;
    const avgRating =
      feedbacks.reduce((sum, f) => sum + f.rating, 0) / totalFeedbacks;
    const googleRedirects = feedbacks.filter(
      (f) => f.redirectedToGoogle,
    ).length;

    const ratingDistribution: Record<number, number> = {
      1: 0,
      2: 0,
      3: 0,
      4: 0,
      5: 0,
    };
    for (const f of feedbacks) {
      ratingDistribution[f.rating] = (ratingDistribution[f.rating] || 0) + 1;
    }

    const positiveCount = feedbacks.filter((f) => f.rating >= 4).length;

    return {
      totalFeedbacks,
      averageRating: Math.round(avgRating * 10) / 10,
      ratingDistribution,
      googleRedirects,
      positiveRate: Math.round((positiveCount / totalFeedbacks) * 100),
    };
  }
}
