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
import { FeedbackService } from './feedback.service';
import { CreateFeedbackDto } from './dto/create-feedback.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

@Controller('feedback')
export class FeedbackController {
  constructor(private readonly feedbackService: FeedbackService) {}

  // Public — customers submit feedback without auth
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
  findAll(@Query('restaurantId') restaurantId: string) {
    return this.feedbackService.findAll(restaurantId);
  }

  // Protected — owner views feedback summary/stats
  @UseGuards(JwtAuthGuard)
  @Get('summary')
  getSummary(@Query('restaurantId') restaurantId: string) {
    return this.feedbackService.getSummary(restaurantId);
  }
}
