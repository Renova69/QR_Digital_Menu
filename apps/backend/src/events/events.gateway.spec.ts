import { EventsGateway } from './events.gateway';

/**
 * Phase 0 — websocket room authorization (#1).
 * Restaurant rooms require an authenticated owner/staff/super-admin.
 * Order rooms require a valid order-scoped signed token.
 */
describe('EventsGateway — room authorization', () => {
  let gateway: EventsGateway;
  let mockJwt: any;
  let mockPrisma: any;
  let mockFeatureService: any;

  const makeClient = (data: Record<string, unknown> = {}) =>
    ({
      id: 'sock-1',
      data,
      handshake: { headers: {} as { cookie?: string } },
      join: jest.fn(),
      leave: jest.fn(),
      emit: jest.fn(),
    }) as unknown as import('socket.io').Socket;

  const gatewayLogger = () =>
    (
      gateway as unknown as {
        logger: {
          warn: (message: string) => void;
          debug: (message: string) => void;
        };
      }
    ).logger;

  let mockPrintStationService: any;

  beforeEach(() => {
    mockJwt = {
      verify: jest.fn(),
      sign: jest.fn().mockReturnValue('signed-token'),
    };
    mockPrisma = {
      user: { findUnique: jest.fn() },
      restaurant: { findUnique: jest.fn() },
      reservation: { findUnique: jest.fn() },
      tableSession: { findUnique: jest.fn() },
    };
    mockPrintStationService = {
      validateAgentToken: jest.fn(),
      touchLastSeen: jest.fn(),
      retryPendingJobs: jest.fn().mockResolvedValue(undefined),
      handlePrintAck: jest.fn(),
      routeOrderToPrinters: jest.fn().mockResolvedValue(undefined),
    };
    mockFeatureService = {
      restaurantHasFeature: jest.fn().mockReturnValue(true),
    };
    gateway = new EventsGateway(
      mockJwt,
      mockPrisma,
      mockPrintStationService,
      mockFeatureService,
    );
  });

  // ─── handleConnection: handshake auth ────────────────────────────────────

  describe('handleConnection', () => {
    it('attaches userId when a valid token cookie is present', async () => {
      mockJwt.verify.mockReturnValue({ sub: 'user-1', email: 'a@b.c' });
      const client = makeClient();
      client.handshake.headers.cookie = 'foo=bar; token=valid.jwt.here';

      await gateway.handleConnection(
        client as unknown as import('socket.io').Socket,
      );

      expect(client.data.userId).toBe('user-1');
    });

    it('attaches deviceTokenId when a PIN-login token carries it', async () => {
      mockJwt.verify.mockReturnValue({
        sub: 'user-1',
        email: 'a@b.c',
        deviceTokenId: 'device-token-1',
      });
      const client = makeClient();
      client.handshake.headers.cookie = 'token=valid.jwt.here';

      await gateway.handleConnection(
        client as unknown as import('socket.io').Socket,
      );

      expect(client.data.userId).toBe('user-1');
      expect(client.data.deviceTokenId).toBe('device-token-1');
    });

    it('stays anonymous when no cookie is present (public order tracking)', async () => {
      const client = makeClient();

      await gateway.handleConnection(
        client as unknown as import('socket.io').Socket,
      );

      expect(client.data.userId).toBeUndefined();
    });

    it('stays anonymous when the token is invalid', async () => {
      mockJwt.verify.mockImplementation(() => {
        throw new Error('bad token');
      });
      const client = makeClient();
      client.handshake.headers.cookie = 'token=garbage';

      await gateway.handleConnection(
        client as unknown as import('socket.io').Socket,
      );

      expect(client.data.userId).toBeUndefined();
    });
  });

  // ─── joinRestaurantRoom: ownership/staff authorization ───────────────────

  describe('handleJoinRoom', () => {
    it('rejects anonymous sockets', async () => {
      const client = makeClient(); // no userId
      const warnSpy = jest.spyOn(gatewayLogger(), 'warn');
      const debugSpy = jest.spyOn(gatewayLogger(), 'debug');

      await gateway.handleJoinRoom(
        'rest-1',
        client as unknown as import('socket.io').Socket,
      );

      expect(client.join).not.toHaveBeenCalled();
      expect(client.emit).toHaveBeenCalledWith(
        'roomError',
        expect.objectContaining({ restaurantId: 'rest-1' }),
      );
      expect(warnSpy).not.toHaveBeenCalled();
      expect(debugSpy).toHaveBeenCalledWith(
        expect.stringContaining('Denied restaurant room join'),
      );
    });

    it('allows the owner', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({
        role: 'OWNER',
        restaurantId: null,
      });
      mockPrisma.restaurant.findUnique.mockResolvedValue({ ownerId: 'user-1' });
      const client = makeClient({ userId: 'user-1' });

      await gateway.handleJoinRoom(
        'rest-1',
        client as unknown as import('socket.io').Socket,
      );

      expect(client.join).toHaveBeenCalledWith('restaurant_rest-1');
    });

    it('allows assigned staff', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({
        role: 'WAITER',
        restaurantId: 'rest-1',
      });
      mockPrisma.restaurant.findUnique.mockResolvedValue({
        ownerId: 'someone-else',
      });
      const client = makeClient({ userId: 'user-2' });

      await gateway.handleJoinRoom(
        'rest-1',
        client as unknown as import('socket.io').Socket,
      );

      expect(client.join).toHaveBeenCalledWith('restaurant_rest-1');
    });

    it('allows super-admin', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({
        role: 'SUPER_ADMIN',
        restaurantId: null,
      });
      mockPrisma.restaurant.findUnique.mockResolvedValue({
        ownerId: 'someone-else',
      });
      const client = makeClient({ userId: 'admin-1' });

      await gateway.handleJoinRoom(
        'rest-1',
        client as unknown as import('socket.io').Socket,
      );

      expect(client.join).toHaveBeenCalledWith('restaurant_rest-1');
    });

    it('rejects an authenticated user from another restaurant', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({
        role: 'OWNER',
        restaurantId: null,
      });
      mockPrisma.restaurant.findUnique.mockResolvedValue({
        ownerId: 'someone-else',
      });
      const client = makeClient({ userId: 'user-3' });

      await gateway.handleJoinRoom(
        'rest-1',
        client as unknown as import('socket.io').Socket,
      );

      expect(client.join).not.toHaveBeenCalled();
      expect(client.emit).toHaveBeenCalledWith(
        'roomError',
        expect.objectContaining({ restaurantId: 'rest-1' }),
      );
    });

    it('rejects a disabled owner (parity with jwt.strategy)', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({
        role: 'OWNER',
        restaurantId: null,
        isActive: false,
      });
      mockPrisma.restaurant.findUnique.mockResolvedValue({
        ownerId: 'user-1',
        isActive: true,
      });
      const client = makeClient({ userId: 'user-1' });

      await gateway.handleJoinRoom(
        'rest-1',
        client as unknown as import('socket.io').Socket,
      );

      expect(client.join).not.toHaveBeenCalled();
    });

    it('rejects when the restaurant is suspended', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({
        role: 'OWNER',
        restaurantId: null,
        isActive: true,
      });
      mockPrisma.restaurant.findUnique.mockResolvedValue({
        ownerId: 'user-1',
        isActive: false,
      });
      const client = makeClient({ userId: 'user-1' });

      await gateway.handleJoinRoom(
        'rest-1',
        client as unknown as import('socket.io').Socket,
      );

      expect(client.join).not.toHaveBeenCalled();
    });
  });

  // ─── joinOrderRoom: order-scoped token ───────────────────────────────────

  describe('handleJoinRestaurantOrdersRoom', () => {
    it('debug-logs anonymous pre-auth denials without warning', async () => {
      const client = makeClient();
      const warnSpy = jest.spyOn(gatewayLogger(), 'warn');
      const debugSpy = jest.spyOn(gatewayLogger(), 'debug');

      await gateway.handleJoinRestaurantOrdersRoom(
        'rest-1',
        client as unknown as import('socket.io').Socket,
      );

      expect(client.join).not.toHaveBeenCalled();
      expect(warnSpy).not.toHaveBeenCalled();
      expect(debugSpy).toHaveBeenCalledWith(
        expect.stringContaining('Denied restaurant orders room join'),
      );
    });

    it('allows an authorized paid-tier owner into the live orders room', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({
        role: 'OWNER',
        restaurantId: null,
        isActive: true,
        disabledAt: null,
      });
      mockPrisma.restaurant.findUnique.mockResolvedValue({
        ownerId: 'user-1',
        isActive: true,
        tier: 'STARTER',
        forceTier: null,
      });
      const client = makeClient({ userId: 'user-1' });

      await gateway.handleJoinRestaurantOrdersRoom(
        'rest-1',
        client as unknown as import('socket.io').Socket,
      );

      expect(client.join).toHaveBeenCalledWith('restaurant_orders_rest-1');
      expect(mockFeatureService.restaurantHasFeature).toHaveBeenCalled();
    });

    it('rejects authorized users when the restaurant lacks orders:receive', async () => {
      mockFeatureService.restaurantHasFeature.mockReturnValue(false);
      mockPrisma.user.findUnique.mockResolvedValue({
        role: 'OWNER',
        restaurantId: null,
        isActive: true,
        disabledAt: null,
      });
      mockPrisma.restaurant.findUnique.mockResolvedValue({
        ownerId: 'user-1',
        isActive: true,
        tier: 'FREE',
        forceTier: null,
      });
      const client = makeClient({ userId: 'user-1' });

      await gateway.handleJoinRestaurantOrdersRoom(
        'rest-1',
        client as unknown as import('socket.io').Socket,
      );

      expect(client.join).not.toHaveBeenCalled();
      expect(client.emit).toHaveBeenCalledWith(
        'roomError',
        expect.objectContaining({
          room: 'restaurant-orders',
          restaurantId: 'rest-1',
          error: 'FEATURE_LOCKED',
        }),
      );
    });

    it('keeps the super-admin bypass for support access', async () => {
      mockFeatureService.restaurantHasFeature.mockReturnValue(false);
      mockPrisma.user.findUnique.mockResolvedValue({
        role: 'SUPER_ADMIN',
        restaurantId: null,
        isActive: true,
        disabledAt: null,
      });
      mockPrisma.restaurant.findUnique.mockResolvedValue({
        ownerId: 'someone-else',
        isActive: true,
        tier: 'FREE',
        forceTier: null,
      });
      const client = makeClient({ userId: 'admin-1' });

      await gateway.handleJoinRestaurantOrdersRoom(
        'rest-1',
        client as unknown as import('socket.io').Socket,
      );

      expect(client.join).toHaveBeenCalledWith('restaurant_orders_rest-1');
      expect(mockFeatureService.restaurantHasFeature).not.toHaveBeenCalled();
    });
  });

  describe('handleJoinTableSessionRoom', () => {
    it('joins a public table-session room when the session token exists', async () => {
      mockPrisma.tableSession.findUnique.mockResolvedValue({ id: 'session-1' });
      const client = makeClient();

      const result = await gateway.handleJoinTableSessionRoom(
        { token: 'session-token' },
        client as unknown as import('socket.io').Socket,
      );

      expect(mockPrisma.tableSession.findUnique).toHaveBeenCalledWith({
        where: { token: 'session-token' },
        select: { id: true },
      });
      expect(client.join).toHaveBeenCalledWith('table_session_session-1');
      expect(result).toEqual({
        event: 'joinedTableSessionRoom',
        data: 'session-1',
      });
    });

    it('rejects missing or unknown table-session tokens', async () => {
      mockPrisma.tableSession.findUnique.mockResolvedValue(null);
      const client = makeClient();

      const result = await gateway.handleJoinTableSessionRoom(
        { token: 'missing-token' },
        client as unknown as import('socket.io').Socket,
      );

      expect(client.join).not.toHaveBeenCalled();
      expect(client.emit).toHaveBeenCalledWith(
        'roomError',
        expect.objectContaining({
          room: 'table-session',
          error: 'UNAUTHORIZED',
        }),
      );
      expect(result).toEqual({ event: 'roomError', data: 'table-session' });
    });
  });

  describe('handleJoinPublicMenuRoom', () => {
    it('joins the public menu room for any restaurantId — no auth required', () => {
      const client = makeClient();

      const result = gateway.handleJoinPublicMenuRoom(
        'rest-1',
        client as unknown as import('socket.io').Socket,
      );

      expect(client.join).toHaveBeenCalledWith('public_menu_rest-1');
      expect(result).toEqual({ event: 'joinedPublicMenuRoom', data: 'rest-1' });
    });

    it('rejects a missing restaurantId', () => {
      const client = makeClient();

      const result = gateway.handleJoinPublicMenuRoom(
        undefined as unknown as string,
        client as unknown as import('socket.io').Socket,
      );

      expect(client.join).not.toHaveBeenCalled();
      expect(result).toEqual({ event: 'roomError', data: 'public-menu' });
    });

    it('leaves the public menu room', () => {
      const client = makeClient();

      const result = gateway.handleLeavePublicMenuRoom(
        'rest-1',
        client as unknown as import('socket.io').Socket,
      );

      expect(client.leave).toHaveBeenCalledWith('public_menu_rest-1');
      expect(result).toEqual({ event: 'leftPublicMenuRoom', data: 'rest-1' });
    });

    // Security review: no auth check gates this handler (restaurantId is
    // already public), so a single socket spamming distinct IDs must not be
    // able to grow the Socket.IO adapter's room-membership maps unbounded.
    it('caps distinct public menu rooms joined per socket', () => {
      const client = makeClient();

      for (let i = 0; i < 5; i++) {
        const result = gateway.handleJoinPublicMenuRoom(
          `rest-${i}`,
          client as unknown as import('socket.io').Socket,
        );
        expect(result).toEqual({
          event: 'joinedPublicMenuRoom',
          data: `rest-${i}`,
        });
      }
      expect(client.join).toHaveBeenCalledTimes(5);

      const rejected = gateway.handleJoinPublicMenuRoom(
        'rest-5',
        client as unknown as import('socket.io').Socket,
      );

      expect(rejected).toEqual({ event: 'roomError', data: 'public-menu' });
      expect(client.join).toHaveBeenCalledTimes(5);
    });

    it('does not count re-joining the same room twice against the cap', () => {
      const client = makeClient();

      for (let i = 0; i < 5; i++) {
        gateway.handleJoinPublicMenuRoom(
          `rest-${i}`,
          client as unknown as import('socket.io').Socket,
        );
      }
      const result = gateway.handleJoinPublicMenuRoom(
        'rest-0',
        client as unknown as import('socket.io').Socket,
      );

      expect(result).toEqual({ event: 'joinedPublicMenuRoom', data: 'rest-0' });
    });
  });

  describe('emitPublicMenuItemAvailability', () => {
    it('emits to the restaurant-scoped public menu room only', () => {
      const server = { to: jest.fn().mockReturnThis(), emit: jest.fn() };
      gateway['server'] = server as unknown as import('socket.io').Server;

      gateway.emitPublicMenuItemAvailability('rest-1', {
        itemId: 'item-1',
        categoryId: 'cat-1',
        isOutOfStock: true,
      });

      expect(server.to).toHaveBeenCalledWith('public_menu_rest-1');
      expect(server.emit).toHaveBeenCalledWith(
        'menu:item-availability-changed',
        { itemId: 'item-1', categoryId: 'cat-1', isOutOfStock: true },
      );
    });
  });

  describe('handleJoinOrderRoom', () => {
    it('joins when the token matches the orderId', () => {
      mockJwt.verify.mockReturnValue({
        scope: 'order-track',
        orderId: 'order-1',
      });
      const client = makeClient();

      gateway.handleJoinOrderRoom(
        { orderId: 'order-1', token: 't' },
        client as unknown as import('socket.io').Socket,
      );

      expect(client.join).toHaveBeenCalledWith('order_order-1');
    });

    it('rejects when the token is for a different order', () => {
      mockJwt.verify.mockReturnValue({
        scope: 'order-track',
        orderId: 'order-OTHER',
      });
      const client = makeClient();

      gateway.handleJoinOrderRoom(
        { orderId: 'order-1', token: 't' },
        client as unknown as import('socket.io').Socket,
      );

      expect(client.join).not.toHaveBeenCalled();
      expect(client.emit).toHaveBeenCalledWith(
        'roomError',
        expect.objectContaining({ orderId: 'order-1' }),
      );
    });

    it('rejects a normal auth token (no order-track scope)', () => {
      mockJwt.verify.mockReturnValue({ sub: 'user-1', email: 'a@b.c' });
      const client = makeClient();

      gateway.handleJoinOrderRoom(
        { orderId: 'order-1', token: 't' },
        client as unknown as import('socket.io').Socket,
      );

      expect(client.join).not.toHaveBeenCalled();
    });

    it('rejects when token is missing', () => {
      const client = makeClient();

      gateway.handleJoinOrderRoom(
        { orderId: 'order-1', token: '' },
        client as unknown as import('socket.io').Socket,
      );

      expect(client.join).not.toHaveBeenCalled();
      expect(mockJwt.verify).not.toHaveBeenCalled();
    });
  });

  // ─── signOrderToken: issuance ────────────────────────────────────────────

  describe('handleJoinReservationRoom', () => {
    it('joins the reservation room when the private manage token matches the restaurant', async () => {
      mockPrisma.reservation.findUnique.mockResolvedValue({
        id: 'reservation-1',
        restaurantId: 'rest-1',
        status: 'PENDING',
      });
      const client = makeClient();

      await gateway.handleJoinReservationRoom(
        { restaurantId: 'rest-1', token: 'manage-secret' },
        client as unknown as import('socket.io').Socket,
      );

      expect(mockPrisma.reservation.findUnique).toHaveBeenCalledWith({
        where: { manageToken: 'manage-secret' },
        select: { id: true, restaurantId: true, status: true },
      });
      expect(client.join).toHaveBeenCalledWith('reservation_reservation-1');
      expect(client.emit).toHaveBeenCalledWith('reservation:updated', {
        id: 'reservation-1',
        status: 'PENDING',
      });
    });

    it('rejects a manage token replayed against another restaurant', async () => {
      mockPrisma.reservation.findUnique.mockResolvedValue({
        id: 'reservation-1',
        restaurantId: 'rest-other',
        status: 'PENDING',
      });
      const client = makeClient();

      await gateway.handleJoinReservationRoom(
        { restaurantId: 'rest-1', token: 'manage-secret' },
        client as unknown as import('socket.io').Socket,
      );

      expect(client.join).not.toHaveBeenCalled();
      expect(client.emit).toHaveBeenCalledWith('roomError', {
        room: 'reservation',
        restaurantId: 'rest-1',
        error: 'UNAUTHORIZED',
      });
    });
  });

  describe('emitReservationUpdated', () => {
    it('notifies both the private dashboard room and the scoped guest room', () => {
      const server = { to: jest.fn().mockReturnThis(), emit: jest.fn() };
      gateway['server'] = server as unknown as import('socket.io').Server;

      gateway.emitReservationUpdated('rest-1', {
        id: 'reservation-1',
        status: 'CONFIRMED',
      });

      expect(server.to).toHaveBeenCalledWith('restaurant_rest-1');
      expect(server.to).toHaveBeenCalledWith('reservation_reservation-1');
      expect(server.emit).toHaveBeenCalledWith('reservation:updated', {
        id: 'reservation-1',
        status: 'CONFIRMED',
      });
    });
  });

  describe('signOrderToken', () => {
    it('signs an order-track scoped token for the given orderId', () => {
      const token = gateway.signOrderToken('order-9');

      expect(token).toBe('signed-token');
      expect(mockJwt.sign).toHaveBeenCalledWith(
        { scope: 'order-track', orderId: 'order-9' },
        expect.objectContaining({ expiresIn: expect.any(String) }),
      );
    });
  });

  describe('dispatchPaidOrder', () => {
    it('notifies the restaurant of the status change and routes the paid order to printers', async () => {
      const emit = jest.fn();
      const to = jest.fn().mockReturnValue({ emit });
      gateway['server'] = { to } as unknown as import('socket.io').Server;

      await gateway.dispatchPaidOrder('rest-1', 'order-1');

      expect(to).toHaveBeenCalledWith('restaurant_orders_rest-1');
      expect(to).toHaveBeenCalledWith('order_order-1');
      expect(emit).toHaveBeenCalledWith('orderStatusChanged', {
        id: 'order-1',
        status: 'NEW',
      });
      expect(mockPrintStationService.routeOrderToPrinters).toHaveBeenCalledWith(
        'order-1',
      );
    });
  });

  describe('disconnectAgentByTokenId', () => {
    it('uses cluster-aware fetchSockets and disconnects only sockets with the revoked token', async () => {
      const revokedSocket = {
        data: { agentTokenId: 'token-1' },
        emit: jest.fn(),
        disconnect: jest.fn(),
      };
      const otherSocket = {
        data: { agentTokenId: 'token-2' },
        emit: jest.fn(),
        disconnect: jest.fn(),
      };
      const fetchSockets = jest
        .fn()
        .mockResolvedValue([revokedSocket, otherSocket]);
      const inRoom = jest.fn().mockReturnValue({ fetchSockets });
      gateway['server'] = {
        in: inRoom,
      } as unknown as import('socket.io').Server;

      await gateway.disconnectAgentByTokenId('rest-1', 'station-1', 'token-1');

      expect(inRoom).toHaveBeenCalledWith('print:rest-1:station-1');
      expect(fetchSockets).toHaveBeenCalledTimes(1);
      expect(revokedSocket.emit).toHaveBeenCalledWith(
        'agent:rejected',
        'token_revoked',
      );
      expect(revokedSocket.disconnect).toHaveBeenCalled();
      expect(otherSocket.disconnect).not.toHaveBeenCalled();
    });
  });

  describe('evictDeviceToken', () => {
    it('disconnects only sockets authenticated with the revoked device token', async () => {
      const revokedSocket = {
        data: { deviceTokenId: 'device-token-1' },
        emit: jest.fn(),
        disconnect: jest.fn(),
      };
      const otherSocket = {
        data: { deviceTokenId: 'device-token-2' },
        emit: jest.fn(),
        disconnect: jest.fn(),
      };
      gateway['server'] = {
        fetchSockets: jest.fn().mockResolvedValue([revokedSocket, otherSocket]),
      } as unknown as import('socket.io').Server;

      await gateway.evictDeviceToken('device-token-1');

      expect(revokedSocket.emit).toHaveBeenCalledWith(
        'auth:evicted',
        'device_revoked',
      );
      expect(revokedSocket.disconnect).toHaveBeenCalled();
      expect(otherSocket.disconnect).not.toHaveBeenCalled();
    });
  });
});
