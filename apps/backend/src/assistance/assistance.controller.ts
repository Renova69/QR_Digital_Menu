import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  Query,
  UseGuards,
  Request,
  ValidationPipe,
} from '@nestjs/common';
import { AssistanceService } from './assistance.service';
import { CreateAssistanceDto } from './dto/create-assistance.dto';
import { UpdateAssistanceDto } from './dto/update-assistance.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PaginationDto } from '../common/dto/pagination.dto';

@Controller('assistance-requests')
export class AssistanceController {
  constructor(private readonly assistanceService: AssistanceService) {}

  // Public — customers can create assistance requests without auth
  @Post()
  create(@Body(ValidationPipe) createAssistanceDto: CreateAssistanceDto) {
    return this.assistanceService.create(createAssistanceDto);
  }

  // Protected — only restaurant owners can view their requests
  @UseGuards(JwtAuthGuard)
  @Get()
  findAll(@Request() req: any, @Query() pagination: PaginationDto) {
    return this.assistanceService.findAll(req.user.id, pagination);
  }

  @UseGuards(JwtAuthGuard)
  @Get(':id')
  findOne(@Param('id') id: string, @Request() req: any) {
    return this.assistanceService.findOne(id, req.user.id);
  }

  // Protected — only staff can resolve/unresolve requests
  @UseGuards(JwtAuthGuard)
  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body(ValidationPipe) updateAssistanceDto: UpdateAssistanceDto,
    @Request() req: any,
  ) {
    return this.assistanceService.update(id, updateAssistanceDto, req.user.id);
  }

  @UseGuards(JwtAuthGuard)
  @Delete(':id')
  remove(@Param('id') id: string, @Request() req: any) {
    return this.assistanceService.remove(id, req.user.id);
  }
}
