import {
  Controller,
  Get,
  Post,
  Body,
  Query,
  UseGuards,
  Request,
  ValidationPipe,
  Param,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { FeedbackService } from './feedback.service';
import { CreateFeedbackDto } from './dto/create-feedback.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PaginationDto } from '../common/dto/pagination.dto';
import { FeedbackSummaryQueryDto } from './dto/feedback-summary-query.dto';

@Controller('feedback')
export class FeedbackController {
  constructor(private readonly feedbackService: FeedbackService) {}

  // Public — customers submit feedback without auth.
  // Strict throttle (Issue 5): 5 submissions per minute per IP.
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  @Post()
  create(@Body(ValidationPipe) createFeedbackDto: CreateFeedbackDto) {
    return this.feedbackService.create(createFeedbackDto);
  }

  // Public — get Google Review URL for redirect
  @Get('google-review-url/:restaurantId')
  getGoogleReviewUrl(@Param('restaurantId') restaurantId: string) {
    return this.feedbackService.getGoogleReviewUrl(restaurantId);
  }

  // Protected — owner views all feedback
  @UseGuards(JwtAuthGuard)
  @Get()
  findAll(
    @Query('restaurantId') restaurantId: string,
    @Query() pagination: PaginationDto,
    @Request() req: any,
  ) {
    return this.feedbackService.findAll(restaurantId, pagination, req.user.id);
  }

  // Protected — owner views feedback summary/stats
  @UseGuards(JwtAuthGuard)
  @Get('summary')
  getSummary(@Query() query: FeedbackSummaryQueryDto, @Request() req: any) {
    return this.feedbackService.getSummary(
      query.restaurantId,
      req.user.id,
      query,
    );
  }
}
