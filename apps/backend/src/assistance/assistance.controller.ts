import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  Query,
  Request,
  ValidationPipe,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { AssistanceService } from './assistance.service';
import { CreateAssistanceDto } from './dto/create-assistance.dto';
import { UpdateAssistanceDto } from './dto/update-assistance.dto';
import { RequireRestaurantAccess } from '../auth/require-restaurant-access.decorator';
import { AssistanceQueryDto } from './dto/assistance-query.dto';

type AssistanceActorRequest = { user: { id: string } };

@Controller('assistance-requests')
export class AssistanceController {
  constructor(private readonly assistanceService: AssistanceService) {}

  // Public — customers can create assistance requests without auth.
  // Strict throttle (Issue 54): 3 requests per minute per IP to prevent spam.
  @Throttle({ default: { limit: 3, ttl: 60000 } })
  @Post()
  create(@Body(ValidationPipe) createAssistanceDto: CreateAssistanceDto) {
    return this.assistanceService.create(createAssistanceDto);
  }

  // Protected — only restaurant owners can view their requests
  @RequireRestaurantAccess({
    policy: 'service-list',
    source: 'query',
    key: 'restaurantId',
  })
  @Get()
  findAll(
    @Request() req: AssistanceActorRequest,
    @Query() query: AssistanceQueryDto,
  ) {
    return this.assistanceService.findAll(req.user.id, query);
  }

  @RequireRestaurantAccess({
    policy: 'service-member',
    source: 'params',
    key: 'id',
    resource: 'assistance',
  })
  @Get(':id')
  findOne(@Param('id') id: string, @Request() req: AssistanceActorRequest) {
    return this.assistanceService.findOne(id, req.user.id);
  }

  // Protected — only staff can resolve/unresolve requests
  @RequireRestaurantAccess({
    policy: 'service-member',
    source: 'params',
    key: 'id',
    resource: 'assistance',
  })
  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body(ValidationPipe) updateAssistanceDto: UpdateAssistanceDto,
    @Request() req: AssistanceActorRequest,
  ) {
    return this.assistanceService.update(id, updateAssistanceDto, req.user.id);
  }

  @RequireRestaurantAccess({
    policy: 'service-member',
    source: 'params',
    key: 'id',
    resource: 'assistance',
  })
  @Delete(':id')
  remove(@Param('id') id: string, @Request() req: AssistanceActorRequest) {
    return this.assistanceService.remove(id, req.user.id);
  }
}
