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
import {
  Logger,
  forwardRef,
  Inject,
  OnModuleInit,
  OnModuleDestroy,
} from '@nestjs/common';
import type { WrapperType } from '../common/wrapper-type';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../prisma/prisma.service';
import { PrintStationService } from '../print-station/print-station.service';
import { FeatureFlag } from '../subscription/feature-flag.enum';
import { FeatureService } from '../subscription/feature.service';

// C-2: pin to explicit origins — no wildcard CDN domains
const wsOrigin = (
  origin: string | undefined,
  callback: (err: Error | null, allow?: boolean) => void,
) => {
  const primary = process.env.FRONTEND_URL || 'http://localhost:3001';
  const additional = (process.env.ADDITIONAL_CORS_ORIGINS || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

  const allowed = new Set([
    primary,
    'http://localhost:3001',
    'http://127.0.0.1:3001',
    'http://localhost:3002',
    'http://127.0.0.1:3002',
    ...additional,
  ]);

  // "null" origin is sent by React Native / OkHttp WebSocket and some native
  // HTTP clients that don't set a real origin. Treat it as no-origin (allowed).
  if (!origin || origin === 'null' || allowed.has(origin)) {
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
export class EventsGateway
  implements
    OnGatewayConnection,
    OnGatewayDisconnect,
    OnModuleInit,
    OnModuleDestroy
{
  @WebSocketServer()
  server: Server;

  private logger = new Logger('EventsGateway');

  // M-5: per-IP rate limit for WebSocket connections (30/min)
  private readonly wsConnectAttempts = new Map<
    string,
    { count: number; resetAt: number }
  >();
  private sweepInterval: ReturnType<typeof setInterval> | undefined;

  onModuleInit() {
    // Sweep expired IP rate-limit entries every 5 minutes (Issue 38)
    this.sweepInterval = setInterval(
      () => this.sweepConnectAttempts(),
      5 * 60_000,
    );
  }

  onModuleDestroy() {
    if (this.sweepInterval) clearInterval(this.sweepInterval);
  }

  private sweepConnectAttempts() {
    const now = Date.now();
    for (const [ip, entry] of this.wsConnectAttempts) {
      if (now > entry.resetAt) this.wsConnectAttempts.delete(ip);
    }
  }

  constructor(
    private readonly jwt: JwtService,
    private readonly prisma: PrismaService,
    @Inject(forwardRef(() => PrintStationService))
    private readonly printStationService: WrapperType<PrintStationService>,
    private readonly featureService: FeatureService,
  ) {}

  private isWsRateLimited(ip: string): boolean {
    const now = Date.now();
    const entry = this.wsConnectAttempts.get(ip);
    if (!entry || now > entry.resetAt) {
      this.wsConnectAttempts.set(ip, { count: 1, resetAt: now + 60_000 });
      return false;
    }
    if (entry.count >= 30) return true;
    entry.count++;
    return false;
  }

  /**
   * Authenticate the handshake from the `token` cookie. A valid JWT marks the
   * socket with its userId; anything else (no cookie, expired, order-track
   * token) leaves it anonymous. Connections are NOT rejected when anonymous —
   * customers tracking an order connect without a dashboard JWT and are
   * authorized per-room via an order-scoped token instead.
   */
  async handleConnection(client: Socket) {
    // M-5: rate limit before any expensive validation
    const ip = client.handshake.address;
    if (this.isWsRateLimited(ip)) {
      this.logger.warn(`WebSocket rate limit exceeded for IP: ${ip}`);
      client.disconnect();
      return;
    }

    // CSWSH guard: when the literal string "null" is sent as Origin (React Native /
    // OkHttp pattern), skip cookie-based JWT auth. Agenttoken auth below is still
    // allowed. This prevents a CSWSH attack via sandboxed iframes in production
    // where cookies are sameSite=none.
    const originHeader = client.handshake.headers?.origin;
    const cookieAuthAllowed = originHeader !== 'null';

    const token = cookieAuthAllowed
      ? parseCookie(client.handshake.headers?.cookie, 'token')
      : null;
    if (token) {
      try {
        const payload = this.jwt.verify(token);
        if (payload?.sub) {
          client.data.userId = payload.sub;
          if (typeof payload.deviceTokenId === 'string') {
            client.data.deviceTokenId = payload.deviceTokenId;
          }
        }
      } catch {
        // invalid/expired — stay anonymous
      }
    }

    // Print agent auth — agents pass agentToken in socket.auth (no Origin header from React Native)
    const agentToken = client.handshake.auth?.agentToken as string | undefined;
    if (agentToken && !client.data.userId) {
      const record =
        await this.printStationService.validateAgentToken(agentToken);
      if (!record) {
        this.logger.warn(
          `Invalid agent token from ${client.id} — disconnecting`,
        );
        client.emit('agent:rejected', 'invalid_token');
        client.disconnect();
        return;
      }

      // Reject suspended restaurants and inactive stations
      const restaurant = await this.prisma.restaurant.findUnique({
        where: { id: record.restaurantId },
        select: { isActive: true },
      });
      if (
        !restaurant ||
        restaurant.isActive === false ||
        !record.printStation.isActive
      ) {
        this.logger.warn(
          `Agent token rejected — suspended/inactive: station=${record.printStationId} socket=${client.id}`,
        );
        client.emit('agent:rejected', 'station_inactive');
        client.disconnect();
        return;
      }

      client.data.agentRestaurantId = record.restaurantId;
      client.data.agentStationId = record.printStationId;
      client.data.agentTokenId = record.id; // M-4: needed for revoke disconnect + M-1 lastSeen
      void client.join(`print:${record.restaurantId}:${record.printStationId}`);

      void this.printStationService.touchLastSeen(agentToken);
      void this.printStationService
        .retryPendingJobs(record.restaurantId, record.printStationId)
        .catch((err: Error) =>
          this.logger.error(
            `Retry failed for station ${record.printStationId}: ${err.message}`,
          ),
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

  private async canReceiveOrderEvents(
    userId: string,
    restaurantId: string,
  ): Promise<{ allowed: boolean; error?: 'UNAUTHORIZED' | 'FEATURE_LOCKED' }> {
    if (!(await this.canAccessRestaurant(userId, restaurantId))) {
      return { allowed: false, error: 'UNAUTHORIZED' };
    }

    const [user, restaurant] = await Promise.all([
      this.prisma.user.findUnique({
        where: { id: userId },
        select: { role: true },
      }),
      this.prisma.restaurant.findUnique({
        where: { id: restaurantId },
        select: { tier: true, forceTier: true },
      }),
    ]);

    if (!user || !restaurant) {
      return { allowed: false, error: 'UNAUTHORIZED' };
    }
    if (user.role === 'SUPER_ADMIN') {
      return { allowed: true };
    }
    if (
      !this.featureService.restaurantHasFeature(
        restaurant,
        FeatureFlag.ORDERS_RECEIVE,
      )
    ) {
      return { allowed: false, error: 'FEATURE_LOCKED' };
    }

    return { allowed: true };
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
      this.logger[userId ? 'warn' : 'debug'](
        `Denied restaurant room join: client ${client.id} → restaurant_${restaurantId}`,
      );
      client.emit('roomError', {
        room: 'restaurant',
        restaurantId,
        error: 'UNAUTHORIZED',
      });
      return { event: 'roomError', data: restaurantId };
    }
    void client.join(`restaurant_${restaurantId}`);
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
    void client.leave(`restaurant_${restaurantId}`);
    this.logger.log(
      `Client ${client.id} left room: restaurant_${restaurantId}`,
    );
    return { event: 'leftRoom', data: restaurantId };
  }

  @SubscribeMessage('joinRestaurantOrdersRoom')
  async handleJoinRestaurantOrdersRoom(
    @MessageBody() restaurantId: string,
    @ConnectedSocket() client: Socket,
  ) {
    const userId = client.data.userId as string | undefined;
    const access = userId
      ? await this.canReceiveOrderEvents(userId, restaurantId)
      : { allowed: false, error: 'UNAUTHORIZED' as const };

    if (!access.allowed) {
      this.logger[userId || access.error !== 'UNAUTHORIZED' ? 'warn' : 'debug'](
        `Denied restaurant orders room join: client ${client.id} -> restaurant_orders_${restaurantId}`,
      );
      client.emit('roomError', {
        room: 'restaurant-orders',
        restaurantId,
        error: access.error ?? 'UNAUTHORIZED',
      });
      return { event: 'roomError', data: restaurantId };
    }

    void client.join(`restaurant_orders_${restaurantId}`);
    this.logger.log(
      `Client ${client.id} joined room: restaurant_orders_${restaurantId}`,
    );
    return { event: 'joinedRestaurantOrdersRoom', data: restaurantId };
  }

  @SubscribeMessage('leaveRestaurantOrdersRoom')
  handleLeaveRestaurantOrdersRoom(
    @MessageBody() restaurantId: string,
    @ConnectedSocket() client: Socket,
  ) {
    void client.leave(`restaurant_orders_${restaurantId}`);
    this.logger.log(
      `Client ${client.id} left room: restaurant_orders_${restaurantId}`,
    );
    return { event: 'leftRestaurantOrdersRoom', data: restaurantId };
  }

  private async resolveTableSessionRoom(token: string | undefined) {
    if (!token || typeof token !== 'string') return null;
    return this.prisma.tableSession.findUnique({
      where: { token },
      select: { id: true },
    });
  }

  /**
   * Public customers may listen to events for the table session whose token they
   * already hold. This is intentionally narrower than the restaurant dashboard
   * room: it exposes only updates emitted to `table_session_<id>`.
   */
  @SubscribeMessage('joinTableSessionRoom')
  async handleJoinTableSessionRoom(
    @MessageBody() body: { token?: string } | string,
    @ConnectedSocket() client: Socket,
  ) {
    const token = typeof body === 'string' ? body : body?.token;
    const session = await this.resolveTableSessionRoom(token);
    if (!session) {
      client.emit('roomError', {
        room: 'table-session',
        error: 'UNAUTHORIZED',
      });
      return { event: 'roomError', data: 'table-session' };
    }

    void client.join(`table_session_${session.id}`);
    return { event: 'joinedTableSessionRoom', data: session.id };
  }

  @SubscribeMessage('leaveTableSessionRoom')
  async handleLeaveTableSessionRoom(
    @MessageBody() body: { token?: string } | string,
    @ConnectedSocket() client: Socket,
  ) {
    const token = typeof body === 'string' ? body : body?.token;
    const session = await this.resolveTableSessionRoom(token);
    if (!session) return { event: 'leftTableSessionRoom', data: null };

    void client.leave(`table_session_${session.id}`);
    return { event: 'leftTableSessionRoom', data: session.id };
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
    void client.join(`order_${orderId}`);
    this.logger.log(`Client ${client.id} joined order room: order_${orderId}`);
    return { event: 'joinedOrderRoom', data: orderId };
  }

  /**
   * Leave a single order's room. Emitted by the confirmation page on cleanup so
   * a socket that places a second order stops receiving the previous order's
   * status updates. Leaving only removes the caller from the room, so no token
   * check is needed.
   */
  @SubscribeMessage('leaveOrderRoom')
  handleLeaveOrderRoom(
    @MessageBody() body: { orderId: string },
    @ConnectedSocket() client: Socket,
  ) {
    const orderId = body?.orderId;
    if (!orderId) return { event: 'leftOrderRoom', data: null };
    void client.leave(`order_${orderId}`);
    return { event: 'leftOrderRoom', data: orderId };
  }

  private async resolveReservationRoom(
    restaurantId: string | undefined,
    token: string | undefined,
  ) {
    const trimmedToken = token?.trim();
    if (!restaurantId || !trimmedToken) return null;

    const reservation = await this.prisma.reservation.findUnique({
      where: { manageToken: trimmedToken },
      select: { id: true, restaurantId: true, status: true },
    });
    return reservation?.restaurantId === restaurantId ? reservation : null;
  }

  /**
   * Public guests may listen only to the reservation identified by their
   * private manage token. Send the current status after joining so a dashboard
   * update cannot be lost between the initial HTTP read and room membership.
   */
  @SubscribeMessage('joinReservationRoom')
  async handleJoinReservationRoom(
    @MessageBody() body: { restaurantId?: string; token?: string },
    @ConnectedSocket() client: Socket,
  ) {
    const restaurantId = body?.restaurantId;
    const reservation = await this.resolveReservationRoom(
      restaurantId,
      body?.token,
    );
    if (!reservation) {
      client.emit('roomError', {
        room: 'reservation',
        restaurantId,
        error: 'UNAUTHORIZED',
      });
      return { event: 'roomError', data: 'reservation' };
    }

    void client.join(`reservation_${reservation.id}`);
    client.emit('reservation:updated', {
      id: reservation.id,
      status: reservation.status,
    });
    return { event: 'joinedReservationRoom', data: reservation.id };
  }

  @SubscribeMessage('leaveReservationRoom')
  async handleLeaveReservationRoom(
    @MessageBody() body: { restaurantId?: string; token?: string },
    @ConnectedSocket() client: Socket,
  ) {
    const reservation = await this.resolveReservationRoom(
      body?.restaurantId,
      body?.token,
    );
    if (!reservation) {
      return { event: 'leftReservationRoom', data: null };
    }

    void client.leave(`reservation_${reservation.id}`);
    return { event: 'leftReservationRoom', data: reservation.id };
  }

  // A legitimate customer only ever joins the room for the restaurant whose
  // menu they're viewing (occasionally two, across a tab switch). Since this
  // handler performs no auth/DB check (restaurantId is already public), cap
  // distinct joins per socket so a single connection can't grow the Socket.IO
  // adapter's room-membership maps unbounded by spamming arbitrary IDs.
  private static readonly MAX_PUBLIC_MENU_ROOMS_PER_SOCKET = 5;

  /**
   * Anonymous customers viewing a restaurant's public menu may join this room
   * to receive live item-availability changes. Unlike joinRestaurantRoom, no
   * auth check is performed — restaurant IDs are already public (menu URLs),
   * and this room only ever receives item-availability broadcasts.
   */
  @SubscribeMessage('joinPublicMenuRoom')
  handleJoinPublicMenuRoom(
    @MessageBody() restaurantId: string,
    @ConnectedSocket() client: Socket,
  ) {
    if (!restaurantId || typeof restaurantId !== 'string') {
      return { event: 'roomError', data: 'public-menu' };
    }
    const joined: Set<string> = client.data.publicMenuRooms ?? new Set();
    if (
      !joined.has(restaurantId) &&
      joined.size >= EventsGateway.MAX_PUBLIC_MENU_ROOMS_PER_SOCKET
    ) {
      this.logger.warn(
        `Rejected public menu room join — per-socket limit reached: client ${client.id}`,
      );
      return { event: 'roomError', data: 'public-menu' };
    }
    joined.add(restaurantId);
    client.data.publicMenuRooms = joined;
    void client.join(`public_menu_${restaurantId}`);
    return { event: 'joinedPublicMenuRoom', data: restaurantId };
  }

  @SubscribeMessage('leavePublicMenuRoom')
  handleLeavePublicMenuRoom(
    @MessageBody() restaurantId: string,
    @ConnectedSocket() client: Socket,
  ) {
    (client.data.publicMenuRooms as Set<string> | undefined)?.delete(
      restaurantId,
    );
    void client.leave(`public_menu_${restaurantId}`);
    return { event: 'leftPublicMenuRoom', data: restaurantId };
  }

  /**
   * Dispatch a generic event to a specific restaurant's room.
   */
  emitToRestaurant(restaurantId: string, eventName: string, payload: any) {
    this.server?.to(`restaurant_${restaurantId}`).emit(eventName, payload);
  }

  /**
   * Notify open public-menu tabs that an item's stock status changed, so
   * customers see the "86" toggle live instead of only on next page load.
   */
  emitPublicMenuItemAvailability(
    restaurantId: string,
    payload: { itemId: string; categoryId: string; isOutOfStock: boolean },
  ) {
    this.server
      ?.to(`public_menu_${restaurantId}`)
      .emit('menu:item-availability-changed', payload);
  }

  emitOrderEventToRestaurant(
    restaurantId: string,
    eventName: string,
    payload: any,
  ) {
    this.server
      ?.to(`restaurant_orders_${restaurantId}`)
      .emit(eventName, payload);
  }

  emitToTableSession(sessionId: string, eventName: string, payload: any) {
    this.server?.to(`table_session_${sessionId}`).emit(eventName, payload);
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

  // Reservation events go to the private restaurant room only. Payloads are
  // summaries — NEVER guest contact, dietary/allergy, internal notes, or staff
  // tags. Clients refetch authoritative details over an authenticated request.
  emitReservationCreated(
    restaurantId: string,
    payload: {
      id: string;
      referenceCode: string;
      status: string;
      startsAt: Date;
      guestName: string;
      totalGuests: number;
    },
  ) {
    this.emitToRestaurant(restaurantId, 'reservation:created', payload);
  }

  emitReservationUpdated(
    restaurantId: string,
    payload: { id: string; status: string },
  ) {
    this.emitToRestaurant(restaurantId, 'reservation:updated', payload);
    this.server
      ?.to(`reservation_${payload.id}`)
      .emit('reservation:updated', payload);
  }

  /**
   * Emit a print job to the station room.
   * Returns true if at least one agent socket is present (job delivered),
   * false if room is empty (job stays PENDING for retry on reconnect).
   *
   * Issue 37+D-8: use fetchSockets() which is cluster-aware when a
   * distributed adapter (e.g. Redis) is configured; adapter.rooms.get()
   * is local-only and misses agents on other Cloud Run replicas.
   */
  async emitPrintJob(
    restaurantId: string,
    stationId: string,
    jobId: string,
    ticketBase64: string,
  ): Promise<boolean> {
    const room = `print:${restaurantId}:${stationId}`;
    const sockets = await this.server.in(room).fetchSockets();
    const hasAgents = sockets.length > 0;
    if (hasAgents) {
      this.server.to(room).emit('print:job', { jobId, ticket: ticketBase64 });
    }
    return hasAgents;
  }

  /**
   * M-4: Disconnect any agent sockets in a station room that were authenticated
   * with the given tokenId. Called after token revocation.
   */
  async disconnectAgentByTokenId(
    restaurantId: string,
    stationId: string,
    tokenId: string,
  ): Promise<void> {
    const room = `print:${restaurantId}:${stationId}`;
    const sockets = await this.server.in(room).fetchSockets();
    for (const sock of sockets) {
      if (sock.data.agentTokenId === tokenId) {
        sock.emit('agent:rejected', 'token_revoked');
        sock.disconnect();
      }
    }
  }

  @SubscribeMessage('print:ack')
  async handlePrintAck(
    @MessageBody() body: { jobId: string; success: boolean; error?: string },
    @ConnectedSocket() client: Socket,
  ) {
    const stationId = client.data.agentStationId as string | undefined;
    const restaurantId = client.data.agentRestaurantId as string | undefined;
    const agentTokenId = client.data.agentTokenId as string | undefined;
    if (!stationId || !restaurantId) return;
    if (typeof body?.jobId !== 'string' || !body.jobId) return;
    await this.printStationService
      .handlePrintAck(
        body.jobId,
        body.success,
        body.error,
        stationId,
        restaurantId,
        agentTokenId,
      )
      .catch((err: Error) =>
        this.logger.error(
          `handlePrintAck failed for job ${body.jobId}: ${err.message}`,
        ),
      );
  }

  /**
   * Dispatch an event to a specific order's room (e.g. status change).
   */
  emitToOrder(orderId: string, eventName: string, payload: any) {
    this.server.to(`order_${orderId}`).emit(eventName, payload);
  }

  /**
   * Disconnect all sockets authenticated as userId.
   * Uses fetchSockets() which is cluster-aware when a distributed adapter
   * (e.g. Redis) is configured (Issue 39).
   */
  async evictUser(userId: string, reason = 'account_disabled'): Promise<void> {
    const all = await this.server.fetchSockets();
    for (const socket of all) {
      if (String(socket.data.userId) === String(userId)) {
        socket.emit('auth:evicted', reason);
        socket.disconnect();
      }
    }
  }

  /**
   * Disconnect all sockets authenticated by a revoked device enrollment token.
   * Dashboard sessions do not carry this claim, so revoking one staff device
   * leaves unrelated browser sessions untouched.
   */
  async evictDeviceToken(
    deviceTokenId: string,
    reason = 'device_revoked',
  ): Promise<void> {
    const all = await this.server.fetchSockets();
    for (const socket of all) {
      if (String(socket.data.deviceTokenId) === String(deviceTokenId)) {
        socket.emit('auth:evicted', reason);
        socket.disconnect();
      }
    }
  }
}
