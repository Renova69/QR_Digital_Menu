import { Test, TestingModule } from '@nestjs/testing';
import { EventsGateway } from './events.gateway';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../prisma/prisma.service';
import { PrintStationService } from '../print-station/print-station.service';
import { FeatureService } from '../subscription/feature.service';
import { Socket } from 'socket.io';

describe('Socket Auth Tests', () => {
  let gateway: EventsGateway;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        EventsGateway,
        { provide: JwtService, useValue: {} },
        { provide: PrismaService, useValue: {} },
        { provide: PrintStationService, useValue: {} },
        { provide: FeatureService, useValue: {} },
      ],
    }).compile();

    gateway = module.get<EventsGateway>(EventsGateway);
  });

  it('Authenticated room joins should reject anonymous sockets in production', async () => {
    const mockSocket = {
      id: 'socket_1',
      data: { userId: undefined },
      emit: jest.fn(),
    } as unknown as Socket;

    const result = await gateway.handleJoinRestaurantOrdersRoom(
      'rest1',
      mockSocket,
    );

    expect(result.event).toBe('roomError');
    expect(mockSocket.emit).toHaveBeenCalledWith(
      'roomError',
      expect.objectContaining({
        error: 'UNAUTHORIZED',
      }),
    );
  });
});
