import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateAssistanceDto } from './dto/create-assistance.dto';
import { UpdateAssistanceDto } from './dto/update-assistance.dto';
import { EventsGateway } from '../events/events.gateway';

@Injectable()
export class AssistanceService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly eventsGateway: EventsGateway,
  ) {}

  async create(createAssistanceDto: CreateAssistanceDto) {
    const newRequest = await this.prisma.assistanceRequest.create({
      data: {
        tableId: createAssistanceDto.tableId,
        restaurantId: createAssistanceDto.restaurantId,
      },
    });

    this.eventsGateway.emitToRestaurant(
      createAssistanceDto.restaurantId,
      'newAssistanceRequest',
      newRequest,
    );
    return newRequest;
  }

  async findAll(userId: string) {
    return this.prisma.assistanceRequest.findMany({
      where: {
        restaurant: {
          ownerId: userId,
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
    });
  }

  async findOne(id: string) {
    const request = await this.prisma.assistanceRequest.findUnique({
      where: { id },
    });
    if (!request) {
      throw new NotFoundException(
        `Assistance request with ID "${id}" not found`,
      );
    }
    return request;
  }

  async update(id: string, updateAssistanceDto: UpdateAssistanceDto) {
    await this.findOne(id);
    const request = await this.findOne(id);
    const updatedRequest = await this.prisma.assistanceRequest.update({
      where: { id },
      data: {
        isResolved: updateAssistanceDto.isResolved,
      },
    });

    this.eventsGateway.emitToRestaurant(
      request.restaurantId,
      'assistanceStatusChanged',
      updatedRequest,
    );
    return updatedRequest;
  }

  async remove(id: string) {
    await this.findOne(id);
    return this.prisma.assistanceRequest.delete({
      where: { id },
    });
  }
}
