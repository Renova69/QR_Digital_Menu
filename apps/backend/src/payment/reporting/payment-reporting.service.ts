import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { PaymentStatus } from '@prisma/client';
import { PaymentHistoryQueryDto } from '../dto/payment-history-query.dto';
import { PaymentCoreService } from '../core/payment-core.service';

@Injectable()
export class PaymentReportingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly core: PaymentCoreService,
  ) {}

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
    await this.core.verifyRestaurantAccess(restaurantId, userId);

    const page = filters.page ?? 1;
    const limit = Math.min(filters.limit ?? 20, 50);
    const skip = (page - 1) * limit;

    const where: any = { restaurantId };
    if (filters.status) {
      where.status = filters.status;
    } else {
      where.status = { not: 'ABANDONED' };
    }
    if (filters.startDate || filters.endDate) {
      where.createdAt = {};
      if (filters.startDate) where.createdAt.gte = new Date(filters.startDate);
      if (filters.endDate) where.createdAt.lte = new Date(filters.endDate);
    }

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

  async exportPayments(
    restaurantId: string,
    userId: string,
    filters: { from?: string; to?: string },
  ): Promise<any[]> {
    await this.core.verifyRestaurantAccess(restaurantId, userId);

    const where: any = { restaurantId, status: { not: 'ABANDONED' } };
    if (filters.from || filters.to) {
      where.createdAt = {};
      if (filters.from) where.createdAt.gte = new Date(filters.from);
      if (filters.to) where.createdAt.lte = new Date(filters.to);
    }

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
    });

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
    const dateFilter: { gte?: Date; lte?: Date } = {};
    if (filters.startDate) dateFilter.gte = new Date(filters.startDate);
    if (filters.endDate) {
      const end = new Date(filters.endDate);
      end.setHours(23, 59, 59, 999);
      dateFilter.lte = end;
    }

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
              orderBy: { createdAt: 'asc' },
              include: {
                items: {
                  include: {
                    menuItem: { select: { name: true, price: true } },
                  },
                },
                staff: { select: { name: true, email: true, role: true } },
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
    const orders = (payment.tableSession?.orders ?? []).map((order) => ({
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
      items: order.items.map((item: any) => ({
        name: item.menuItem?.name ?? 'Unknown item',
        quantity: item.quantity,
        unitPrice: item.menuItem?.price ?? 0,
        options: Array.isArray(item.selectedOptions)
          ? (item.selectedOptions as any[])
              .map((option: any) => option?.choiceName)
              .filter(Boolean)
          : [],
      })),
    }));

    return {
      ...mapped,
      table: payment.tableSession?.table ?? null,
      orders,
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
      note: 'Live payout timing and bank account details are managed by the selected payment provider.',
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
