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

  const makeClient = (data: Record<string, any> = {}) => ({
    id: 'sock-1',
    data,
    handshake: { headers: {} as { cookie?: string } },
    join: jest.fn(),
    leave: jest.fn(),
    emit: jest.fn(),
  });

  let mockPrintStationService: any;

  beforeEach(() => {
    mockJwt = {
      verify: jest.fn(),
      sign: jest.fn().mockReturnValue('signed-token'),
    };
    mockPrisma = {
      user: { findUnique: jest.fn() },
      restaurant: { findUnique: jest.fn() },
    };
    mockPrintStationService = {
      validateAgentToken: jest.fn(),
      touchLastSeen: jest.fn(),
      retryPendingJobs: jest.fn().mockResolvedValue(undefined),
      handlePrintAck: jest.fn(),
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

      await gateway.handleConnection(client as any);

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

      await gateway.handleConnection(client as any);

      expect(client.data.userId).toBe('user-1');
      expect(client.data.deviceTokenId).toBe('device-token-1');
    });

    it('stays anonymous when no cookie is present (public order tracking)', async () => {
      const client = makeClient();

      await gateway.handleConnection(client as any);

      expect(client.data.userId).toBeUndefined();
    });

    it('stays anonymous when the token is invalid', async () => {
      mockJwt.verify.mockImplementation(() => {
        throw new Error('bad token');
      });
      const client = makeClient();
      client.handshake.headers.cookie = 'token=garbage';

      await gateway.handleConnection(client as any);

      expect(client.data.userId).toBeUndefined();
    });
  });

  // ─── joinRestaurantRoom: ownership/staff authorization ───────────────────

  describe('handleJoinRoom', () => {
    it('rejects anonymous sockets', async () => {
      const client = makeClient(); // no userId

      await gateway.handleJoinRoom('rest-1', client as any);

      expect(client.join).not.toHaveBeenCalled();
      expect(client.emit).toHaveBeenCalledWith(
        'roomError',
        expect.objectContaining({ restaurantId: 'rest-1' }),
      );
    });

    it('allows the owner', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({
        role: 'OWNER',
        restaurantId: null,
      });
      mockPrisma.restaurant.findUnique.mockResolvedValue({ ownerId: 'user-1' });
      const client = makeClient({ userId: 'user-1' });

      await gateway.handleJoinRoom('rest-1', client as any);

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

      await gateway.handleJoinRoom('rest-1', client as any);

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

      await gateway.handleJoinRoom('rest-1', client as any);

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

      await gateway.handleJoinRoom('rest-1', client as any);

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

      await gateway.handleJoinRoom('rest-1', client as any);

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

      await gateway.handleJoinRoom('rest-1', client as any);

      expect(client.join).not.toHaveBeenCalled();
    });
  });

  // ─── joinOrderRoom: order-scoped token ───────────────────────────────────

  describe('handleJoinRestaurantOrdersRoom', () => {
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

      await gateway.handleJoinRestaurantOrdersRoom('rest-1', client as any);

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

      await gateway.handleJoinRestaurantOrdersRoom('rest-1', client as any);

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

      await gateway.handleJoinRestaurantOrdersRoom('rest-1', client as any);

      expect(client.join).toHaveBeenCalledWith('restaurant_orders_rest-1');
      expect(mockFeatureService.restaurantHasFeature).not.toHaveBeenCalled();
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
        client as any,
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
        client as any,
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
        client as any,
      );

      expect(client.join).not.toHaveBeenCalled();
    });

    it('rejects when token is missing', () => {
      const client = makeClient();

      gateway.handleJoinOrderRoom(
        { orderId: 'order-1', token: '' },
        client as any,
      );

      expect(client.join).not.toHaveBeenCalled();
      expect(mockJwt.verify).not.toHaveBeenCalled();
    });
  });

  // ─── signOrderToken: issuance ────────────────────────────────────────────

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
      (gateway as any).server = { in: inRoom };

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
      (gateway as any).server = {
        fetchSockets: jest.fn().mockResolvedValue([revokedSocket, otherSocket]),
      };

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
