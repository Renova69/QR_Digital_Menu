import {
  ConflictException,
  Injectable,
  NotFoundException,
  PayloadTooLargeException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { PaymentReconciliationStatus, PaymentStatus } from '@prisma/client';
import { PaymentHistoryQueryDto } from '../dto/payment-history-query.dto';
import { PaymentCoreService } from '../core/payment-core.service';
import { buildRestaurantDateRange } from '../../common/restaurant-date-range';
import { PAYMENT_AMOUNT_TOLERANCE } from '../payment.constants';

const MAX_PAYMENT_EXPORT_ROWS = 5_000;

@Injectable()
export class PaymentReportingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly core: PaymentCoreService,
  ) {}

  private applyPaymentFilters(
    where: Record<string, unknown>,
    filters: { status?: string; provider?: string; search?: string },
  ) {
    where.status = filters.status ? filters.status : { not: 'ABANDONED' };
    if (filters.provider) where.provider = filters.provider;
    const search = filters.search?.trim();
    if (!search) return;

    where.OR = [
      { id: { contains: search, mode: 'insensitive' } },
      { tableSessionId: { contains: search, mode: 'insensitive' } },
      { stripePaymentIntentId: { contains: search, mode: 'insensitive' } },
      { providerReference: { contains: search, mode: 'insensitive' } },
      {
        tableSession: {
          is: { table: { name: { contains: search, mode: 'insensitive' } } },
        },
      },
      {
        tableSession: {
          is: {
            orders: {
              some: {
                customerName: { contains: search, mode: 'insensitive' },
              },
            },
          },
        },
      },
    ];
    const normalized = search.toUpperCase();
    if (['STRIPE', 'EPAY', 'BORICA', 'MYPOS', 'CASH'].includes(normalized)) {
      (where.OR as unknown[]).push({ provider: normalized });
    }
    if (
      ['PENDING', 'SUCCEEDED', 'FAILED', 'REFUNDED', 'ABANDONED'].includes(
        normalized,
      )
    ) {
      (where.OR as unknown[]).push({ status: normalized });
    }
  }

  async getTableSessions(
    restaurantId: string,
    page: number | undefined,
    limit: number | undefined,
    userId: string,
  ): Promise<{
    data: any[];
    meta: { total: number; page: number; limit: number };
  }> {
    // Access check is mandatory — the guard belongs to the method, not the
    // caller, so a future internal caller can't accidentally skip it (#L2).
    await this.core.verifyRestaurantAccess(restaurantId, userId);

    const take = limit ?? 50;
    const skip = page ? (page - 1) * take : 0;

    const where = { restaurantId, status: { in: ['OPEN', 'PAID'] as any } };
    const [data, total] = await Promise.all([
      this.prisma.tableSession.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take,
      }),
      this.prisma.tableSession.count({ where }),
    ]);

    return {
      data,
      meta: { total, page: page ?? 1, limit: take },
    };
  }

  async getPaymentHistory(
    restaurantId: string,
    filters: {
      status?: string;
      provider?: string;
      search?: string;
      startDate?: string;
      endDate?: string;
      page?: number;
      limit?: number;
    },
    userId: string,
  ): Promise<{
    data: any[];
    meta: { total: number; page: number; limit: number };
  }> {
    // Mandatory access check (#L2) — see getTableSessions.
    const restaurant = await this.core.verifyRestaurantAccess(
      restaurantId,
      userId,
    );

    const page = filters.page ?? 1;
    const limit = Math.min(filters.limit ?? 20, 50);
    const skip = (page - 1) * limit;

    const where: any = { restaurantId };
    this.applyPaymentFilters(where, filters);
    const dateRange = buildRestaurantDateRange(
      filters.startDate,
      filters.endDate,
      restaurant.timezone ?? 'UTC',
    );
    if (Object.keys(dateRange).length > 0) where.createdAt = dateRange;

    const [data, total] = await Promise.all([
      this.prisma.payment.findMany({
        where,
        include: {
          tableSession: {
            include: {
              table: { select: { name: true } },
              orders: {
                select: { customerName: true },
                orderBy: { createdAt: 'desc' },
                take: 1,
              },
            },
          },
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      this.prisma.payment.count({ where }),
    ]);

    return {
      data: data.map((payment) => this.core.mapPayment(payment)),
      meta: { total, page, limit },
    };
  }

  async getPaymentReconciliationIssues(
    restaurantId: string,
    userId: string,
    status: PaymentReconciliationStatus = PaymentReconciliationStatus.OPEN,
  ) {
    await this.core.verifyRestaurantAccess(restaurantId, userId);

    return this.prisma.paymentReconciliationIssue.findMany({
      where: { restaurantId, status },
      include: {
        payment: {
          select: {
            id: true,
            status: true,
            provider: true,
            amount: true,
            currency: true,
            tipAmount: true,
            providerReference: true,
            stripePaymentIntentId: true,
            createdAt: true,
          },
        },
        tableSession: {
          select: {
            id: true,
            status: true,
            table: { select: { name: true } },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
  }

  async resolvePaymentReconciliationIssue(
    issueId: string,
    userId: string,
    status: 'RESOLVED' | 'DISMISSED',
    note?: string,
  ) {
    const issue = await this.prisma.paymentReconciliationIssue.findUnique({
      where: { id: issueId },
      select: { id: true, restaurantId: true, status: true },
    });
    if (!issue) throw new NotFoundException('Reconciliation issue not found');

    await this.core.verifyRestaurantAccess(issue.restaurantId, userId);
    if (issue.status !== PaymentReconciliationStatus.OPEN) {
      throw new ConflictException('Reconciliation issue is already closed');
    }

    const updated = await this.prisma.paymentReconciliationIssue.updateMany({
      where: { id: issueId, status: PaymentReconciliationStatus.OPEN },
      data: {
        status,
        resolutionNote: note?.trim() || null,
        resolvedById: userId,
        resolvedAt: new Date(),
      },
    });
    if (updated.count === 0) {
      throw new ConflictException(
        'Reconciliation issue was resolved by another user',
      );
    }

    return this.prisma.paymentReconciliationIssue.findUnique({
      where: { id: issueId },
    });
  }

  async exportPayments(
    restaurantId: string,
    userId: string,
    filters: {
      from?: string;
      to?: string;
      status?: string;
      provider?: string;
      search?: string;
    },
  ): Promise<any[]> {
    const restaurant = await this.core.verifyRestaurantAccess(
      restaurantId,
      userId,
    );

    const where: any = { restaurantId };
    this.applyPaymentFilters(where, filters);
    const dateRange = buildRestaurantDateRange(
      filters.from,
      filters.to,
      restaurant.timezone ?? 'UTC',
    );
    if (Object.keys(dateRange).length > 0) where.createdAt = dateRange;

    const data = await this.prisma.payment.findMany({
      where,
      include: {
        tableSession: {
          include: {
            table: { select: { name: true } },
            orders: {
              select: { customerName: true },
              orderBy: { createdAt: 'desc' },
              take: 1,
            },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
      take: MAX_PAYMENT_EXPORT_ROWS + 1,
    });

    if (data.length > MAX_PAYMENT_EXPORT_ROWS) {
      throw new PayloadTooLargeException(
        `Payment export exceeds ${MAX_PAYMENT_EXPORT_ROWS} rows; narrow the date range or filters`,
      );
    }

    return data.map((payment) => this.core.mapPayment(payment));
  }

  async getPaymentsOverview(
    restaurantId: string,
    userId: string,
    filters: { startDate?: string; endDate?: string } = {},
  ) {
    const restaurant = await this.core.verifyRestaurantAccess(
      restaurantId,
      userId,
    );
    const dateFilter = buildRestaurantDateRange(
      filters.startDate,
      filters.endDate,
      restaurant.timezone ?? 'UTC',
    );

    const where = {
      restaurantId,
      ...(Object.keys(dateFilter).length > 0 ? { createdAt: dateFilter } : {}),
    };
    const visibleWhere = { ...where, status: { not: PaymentStatus.ABANDONED } };

    const [
      collected,
      tips,
      fees,
      refunds,
      successfulCount,
      refundCount,
      statusCounts,
      methodTotals,
      latestPayment,
    ] = await Promise.all([
      this.prisma.payment.aggregate({
        _sum: { amount: true },
        where: { ...where, status: 'SUCCEEDED' },
      }),
      this.prisma.payment.aggregate({
        _sum: { tipAmount: true },
        where: { ...where, status: 'SUCCEEDED' },
      }),
      this.prisma.payment.aggregate({
        _sum: { platformFeeAmount: true },
        where: { ...where, status: 'SUCCEEDED' },
      }),
      this.prisma.payment.aggregate({
        _sum: { amount: true },
        where: { ...where, status: 'REFUNDED' },
      }),
      this.prisma.payment.count({ where: { ...where, status: 'SUCCEEDED' } }),
      this.prisma.payment.count({ where: { ...where, status: 'REFUNDED' } }),
      this.prisma.payment.groupBy({
        by: ['status'],
        _count: true,
        where: visibleWhere,
      }),
      this.prisma.payment.groupBy({
        by: ['provider'],
        _sum: { amount: true, platformFeeAmount: true },
        _count: true,
        where: { ...where, status: 'SUCCEEDED' },
      }),
      this.prisma.payment.findFirst({
        where: visibleWhere,
        orderBy: { createdAt: 'desc' },
        select: { createdAt: true, currency: true },
      }),
    ]);

    const totalCollected = this.core.roundMoney(collected._sum.amount ?? 0);
    const platformFees = this.core.roundMoney(fees._sum.platformFeeAmount ?? 0);

    return {
      account: {
        paymentsEnabled: restaurant.paymentsEnabled,
        stripeOnboarded: restaurant.stripeOnboarded,
        stripeAccountId: restaurant.stripeAccountId,
        epayEnabled: restaurant.epayEnabled,
        epayMode: restaurant.epayMode,
        epayClientId: restaurant.epayClientId,
        epayMerchantEmail: restaurant.epayMerchantEmail,
        epayPage: restaurant.epayPage,
        epaySecretConfigured: !!restaurant.epaySecretEncrypted,
        boricaEnabled: restaurant.boricaEnabled,
        boricaMode: restaurant.boricaMode,
        boricaTerminalId: restaurant.boricaTerminalId,
        boricaMerchantId: restaurant.boricaMerchantId,
        boricaMerchantName: restaurant.boricaMerchantName,
        boricaPublicCert: restaurant.boricaPublicCert,
        boricaCurrency: restaurant.boricaCurrency,
        boricaPrivateKeyConfigured: !!restaurant.boricaPrivateKeyEncrypted,
        myposEnabled: restaurant.myposEnabled,
        myposMode: restaurant.myposMode,
        myposClientNumber: restaurant.myposClientNumber,
        myposStoreId: restaurant.myposStoreId,
        myposKeyIndex: restaurant.myposKeyIndex,
        myposPublicCert: restaurant.myposPublicCert,
        myposCurrency: restaurant.myposCurrency,
        myposPrivateKeyConfigured: !!restaurant.myposPrivateKeyEncrypted,
        platformFeePercent: restaurant.platformFeePercent,
        tipsEnabled: restaurant.tipsEnabled,
        tipOptions: restaurant.tipOptions,
      },
      metrics: {
        totalCollected,
        averageTransaction: successfulCount
          ? this.core.roundMoney(totalCollected / successfulCount)
          : 0,
        tipsCollected: this.core.roundMoney(tips._sum.tipAmount ?? 0),
        platformFees,
        refundsIssued: this.core.roundMoney(refunds._sum.amount ?? 0),
        netCollected: this.core.roundMoney(totalCollected - platformFees),
        successfulTransactions: successfulCount,
        refundsCount: refundCount,
      },
      statusCounts: (
        statusCounts as Array<{ status: string; _count: number }>
      ).map((item) => ({
        status: item.status,
        count: item._count,
      })),
      methodTotals: methodTotals.map(
        (item: {
          provider: string;
          _sum: { amount: number | null; platformFeeAmount: number | null };
          _count: number;
        }) => ({
          method: item.provider,
          amount: this.core.roundMoney(item._sum.amount ?? 0),
          fees: this.core.roundMoney(item._sum.platformFeeAmount ?? 0),
          count: item._count,
        }),
      ),
      currency: latestPayment?.currency ?? 'eur',
      latestPaymentAt: latestPayment?.createdAt ?? null,
    };
  }

  async getPaymentDetail(paymentId: string, userId: string) {
    const payment = await this.prisma.payment.findUnique({
      where: { id: paymentId },
      include: {
        tableSession: {
          include: {
            table: { select: { id: true, name: true } },
            orders: {
              where: { status: { not: 'CANCELED' } },
              orderBy: { createdAt: 'asc' },
              include: {
                items: {
                  select: {
                    itemName: true,
                    quantity: true,
                    unitPriceWithOptions: true,
                    selectedOptions: true,
                  },
                },
                staff: { select: { name: true, email: true, role: true } },
              },
            },
          },
        },
        allocations: {
          orderBy: { createdAt: 'asc' },
          include: {
            orderItem: {
              include: {
                order: {
                  include: {
                    staff: {
                      select: { name: true, email: true, role: true },
                    },
                  },
                },
              },
            },
          },
        },
      },
    });

    if (!payment) {
      throw new NotFoundException('Payment not found');
    }

    await this.core.verifyRestaurantAccess(payment.restaurantId, userId);

    const mapped = this.core.mapPayment(payment);
    const mapOptions = (selectedOptions: unknown) =>
      Array.isArray(selectedOptions)
        ? selectedOptions
            .map((option) =>
              typeof option === 'object' &&
              option !== null &&
              'choiceName' in option &&
              typeof option.choiceName === 'string'
                ? option.choiceName
                : null,
            )
            .filter((option): option is string => Boolean(option))
        : [];
    const fullSessionOrders = (payment.tableSession?.orders ?? []).map(
      (order) => ({
        id: order.id,
        customerName: order.customerName,
        customerPhone: order.customerPhone,
        totalPrice: order.totalPrice,
        status: order.status,
        specialRequests: order.specialRequests,
        createdAt: order.createdAt,
        source: order.source,
        staffName: order.staff ? (order.staff.name ?? order.staff.email) : null,
        staffRole: order.staff?.role ?? null,
        items: order.items.map((item) => ({
          name: item.itemName,
          quantity: item.quantity,
          unitPrice: item.unitPriceWithOptions,
          options: mapOptions(item.selectedOptions),
        })),
      }),
    );

    const allocatedOrders = new Map<
      string,
      {
        id: string;
        customerName: string;
        customerPhone: string | null;
        totalPrice: number;
        status: string;
        specialRequests: string | null;
        createdAt: Date;
        source: string;
        staffName: string | null;
        staffRole: string | null;
        items: Array<{
          name: string;
          quantity: number;
          unitPrice: number;
          options: string[];
        }>;
      }
    >();
    for (const allocation of payment.allocations ?? []) {
      const item = allocation.orderItem;
      const order = item.order;
      const current = allocatedOrders.get(order.id) ?? {
        id: order.id,
        customerName: order.customerName,
        customerPhone: order.customerPhone,
        totalPrice: 0,
        status: order.status,
        specialRequests: order.specialRequests,
        createdAt: order.createdAt,
        source: order.source,
        staffName: order.staff ? (order.staff.name ?? order.staff.email) : null,
        staffRole: order.staff?.role ?? null,
        items: [],
      };
      current.totalPrice = this.core.roundMoney(
        current.totalPrice + allocation.amount,
      );
      current.items.push({
        name: item.itemName,
        quantity: allocation.quantity,
        unitPrice: this.core.roundMoney(
          allocation.amount / allocation.quantity,
        ),
        options: mapOptions(item.selectedOptions),
      });
      allocatedOrders.set(order.id, current);
    }

    const hasAllocatedItems = (payment.allocations?.length ?? 0) > 0;
    const fullSessionTotal = this.core.roundMoney(
      fullSessionOrders.reduce((sum, order) => sum + order.totalPrice, 0),
    );
    const paymentSubtotal = this.core.roundMoney(
      payment.amount - payment.tipAmount,
    );
    const fullItemizationMatchesPayment =
      Math.abs(fullSessionTotal - paymentSubtotal) < PAYMENT_AMOUNT_TOLERANCE;
    const orders = payment.splitMode
      ? payment.splitMode === 'ITEM' && hasAllocatedItems
        ? [...allocatedOrders.values()]
        : []
      : fullItemizationMatchesPayment
        ? fullSessionOrders
        : [];
    const itemizationUnavailable = Boolean(
      (payment.splitMode &&
        (!hasAllocatedItems || payment.splitMode !== 'ITEM')) ||
      (!payment.splitMode &&
        fullSessionOrders.length > 0 &&
        !fullItemizationMatchesPayment),
    );

    return {
      ...mapped,
      table: payment.tableSession?.table ?? null,
      orders,
      splitMode: payment.splitMode,
      itemizationUnavailable,
      breakdown: {
        subtotal: this.core.roundMoney(payment.amount - payment.tipAmount),
        tip: payment.tipAmount,
        totalCharged: payment.amount,
        platformFee: payment.platformFeeAmount,
        net: mapped.netAmount,
      },
      timeline: [
        {
          label: `Payment ${mapped.statusLabel.toLowerCase()}`,
          at: payment.updatedAt,
        },
        { label: 'Payment record created', at: payment.createdAt },
        ...(payment.tableSession?.createdAt
          ? [
              {
                label: 'Table session opened',
                at: payment.tableSession.createdAt,
              },
            ]
          : []),
      ],
    };
  }

  async getPayoutsSnapshot(restaurantId: string, userId: string) {
    const overview = await this.getPaymentsOverview(restaurantId, userId);
    return {
      estimatedBalance: overview.metrics.netCollected,
      platformFees: overview.metrics.platformFees,
      totalCollected: overview.metrics.totalCollected,
      methodTotals: overview.methodTotals,
      stripeAccountId: overview.account.stripeAccountId,
      stripeOnboarded: overview.account.stripeOnboarded,
    };
  }

  async getPaymentSettings(restaurantId: string, userId: string) {
    const restaurant = await this.core.verifyRestaurantAccess(
      restaurantId,
      userId,
    );
    return {
      paymentsEnabled: restaurant.paymentsEnabled,
      stripeOnboarded: restaurant.stripeOnboarded,
      stripeAccountId: restaurant.stripeAccountId,
      epayEnabled: restaurant.epayEnabled,
      epayMode: restaurant.epayMode,
      epayClientId: restaurant.epayClientId,
      epayMerchantEmail: restaurant.epayMerchantEmail,
      epayPage: restaurant.epayPage,
      epaySecretConfigured: !!restaurant.epaySecretEncrypted,
      boricaEnabled: restaurant.boricaEnabled,
      boricaMode: restaurant.boricaMode,
      boricaTerminalId: restaurant.boricaTerminalId,
      boricaMerchantId: restaurant.boricaMerchantId,
      boricaMerchantName: restaurant.boricaMerchantName,
      boricaPublicCert: restaurant.boricaPublicCert,
      boricaCurrency: restaurant.boricaCurrency,
      boricaPrivateKeyConfigured: !!restaurant.boricaPrivateKeyEncrypted,
      myposEnabled: restaurant.myposEnabled,
      myposMode: restaurant.myposMode,
      myposClientNumber: restaurant.myposClientNumber,
      myposStoreId: restaurant.myposStoreId,
      myposKeyIndex: restaurant.myposKeyIndex,
      myposPublicCert: restaurant.myposPublicCert,
      myposCurrency: restaurant.myposCurrency,
      myposPrivateKeyConfigured: !!restaurant.myposPrivateKeyEncrypted,
      platformFeePercent: restaurant.platformFeePercent,
      tipsEnabled: restaurant.tipsEnabled,
      tipOptions: restaurant.tipOptions,
    };
  }
}
