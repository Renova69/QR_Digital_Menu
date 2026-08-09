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
import { FeedbackSummaryQueryDto } from './dto/feedback-summary-query.dto';
import { FeedbackListQueryDto } from './dto/feedback-list-query.dto';
import { CreateFeedbackInvitationDto } from './dto/create-feedback-invitation.dto';
import { CreateVisitFeedbackDto } from './dto/create-visit-feedback.dto';
import { FeedbackInvitationTokenDto } from './dto/feedback-invitation-token.dto';
import { TableSessionToken } from '../payment/table-session-token.decorator';

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

  @Throttle({ default: { limit: 60, ttl: 60000 } })
  @Post('invitations')
  issueVisitInvitation(
    @TableSessionToken() token: string,
    @Body(ValidationPipe) body: CreateFeedbackInvitationDto,
  ) {
    return this.feedbackService.issueVisitInvitation(token, body.paymentId);
  }

  @Throttle({ default: { limit: 60, ttl: 60000 } })
  @Post('visit')
  createVisitFeedback(@Body(ValidationPipe) body: CreateVisitFeedbackDto) {
    return this.feedbackService.createVisitFeedback(body);
  }

  @Throttle({ default: { limit: 60, ttl: 60000 } })
  @Post('visit/presented')
  markVisitFeedbackPresented(
    @Body(ValidationPipe) body: FeedbackInvitationTokenDto,
  ) {
    return this.feedbackService.markVisitFeedbackPresented(
      body.invitationToken,
    );
  }

  @Throttle({ default: { limit: 60, ttl: 60000 } })
  @Post('visit/google-click')
  markGoogleReviewClick(
    @Body(ValidationPipe) body: FeedbackInvitationTokenDto,
  ) {
    return this.feedbackService.markGoogleReviewClick(body.invitationToken);
  }

  // Public — get Google Review URL for redirect
  @Get('google-review-url/:restaurantId')
  getGoogleReviewUrl(@Param('restaurantId') restaurantId: string) {
    return this.feedbackService.getGoogleReviewUrl(restaurantId);
  }

  // Protected — owner views all feedback
  @UseGuards(JwtAuthGuard)
  @Get()
  // Read restaurantId off the validated DTO rather than binding it a second
  // time with @Query('restaurantId'). Mixing a named @Query() with a
  // whole-object @Query() means the object is still validated as a whole, so
  // an id the named binding accepts is rejected by forbidNonWhitelisted unless
  // the DTO also declares it -- which is how this 400'd. One binding, one
  // source of truth (matches getSummary below).
  findAll(@Query() query: FeedbackListQueryDto, @Request() req: any) {
    return this.feedbackService.findAll(query.restaurantId, query, req.user.id);
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

  // Protected — the table visit a review came from. Declared after the literal
  // 'summary' route so it cannot shadow it.
  @UseGuards(JwtAuthGuard)
  @Get(':id/visit')
  getVisit(@Param('id') id: string, @Request() req: any) {
    return this.feedbackService.getVisit(id, req.user.id);
  }
}
