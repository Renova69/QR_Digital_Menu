import {
  WebSocketGateway,
  WebSocketServer,
  OnGatewayConnection,
  OnGatewayDisconnect,
  SubscribeMessage,
  MessageBody,
  ConnectedSocket,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { Logger, forwardRef, Inject } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../prisma/prisma.service';
import { PrintStationService } from '../print-station/print-station.service';

const wsOrigin = (
  origin: string | undefined,
  callback: (err: Error | null, allow?: boolean) => void,
) => {
  const allowed = [
    process.env.FRONTEND_URL || 'http://localhost:3001',
    'http://localhost:3001',
    'http://127.0.0.1:3001',
    'http://localhost:3002',
    'http://127.0.0.1:3002',
  ];
  if (
    !origin ||
    allowed.includes(origin) ||
    (typeof origin === 'string' && origin.endsWith('.vercel.app'))
  ) {
    callback(null, true);
  } else {
    callback(new Error(`Socket.IO CORS: ${origin} not allowed`));
  }
};

/** Token scope for the short-lived order-tracking token issued to customers. */
const ORDER_TRACK_SCOPE = 'order-track';
const ORDER_TRACK_TTL = '6h';

/** Minimal cookie-header parser — avoids a dependency for the one value we need. */
function parseCookie(header: string | undefined, name: string): string | null {
  if (!header) return null;
  for (const part of header.split(';')) {
    const eq = part.indexOf('=');
    if (eq === -1) continue;
    if (part.slice(0, eq).trim() === name) {
      return decodeURIComponent(part.slice(eq + 1).trim());
    }
  }
  return null;
}

@WebSocketGateway({
  cors: { origin: wsOrigin, credentials: true },
})
export class EventsGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server;

  private logger = new Logger('EventsGateway');

  constructor(
    private readonly jwt: JwtService,
    private readonly prisma: PrismaService,
    @Inject(forwardRef(() => PrintStationService))
    private readonly printStationService: PrintStationService,
  ) {}

  /**
   * Authenticate the handshake from the `token` cookie. A valid JWT marks the
   * socket with its userId; anything else (no cookie, expired, order-track
   * token) leaves it anonymous. Connections are NOT rejected when anonymous —
   * customers tracking an order connect without a dashboard JWT and are
   * authorized per-room via an order-scoped token instead.
   */
  async handleConnection(client: Socket) {
    const token = parseCookie(client.handshake.headers?.cookie, 'token');
    if (token) {
      try {
        const payload = this.jwt.verify(token);
        if (payload?.sub) {
          client.data.userId = payload.sub;
        }
      } catch {
        // invalid/expired — stay anonymous
      }
    }

    // Print agent auth — agents pass agentToken in socket.auth (no Origin header from React Native)
    const agentToken = client.handshake.auth?.agentToken as string | undefined;
    if (agentToken && !client.data.userId) {
      const record = await this.printStationService.validateAgentToken(agentToken);
      if (!record) {
        this.logger.warn(`Invalid agent token from ${client.id} — disconnecting`);
        client.disconnect();
        return;
      }
      client.data.agentRestaurantId = record.restaurantId;
      client.data.agentStationId = record.printStationId;
      client.join(`print:${record.restaurantId}:${record.printStationId}`);

      void this.printStationService.touchLastSeen(agentToken);
      void this.printStationService
        .retryPendingJobs(record.restaurantId, record.printStationId)
        .catch((err: Error) =>
          this.logger.error(`Retry failed for station ${record.printStationId}: ${err.message}`),
        );

      this.logger.log(
        `Print agent connected: ${record.printStation.name} socket=${client.id}`,
      );
      return;
    }

    this.logger.log(
      `Client connected: ${client.id}${client.data.userId ? ` (user ${client.data.userId})` : ' (anon)'}`,
    );
  }

  handleDisconnect(client: Socket) {
    this.logger.log(`Client disconnected: ${client.id}`);
  }

  private async canAccessRestaurant(
    userId: string,
    restaurantId: string,
  ): Promise<boolean> {
    const [user, restaurant] = await Promise.all([
      this.prisma.user.findUnique({
        where: { id: userId },
        select: {
          role: true,
          restaurantId: true,
          isActive: true,
          disabledAt: true,
        },
      }),
      this.prisma.restaurant.findUnique({
        where: { id: restaurantId },
        select: { ownerId: true, isActive: true },
      }),
    ]);
    if (!user || !restaurant) return false;
    // Mirror jwt.strategy: disabled accounts and suspended restaurants are
    // rejected on the HTTP path — enforce the same over the socket.
    if (user.isActive === false || user.disabledAt) return false;
    if (user.role === 'SUPER_ADMIN') return true;
    if (restaurant.isActive === false) return false;
    return restaurant.ownerId === userId || user.restaurantId === restaurantId;
  }

  /**
   * Join a restaurant's live event room. Requires an authenticated owner,
   * assigned staff, or super-admin for that restaurant — restaurant IDs are
   * public (menu URLs), so this is the access boundary for the live feed.
   */
  @SubscribeMessage('joinRestaurantRoom')
  async handleJoinRoom(
    @MessageBody() restaurantId: string,
    @ConnectedSocket() client: Socket,
  ) {
    const userId = client.data.userId as string | undefined;
    if (!userId || !(await this.canAccessRestaurant(userId, restaurantId))) {
      this.logger.warn(
        `Denied restaurant room join: client ${client.id} → restaurant_${restaurantId}`,
      );
      client.emit('roomError', {
        room: 'restaurant',
        restaurantId,
        error: 'UNAUTHORIZED',
      });
      return { event: 'roomError', data: restaurantId };
    }
    client.join(`restaurant_${restaurantId}`);
    this.logger.log(
      `Client ${client.id} joined room: restaurant_${restaurantId}`,
    );
    return { event: 'joinedRoom', data: restaurantId };
  }

  @SubscribeMessage('leaveRestaurantRoom')
  handleLeaveRoom(
    @MessageBody() restaurantId: string,
    @ConnectedSocket() client: Socket,
  ) {
    client.leave(`restaurant_${restaurantId}`);
    this.logger.log(
      `Client ${client.id} left room: restaurant_${restaurantId}`,
    );
    return { event: 'leftRoom', data: restaurantId };
  }

  private verifyOrderToken(token: string, orderId: string): boolean {
    try {
      const payload = this.jwt.verify(token);
      return (
        payload?.scope === ORDER_TRACK_SCOPE && payload?.orderId === orderId
      );
    } catch {
      return false;
    }
  }

  /**
   * Issue a short-lived token scoped to a single order. Returned to the
   * customer on order creation so they can track that order — and only that
   * order — over the socket without seeing the restaurant's event feed.
   */
  signOrderToken(orderId: string): string {
    return this.jwt.sign(
      { scope: ORDER_TRACK_SCOPE, orderId },
      { expiresIn: ORDER_TRACK_TTL },
    );
  }

  /**
   * Join a single order's room for real-time status tracking. Requires the
   * order-scoped token issued at order creation.
   */
  @SubscribeMessage('joinOrderRoom')
  handleJoinOrderRoom(
    @MessageBody() body: { orderId: string; token: string },
    @ConnectedSocket() client: Socket,
  ) {
    const orderId = body?.orderId;
    const token = body?.token;
    if (!orderId || !token || !this.verifyOrderToken(token, orderId)) {
      this.logger.warn(
        `Denied order room join: client ${client.id} → order_${orderId}`,
      );
      client.emit('roomError', {
        room: 'order',
        orderId,
        error: 'UNAUTHORIZED',
      });
      return { event: 'roomError', data: orderId };
    }
    client.join(`order_${orderId}`);
    this.logger.log(`Client ${client.id} joined order room: order_${orderId}`);
    return { event: 'joinedOrderRoom', data: orderId };
  }

  /**
   * Dispatch a generic event to a specific restaurant's room.
   */
  emitToRestaurant(restaurantId: string, eventName: string, payload: any) {
    this.server.to(`restaurant_${restaurantId}`).emit(eventName, payload);
  }

  emitTableStatusChanged(
    restaurantId: string,
    tableId: string,
    sessionId: string,
  ) {
    this.emitToRestaurant(restaurantId, 'table:status-changed', {
      tableId,
      sessionId,
    });
  }

  emitZoneChanged(restaurantId: string) {
    this.emitToRestaurant(restaurantId, 'zone:changed', {});
  }

  /**
   * Emit a print job to the station room.
   * Returns true if at least one agent socket is present (job delivered),
   * false if room is empty (job stays PENDING for retry on reconnect).
   */
  emitPrintJob(
    restaurantId: string,
    stationId: string,
    jobId: string,
    ticketBase64: string,
  ): boolean {
    const room = `print:${restaurantId}:${stationId}`;
    const sockets = this.server.sockets.adapter.rooms.get(room);
    const hasAgents = sockets !== undefined && sockets.size > 0;
    if (hasAgents) {
      this.server.to(room).emit('print:job', { jobId, ticket: ticketBase64 });
    }
    return hasAgents;
  }

  @SubscribeMessage('print:ack')
  async handlePrintAck(
    @MessageBody() body: { jobId: string; success: boolean; error?: string },
    @ConnectedSocket() client: Socket,
  ) {
    if (!client.data.agentStationId) return;
    await this.printStationService
      .handlePrintAck(body.jobId, body.success, body.error)
      .catch((err: Error) =>
        this.logger.error(`handlePrintAck failed for job ${body.jobId}: ${err.message}`),
      );
  }

  /**
   * Dispatch an event to a specific order's room (e.g. status change).
   */
  emitToOrder(orderId: string, eventName: string, payload: any) {
    this.server.to(`order_${orderId}`).emit(eventName, payload);
  }
}
