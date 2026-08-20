import { Test, TestingModule } from '@nestjs/testing';
import { SuperAdminController } from './super-admin.controller';
import { SuperAdminService } from './super-admin.service';
import { RestaurantSlugService } from '../restaurants/slug/restaurant-slug.service';
import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { ReassignSlugDto } from './dto/update-tenant.dto';

describe('SuperAdminController', () => {
  let c: SuperAdminController;
  const mockSvc = {
    getStats: jest.fn(),
    getTenants: jest.fn(),
    getTenantById: jest.fn(),
    updateTier: jest.fn(),
    updateStatus: jest.fn(),
    resetOwnerPassword: jest.fn(),
    updatePaymentsEnabled: jest.fn(),
    deleteRestaurant: jest.fn(),
    restoreRestaurant: jest.fn(),
    deleteStaff: jest.fn(),
    importMenu: jest.fn(),
    getAuditLog: jest.fn(),
    forceLogoutOwner: jest.fn(),
    regenerateImportApiKey: jest.fn(),
    getTenantSessions: jest.fn(),
    forceCloseSession: jest.fn(),
    getLoyaltyAccounts: jest.fn(),
    adjustLoyaltyPoints: jest.fn(),
    clearLoyaltyPoints: jest.fn(),
    getMrr: jest.fn(),
    getDataRequests: jest.fn(),
    updateDataRequest: jest.fn(),
    createImpersonationSession: jest.fn(),
  };
  const mockSlugs = {
    reassignReleasedSlug: jest.fn(),
  };

  beforeEach(async () => {
    const m = await Test.createTestingModule({
      controllers: [SuperAdminController],
      providers: [
        { provide: SuperAdminService, useValue: mockSvc },
        { provide: RestaurantSlugService, useValue: mockSlugs },
      ],
    }).compile();
    c = m.get<SuperAdminController>(SuperAdminController);
  });
  afterEach(() => jest.clearAllMocks());

  it('getStats delegates', async () => {
    mockSvc.getStats.mockResolvedValue({ tenants: 5 });
    expect(await c.getStats()).toEqual({ tenants: 5 });
  });

  it('getTenants delegates with pagination and filters', async () => {
    mockSvc.getTenants.mockResolvedValue({ data: [], total: 0 });
    const r = await c.getTenants(1, 10, 'search', 'PRO', 'active');
    expect(mockSvc.getTenants).toHaveBeenCalledWith({
      page: 1,
      limit: 10,
      search: 'search',
      tier: 'PRO',
      status: 'active',
      subscription: undefined,
    });
    expect(r).toEqual({ data: [], total: 0 });
  });

  it('getTenant delegates', async () => {
    mockSvc.getTenantById.mockResolvedValue({ id: 'r1' });
    expect(await c.getTenant('r1')).toEqual({ id: 'r1' });
  });

  it('updateTier delegates with forceTier and expiry', async () => {
    const req = { user: { id: 'admin' } };
    mockSvc.updateTier.mockResolvedValue({ success: true });
    const r = await c.updateTier(
      'r1',
      { forceTier: 'PROFESSIONAL', forceTierExpiresInDays: 30 } as any,
      req,
    );
    expect(mockSvc.updateTier).toHaveBeenCalledWith(
      'r1',
      'PROFESSIONAL',
      'admin',
      30,
    );
    expect(r).toEqual({ success: true });
  });

  it('updateStatus delegates', async () => {
    const req = { user: { id: 'admin' } };
    mockSvc.updateStatus.mockResolvedValue({ success: true });
    await c.updateStatus('r1', { isActive: false } as any, req);
    expect(mockSvc.updateStatus).toHaveBeenCalledWith('r1', false, 'admin');
  });

  it('getAuditLog delegates with filters', async () => {
    mockSvc.getAuditLog.mockResolvedValue({ data: [], total: 0 });
    await c.getAuditLog(1, 20, 'r1', 'TIER_CHANGE');
    expect(mockSvc.getAuditLog).toHaveBeenCalledWith({
      page: 1,
      limit: 20,
      targetId: 'r1',
      action: 'TIER_CHANGE',
      dateFrom: undefined,
      dateTo: undefined,
    });
  });

  it('getLoyaltyAccounts delegates', async () => {
    mockSvc.getLoyaltyAccounts.mockResolvedValue([]);
    expect(await c.getLoyaltyAccounts('r1')).toEqual([]);
  });

  it('adjustLoyaltyPoints delegates', async () => {
    const req = { user: { id: 'admin' } };
    mockSvc.adjustLoyaltyPoints.mockResolvedValue({ points: 100 });
    await c.adjustLoyaltyPoints(
      'r1',
      { loyaltyAccountId: 'la1', delta: 50 } as any,
      req,
    );
    expect(mockSvc.adjustLoyaltyPoints).toHaveBeenCalledWith(
      'r1',
      'la1',
      50,
      null,
      'admin',
    );
  });

  it('getMrr delegates', async () => {
    mockSvc.getMrr.mockResolvedValue({ mrr: 5000 });
    expect(await c.getMrr()).toEqual({ mrr: 5000 });
  });

  it('getDataRequests delegates', async () => {
    mockSvc.getDataRequests.mockResolvedValue({ data: [] });
    await c.getDataRequests(1, 10, 'pending', 'export');
    expect(mockSvc.getDataRequests).toHaveBeenCalledWith({
      page: 1,
      limit: 10,
      status: 'pending',
      type: 'export',
    });
  });

  it('deleteRestaurant delegates with confirmation', async () => {
    const req = { user: { id: 'admin' } };
    await c.deleteRestaurant('r1', { confirmation: 'CONFIRM' } as any, req);
    expect(mockSvc.deleteRestaurant).toHaveBeenCalledWith('r1', 'admin');
  });

  it('restoreRestaurant delegates', async () => {
    const req = { user: { id: 'admin' } };
    await c.restoreRestaurant('r1', { confirmation: 'CONFIRM' } as any, req);
    expect(mockSvc.restoreRestaurant).toHaveBeenCalledWith('r1', 'admin');
  });

  it('impersonate delegates', async () => {
    const req = { user: { id: 'admin' } };
    mockSvc.createImpersonationSession.mockResolvedValue({ token: 'tok' });
    const r = await c.impersonate(
      'r1',
      { confirmation: 'CONFIRM' } as any,
      req,
    );
    expect(mockSvc.createImpersonationSession).toHaveBeenCalledWith(
      'r1',
      'admin',
    );
    expect(r).toEqual({ token: 'tok' });
  });

  it('getTenantSessions delegates', async () => {
    mockSvc.getTenantSessions.mockResolvedValue([]);
    await c.getTenantSessions('r1', 1, 20);
    expect(mockSvc.getTenantSessions).toHaveBeenCalledWith('r1', 1, 20);
  });

  it('reassigns a released slug through the namespace service', async () => {
    const req = { user: { id: 'super-admin-1' } };
    mockSlugs.reassignReleasedSlug.mockResolvedValue({
      slug: 'sold-business',
      restaurantId: 'buyer-restaurant',
      previousRestaurantId: 'seller-restaurant',
    });

    await c.reassignSlug(
      'sold-business',
      { targetRestaurantId: 'buyer-restaurant', confirmation: 'CONFIRM' },
      req,
    );

    expect(mockSlugs.reassignReleasedSlug).toHaveBeenCalledWith(
      'sold-business',
      'buyer-restaurant',
      'super-admin-1',
    );
  });
});

describe('ReassignSlugDto', () => {
  it('requires the exact server-validated CONFIRM token', async () => {
    const dto = plainToInstance(ReassignSlugDto, {
      targetRestaurantId: 'buyer-restaurant',
      confirmation: 'yes',
    });

    expect(await validate(dto)).not.toHaveLength(0);
  });
});
