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
    gateway = new EventsGateway(mockJwt, mockPrisma, mockPrintStationService);
  });

  // ─── handleConnection: handshake auth ────────────────────────────────────

  describe('handleConnection', () => {
    it('attaches userId when a valid token cookie is present', () => {
      mockJwt.verify.mockReturnValue({ sub: 'user-1', email: 'a@b.c' });
      const client = makeClient();
      client.handshake.headers.cookie = 'foo=bar; token=valid.jwt.here';

      gateway.handleConnection(client as any);

      expect(client.data.userId).toBe('user-1');
    });

    it('stays anonymous when no cookie is present (public order tracking)', () => {
      const client = makeClient();

      gateway.handleConnection(client as any);

      expect(client.data.userId).toBeUndefined();
    });

    it('stays anonymous when the token is invalid', () => {
      mockJwt.verify.mockImplementation(() => {
        throw new Error('bad token');
      });
      const client = makeClient();
      client.handshake.headers.cookie = 'token=garbage';

      gateway.handleConnection(client as any);

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
});
