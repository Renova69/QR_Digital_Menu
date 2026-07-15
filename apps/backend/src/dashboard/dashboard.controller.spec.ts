import { Test, TestingModule } from '@nestjs/testing';
import { DashboardController } from './dashboard.controller';
import { DashboardService } from './dashboard.service';
import { PrismaService } from '../prisma/prisma.service';
import { FeatureService } from '../subscription/feature.service';
import { BadRequestException } from '@nestjs/common';

// Full analytics payload as DashboardService.getAnalytics returns it. The
// controller is responsible for downgrading this for tiers below PROFESSIONAL.
const FULL_PAYLOAD = {
  period: 7,
  revenueTrend: [{ date: '2026-06-20', revenue: 100, orders: 4 }],
  totalRevenue: 100,
  totalOrders: 4,
  activeCustomers: 2,
  avgOrderValue: 25,
  completionRate: 90,
  ordersByStatus: [],
  comparison: {
    revenueChange: 0,
    ordersChange: 0,
    activeCustomersChange: 0,
    avgOrderValueChange: 0,
  },
  // PROFESSIONAL-only drill-downs:
  topItems: [{ name: 'Burger', revenue: 60 }],
  peakHours: [{ label: '12:00', orders: 3, revenue: 70 }],
  categoryBreakdown: [{ category: 'Mains', revenue: 80 }],
  ordersByTable: [{ table: '1', revenue: 50, orders: 2 }],
  // PROFESSIONAL-only payment-derived metrics:
  collectedRevenue: 90,
  refundedAmount: 5,
  paymentsByMethod: [{ provider: 'STRIPE', amount: 90 }],
  repeatCustomerRate: 33.3,
};

const PRO_ONLY_KEYS = [
  'topItems',
  'peakHours',
  'categoryBreakdown',
  'ordersByTable',
  'collectedRevenue',
  'refundedAmount',
  'paymentsByMethod',
  'repeatCustomerRate',
];

const BASIC_KEYS = [
  'period',
  'revenueTrend',
  'totalRevenue',
  'totalOrders',
  'activeCustomers',
  'avgOrderValue',
  'completionRate',
  'ordersByStatus',
  'comparison',
];

describe('DashboardController analytics tier gating', () => {
  let controller: DashboardController;
  const mockPrisma: Record<string, any> = {
    restaurant: { findUnique: jest.fn() },
  };
  const mockDashboard = {
    getAnalytics: jest.fn(),
    getSummary: jest.fn(),
    getPaymentsSummary: jest.fn(),
  };

  const OWNER = { id: 'owner-1', role: 'OWNER' };

  const mockRestaurant = (tier: string, forceTier: string | null = null) => ({
    ownerId: OWNER.id,
    isActive: true,
    deletedAt: null,
    tier,
    forceTier,
  });

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [DashboardController],
      providers: [
        FeatureService, // real implementation — exercises the actual tier matrix
        { provide: DashboardService, useValue: mockDashboard },
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    controller = module.get<DashboardController>(DashboardController);
    jest.clearAllMocks();
    mockDashboard.getAnalytics.mockResolvedValue({ ...FULL_PAYLOAD });
  });

  it('strips all PRO-only fields for STARTER (ANALYTICS_BASIC, no ANALYTICS_FULL)', async () => {
    mockPrisma.restaurant.findUnique.mockResolvedValue(
      mockRestaurant('STARTER'),
    );

    const result = (await controller.getAnalytics(
      OWNER,
      'rest-1',
      '7',
    )) as Record<string, unknown>;

    for (const key of PRO_ONLY_KEYS) {
      expect(result).not.toHaveProperty(key);
    }
    for (const key of BASIC_KEYS) {
      expect(result).toHaveProperty(key);
    }
  });

  it('does not leak payment-method split or refund totals to STARTER', async () => {
    mockPrisma.restaurant.findUnique.mockResolvedValue(
      mockRestaurant('STARTER'),
    );

    const result = (await controller.getAnalytics(
      OWNER,
      'rest-1',
      '7',
    )) as Record<string, unknown>;

    expect(result.paymentsByMethod).toBeUndefined();
    expect(result.refundedAmount).toBeUndefined();
    expect(result.collectedRevenue).toBeUndefined();
  });

  it('returns the full payload for PROFESSIONAL', async () => {
    mockPrisma.restaurant.findUnique.mockResolvedValue(
      mockRestaurant('PROFESSIONAL'),
    );

    const result = (await controller.getAnalytics(
      OWNER,
      'rest-1',
      '7',
    )) as Record<string, unknown>;

    for (const key of [...BASIC_KEYS, ...PRO_ONLY_KEYS]) {
      expect(result).toHaveProperty(key);
    }
  });

  it('returns the full payload for ENTERPRISE', async () => {
    mockPrisma.restaurant.findUnique.mockResolvedValue(
      mockRestaurant('ENTERPRISE'),
    );

    const result = (await controller.getAnalytics(
      OWNER,
      'rest-1',
      '7',
    )) as Record<string, unknown>;

    expect(result).toHaveProperty('paymentsByMethod');
    expect(result).toHaveProperty('topItems');
  });

  it('honors super-admin forceTier=PROFESSIONAL on a STARTER restaurant', async () => {
    mockPrisma.restaurant.findUnique.mockResolvedValue(
      mockRestaurant('STARTER', 'PROFESSIONAL'),
    );

    const result = (await controller.getAnalytics(
      OWNER,
      'rest-1',
      '7',
    )) as Record<string, unknown>;

    expect(result).toHaveProperty('paymentsByMethod');
    expect(result).toHaveProperty('repeatCustomerRate');
  });

  it('accepts Today and forwards the normalized dashboard language', async () => {
    mockPrisma.restaurant.findUnique.mockResolvedValue(
      mockRestaurant('PROFESSIONAL'),
    );

    await controller.getAnalytics(OWNER, 'rest-1', '1', undefined, 'EN-us');

    expect(mockDashboard.getAnalytics).toHaveBeenCalledWith(
      'rest-1',
      1,
      undefined,
      undefined,
      true,
      'en',
    );
  });

  it('rejects unsupported dashboard languages', async () => {
    mockPrisma.restaurant.findUnique.mockResolvedValue(
      mockRestaurant('PROFESSIONAL'),
    );

    await expect(
      controller.getAnalytics(OWNER, 'rest-1', '1', undefined, 'unsupported'),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(mockDashboard.getAnalytics).not.toHaveBeenCalled();
  });

  it('forwards Today to the payment summary', async () => {
    mockPrisma.restaurant.findUnique.mockResolvedValue(
      mockRestaurant('PROFESSIONAL'),
    );

    await controller.getPaymentsSummary(OWNER, 'rest-1', {}, '1');

    expect(mockDashboard.getPaymentsSummary).toHaveBeenCalledWith(
      'rest-1',
      undefined,
      undefined,
      1,
    );
  });

  it('rejects an unsupported payment-summary period', async () => {
    await expect(
      controller.getPaymentsSummary(OWNER, 'rest-1', {}, '2'),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(mockDashboard.getPaymentsSummary).not.toHaveBeenCalled();
  });
});
