import {
  Injectable,
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { EventsGateway } from '../../events/events.gateway';
import { FeatureService } from '../../subscription/feature.service';
import { FeatureFlag } from '../../subscription/feature-flag.enum';
import {
  CashPaymentRequestScope,
  CashPaymentRequestStatus,
  PaymentProvider,
  Prisma,
} from '@prisma/client';
import { PaymentCoreService } from '../core/payment-core.service';
import { PaymentSessionService } from './payment-session.service';
import { SettlePartialDto, SplitMode } from '../dto/settle-partial.dto';
import {
  BillPaymentScope,
  CheckoutScope,
  CheckoutScopeInput,
  normalizeCheckoutScope,
} from '../payment-scope.utils';
import { CashPaymentRequestDto } from '../payment.types';
import { PAYMENT_AMOUNT_TOLERANCE } from '../payment.constants';

@Injectable()
export class PaymentSettlementService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly events: EventsGateway,
    private readonly featureService: FeatureService,
    private readonly core: PaymentCoreService,
    private readonly session: PaymentSessionService,
  ) {}

  async createCashPaymentRequest(
    token: string,
    restaurantId: string,
    scopeInput?: CheckoutScopeInput,
  ): Promise<CashPaymentRequestDto> {
    const session = await this.prisma.tableSession.findFirst({
      where: { token, restaurantId, status: 'OPEN' },
      include: {
        restaurant: { select: { tier: true, forceTier: true } },
        table: { select: { name: true } },
      },
    });
    if (!session) throw new NotFoundException('Session not found');

    if (
      !this.featureService.restaurantHasFeature(
        session.restaurant,
        FeatureFlag.ORDERS_CALL_WAITER,
      )
    ) {
      throw new ForbiddenException({
        code: 'FEATURE_LOCKED',
        message: 'Cash collection requests are not available on this plan',
      });
    }

    const result = await this.prisma.$transaction(async (tx) => {
      await this.core.lockOpenSessionForSettlement(tx, session.id);

      const normalizedScope = normalizeCheckoutScope(scopeInput);
      const charge = await this.core.resolveCheckoutCharge(
        tx,
        session,
        0,
        0,
        normalizedScope ?? undefined,
      );
      const scope = normalizedScope
        ? CashPaymentRequestScope.ORDER_ITEMS
        : CashPaymentRequestScope.FULL_TABLE;
      const orderIds = normalizedScope?.orderIds ?? [];
      const scopeKey = this.core.getCashPaymentRequestScopeKey(scope, orderIds);
      const billScope =
        scope === CashPaymentRequestScope.ORDER_ITEMS
          ? ({ kind: 'ORDER_ITEMS', orderIds } as BillPaymentScope)
          : ({ kind: 'FULL_TABLE' } as BillPaymentScope);

      const existing = await tx.cashPaymentRequest.findFirst({
        where: {
          tableSessionId: session.id,
          status: CashPaymentRequestStatus.PENDING,
          scopeKey,
        },
        include: { table: { select: { name: true } } },
        orderBy: { createdAt: 'desc' },
      });

      await this.core.assertNoPendingBillScopeConflict(
        tx,
        session.id,
        billScope,
        {
          ignoreCashRequestIds: existing ? [existing.id] : [],
        },
      );

      if (existing) {
        const request = await tx.cashPaymentRequest.update({
          where: { id: existing.id },
          data: {
            requestedAmount: charge.subtotal,
            orderIds,
            scope,
          },
          include: { table: { select: { name: true } } },
        });
        return {
          eventName: 'cashPaymentRequest:updated' as const,
          request,
        };
      }

      const request = await tx.cashPaymentRequest.create({
        data: {
          restaurantId,
          tableSessionId: session.id,
          tableId: session.tableId,
          scope,
          scopeKey,
          orderIds,
          requestedAmount: charge.subtotal,
          currency: 'EUR',
        },
        include: { table: { select: { name: true } } },
      });
      return {
        eventName: 'cashPaymentRequest:created' as const,
        request,
      };
    });

    this.core.emitCashPaymentRequestEvent(result.eventName, result.request);
    return this.core.formatCashPaymentRequest(result.request);
  }

  async listCashPaymentRequests(
    restaurantId: string,
    userId: string,
    status?: string,
  ): Promise<CashPaymentRequestDto[]> {
    await this.core.verifyRestaurantStaffAccess(restaurantId, userId);

    const normalizedStatus = status?.trim().toUpperCase();
    const whereStatus =
      normalizedStatus && normalizedStatus !== 'ALL'
        ? (normalizedStatus as CashPaymentRequestStatus)
        : undefined;
    if (
      whereStatus &&
      !Object.values(CashPaymentRequestStatus).includes(whereStatus)
    ) {
      throw new BadRequestException('Unknown cash payment request status');
    }

    const requests = await this.prisma.cashPaymentRequest.findMany({
      where: {
        restaurantId,
        ...(whereStatus ? { status: whereStatus } : {}),
      },
      include: { table: { select: { name: true } } },
      orderBy: [{ status: 'asc' }, { createdAt: 'desc' }],
      take: 100,
    });

    return requests.map((request) =>
      this.core.formatCashPaymentRequest(request),
    );
  }

  async confirmCashPaymentRequest(
    requestId: string,
    userId: string,
  ): Promise<CashPaymentRequestDto> {
    const existing = await this.prisma.cashPaymentRequest.findUnique({
      where: { id: requestId },
      select: {
        id: true,
        restaurantId: true,
        tableSessionId: true,
        status: true,
      },
    });
    if (!existing)
      throw new NotFoundException('Cash payment request not found');
    await this.core.verifyCashPaymentOperatorAccess(
      existing.restaurantId,
      userId,
    );
    if (existing.status !== CashPaymentRequestStatus.PENDING) {
      throw new ConflictException('Cash payment request is already handled');
    }
    if (!existing.tableSessionId) {
      throw new ConflictException(
        'Cash payment request is no longer attached to an active session',
      );
    }
    const tableSessionId = existing.tableSessionId;

    const { stripe, nonStripeIds } =
      await this.session.findPendingCheckoutPayments(tableSessionId);
    const cancelledStripeIds = await this.session.cancelStripePaymentIntents(
      stripe,
      tableSessionId,
    );
    const abandonedIds = [...nonStripeIds, ...cancelledStripeIds];

    const result = await this.prisma.$transaction(async (tx) => {
      await this.core.lockOpenSessionForSettlement(tx, tableSessionId);
      await this.core.lockPendingCashPaymentRequest(tx, requestId);
      const request = await tx.cashPaymentRequest.findUnique({
        where: { id: requestId },
        include: {
          table: { select: { name: true } },
          tableSession: true,
        },
      });
      if (!request)
        throw new NotFoundException('Cash payment request not found');
      if (request.status !== CashPaymentRequestStatus.PENDING) {
        throw new ConflictException('Cash payment request is already handled');
      }
      if (!request.tableSessionId) {
        throw new ConflictException(
          'Cash payment request is no longer attached to an active session',
        );
      }
      if (request.tableSessionId !== tableSessionId) {
        throw new ConflictException(
          'Cash payment request changed during confirmation. Please retry.',
        );
      }

      const session = await tx.tableSession.findFirst({
        where: { id: request.tableSessionId, status: 'OPEN' },
      });
      if (!session) {
        throw new ConflictException('Session is no longer open');
      }

      let chargeSubtotal: number;
      let checkoutScope: CheckoutScope | null = null;
      if (request.scope === CashPaymentRequestScope.ORDER_ITEMS) {
        const charge = await this.core.resolveCheckoutCharge(
          tx,
          session,
          0,
          0,
          {
            orderIds: request.orderIds,
          },
        );
        chargeSubtotal = charge.subtotal;
        checkoutScope = charge.checkoutScope;
      } else {
        const balance = await this.core.computeSessionBalance(tx, session.id);
        if (balance.remaining <= 0) {
          throw new ConflictException('This session has already been paid');
        }
        chargeSubtotal = balance.remaining;
      }

      const abandonedPaymentIds =
        await this.session.applyAbandonedPaymentsForLockedSession(
          tx,
          session.id,
          abandonedIds,
        );

      const payment = await tx.payment.create({
        data: {
          tableSessionId: session.id,
          restaurantId: request.restaurantId,
          amount: chargeSubtotal,
          tipAmount: 0,
          platformFeeAmount: 0,
          currency: 'eur',
          status: 'SUCCEEDED',
          provider: PaymentProvider.CASH,
          splitMode: checkoutScope ? SplitMode.ITEM : undefined,
          providerPayload: {
            cashPaymentRequestId: request.id,
            cashPaymentScope: request.scope,
          },
        },
      });

      if (checkoutScope) {
        for (const allocation of checkoutScope.allocations) {
          const updated = await tx.orderItem.updateMany({
            where: {
              id: allocation.orderItemId,
              paidQuantity: allocation.snapshotPaid,
            },
            data: { paidQuantity: { increment: allocation.quantity } },
          });
          if (updated.count === 0) {
            throw new ConflictException(
              'Items changed during settlement - please retry',
            );
          }
        }
        await tx.paymentAllocation.createMany({
          data: checkoutScope.allocations.map((allocation) => ({
            paymentId: payment.id,
            orderItemId: allocation.orderItemId,
            quantity: allocation.quantity,
            amount: allocation.amount,
          })),
        });
      }

      const balanceAfter = await this.core.computeSessionBalance(
        tx,
        session.id,
      );
      let sessionPaid = false;
      if (balanceAfter.remaining <= PAYMENT_AMOUNT_TOLERANCE) {
        const flip = await tx.tableSession.updateMany({
          where: { id: session.id, status: 'OPEN' },
          data: { status: 'PAID', paidAt: new Date() },
        });
        sessionPaid = flip.count > 0;
      }

      const updatedRequest = await tx.cashPaymentRequest.update({
        where: { id: request.id },
        data: {
          status: CashPaymentRequestStatus.PAID,
          requestedAmount: chargeSubtotal,
          paymentId: payment.id,
          resolvedById: userId,
          resolvedAt: new Date(),
        },
        include: { table: { select: { name: true } } },
      });

      return {
        request: updatedRequest,
        tableId: session.tableId,
        sessionId: session.id,
        paymentId: payment.id,
        amount: chargeSubtotal,
        remaining: Math.max(0, balanceAfter.remaining),
        sessionPaid,
        splitMode: checkoutScope ? SplitMode.ITEM : null,
        abandonedPaymentIds,
      };
    });

    this.session.emitAbandonedCheckoutEvents(
      result.sessionId,
      result.abandonedPaymentIds,
    );
    this.core.emitCashPaymentRequestEvent(
      'cashPaymentRequest:updated',
      result.request,
    );
    this.events.emitTableStatusChanged(
      result.request.restaurantId,
      result.tableId,
      result.sessionId,
    );
    this.events.emitToRestaurant(result.request.restaurantId, 'bill:updated', {
      tableSessionId: result.sessionId,
      tableId: result.tableId,
      paymentId: result.paymentId,
      splitMode: result.splitMode,
      remaining: result.remaining,
      sessionPaid: result.sessionPaid,
    });
    this.events.emitToTableSession(result.sessionId, 'bill:updated', {
      tableSessionId: result.sessionId,
      tableId: result.tableId,
      paymentId: result.paymentId,
      splitMode: result.splitMode,
      remaining: result.remaining,
      sessionPaid: result.sessionPaid,
    });
    if (result.sessionPaid) {
      await this.core.emitPaymentConfirmed({
        id: result.paymentId,
        tableSessionId: result.sessionId,
        amount: result.amount,
        tipAmount: 0,
      });
    }

    return this.core.formatCashPaymentRequest(result.request);
  }

  async cancelCashPaymentRequest(
    requestId: string,
    userId: string,
  ): Promise<CashPaymentRequestDto> {
    const existing = await this.prisma.cashPaymentRequest.findUnique({
      where: { id: requestId },
      select: { restaurantId: true, status: true },
    });
    if (!existing)
      throw new NotFoundException('Cash payment request not found');
    await this.core.verifyCashPaymentOperatorAccess(
      existing.restaurantId,
      userId,
    );
    if (existing.status !== CashPaymentRequestStatus.PENDING) {
      throw new ConflictException('Cash payment request is already handled');
    }

    const request = await this.prisma.cashPaymentRequest.update({
      where: { id: requestId },
      data: {
        status: CashPaymentRequestStatus.CANCELLED,
        resolvedById: userId,
        resolvedAt: new Date(),
      },
      include: { table: { select: { name: true } } },
    });
    this.core.emitCashPaymentRequestEvent(
      'cashPaymentRequest:updated',
      request,
    );
    return this.core.formatCashPaymentRequest(request);
  }

  async settlePartial(
    token: string,
    restaurantId: string,
    userId: string,
    dto: SettlePartialDto,
  ): Promise<{ amount: number; remaining: number; sessionPaid: boolean }> {
    await this.core.verifyPosOperatorAccess(restaurantId, userId);

    const openSession = await this.prisma.tableSession.findFirst({
      where: { token, restaurantId, status: 'OPEN' },
      select: { id: true },
    });
    if (!openSession) throw new NotFoundException('Session not found');

    const tipPercent = this.core.normalizeTipPercent(dto.tipPercent);

    const { stripe, nonStripeIds } =
      await this.session.findPendingCheckoutPayments(openSession.id);
    const cancelledStripeIds = await this.session.cancelStripePaymentIntents(
      stripe,
      openSession.id,
    );
    const abandonedIds = [...nonStripeIds, ...cancelledStripeIds];

    const result = await this.prisma.$transaction(async (tx) => {
      const session = await tx.tableSession.findFirst({
        where: { token, restaurantId, status: 'OPEN' },
      });
      if (!session) throw new NotFoundException('Session not found');
      await this.core.lockOpenSessionForSettlement(tx, session.id);

      const balance = await this.core.computeSessionBalance(tx, session.id);
      if (balance.remaining <= 0) {
        throw new ConflictException('This session is already fully paid');
      }

      let chargeSubtotal: number;
      const allocations: Array<{
        orderItemId: string;
        quantity: number;
        amount: number;
        snapshotPaid: number;
      }> = [];

      if (dto.mode === SplitMode.ITEM) {
        if (!dto.allocations?.length) {
          throw new BadRequestException('Select at least one item to split');
        }
        if (balance.hasLoyaltyDiscount) {
          throw new BadRequestException(
            'Item split is unavailable when loyalty discounts apply — use even or custom split',
          );
        }
        const itemById = new Map(balance.items.map((i) => [i.orderItemId, i]));
        // Collapse duplicate orderItemId entries so availability is checked once.
        const requested = new Map<string, number>();
        for (const a of dto.allocations) {
          requested.set(
            a.orderItemId,
            (requested.get(a.orderItemId) ?? 0) + a.quantity,
          );
        }
        let sum = 0;
        for (const [orderItemId, quantity] of requested) {
          const it = itemById.get(orderItemId);
          if (!it) throw new BadRequestException('Unknown item in selection');
          if (quantity > it.remainingQuantity) {
            throw new ConflictException(
              'Some selected items are already settled',
            );
          }
          const amount = this.core.roundMoney(it.unitPrice * quantity);
          allocations.push({
            orderItemId,
            quantity,
            amount,
            snapshotPaid: it.paidQuantity,
          });
          sum += amount;
        }
        chargeSubtotal = this.core.roundMoney(sum);
      } else if (dto.mode === SplitMode.EVEN) {
        // One share of the REMAINING balance: remaining / peopleLeft. The POS
        // sends `splitCount` = people still to pay and decrements it after each
        // even payment, so shares stay equal AND the final payment lands exactly
        // (remaining / 1), leaving no rounding dust. Clamped to remaining below.
        const splitCount = dto.splitCount ?? 1;
        chargeSubtotal = this.core.roundMoney(balance.remaining / splitCount);
      } else {
        if (!dto.amount || dto.amount <= 0) {
          throw new BadRequestException('Enter an amount to settle');
        }
        chargeSubtotal = this.core.roundMoney(dto.amount);
      }

      // Never collect more than the outstanding balance.
      chargeSubtotal = Math.min(chargeSubtotal, balance.remaining);
      if (chargeSubtotal <= 0) {
        throw new BadRequestException('Nothing left to settle');
      }

      const tipAmount = this.core.roundMoney(
        (chargeSubtotal * tipPercent) / 100,
      );
      const total = this.core.roundMoney(chargeSubtotal + tipAmount);

      const abandonedPaymentIds =
        await this.session.applyAbandonedPaymentsForLockedSession(
          tx,
          session.id,
          abandonedIds,
        );

      const payment = await tx.payment.create({
        data: {
          tableSessionId: session.id,
          restaurantId,
          amount: total,
          tipAmount,
          // In-person CASH/MYPOS — no platform fee, matching the full-close path.
          platformFeeAmount: 0,
          currency: 'eur',
          status: 'SUCCEEDED',
          provider: dto.provider,
          splitMode: dto.mode,
        },
      });

      if (allocations.length > 0) {
        for (const a of allocations) {
          // Optimistic per-unit lock: increment only if paidQuantity is unchanged
          // since the snapshot. A concurrent settlement of the same units changes
          // it, count===0, and we abort the whole transaction (no double-pay).
          const upd = await tx.orderItem.updateMany({
            where: { id: a.orderItemId, paidQuantity: a.snapshotPaid },
            data: { paidQuantity: { increment: a.quantity } },
          });
          if (upd.count === 0) {
            throw new ConflictException(
              'Items changed during settlement — please retry',
            );
          }
        }
        await tx.paymentAllocation.createMany({
          data: allocations.map((a) => ({
            paymentId: payment.id,
            orderItemId: a.orderItemId,
            quantity: a.quantity,
            amount: a.amount,
          })),
        });
      }

      const newRemaining = this.core.roundMoney(
        balance.remaining - chargeSubtotal,
      );
      let sessionPaid = false;
      if (newRemaining <= PAYMENT_AMOUNT_TOLERANCE) {
        const flip = await tx.tableSession.updateMany({
          where: { id: session.id, status: 'OPEN' },
          data: { status: 'PAID', paidAt: new Date() },
        });
        sessionPaid = flip.count > 0;
      }

      return {
        sessionId: session.id,
        tableId: session.tableId,
        amount: total,
        remaining: Math.max(0, newRemaining),
        sessionPaid,
        paymentId: payment.id,
        tipAmount,
        splitMode: dto.mode,
        abandonedPaymentIds,
      };
    });

    this.session.emitAbandonedCheckoutEvents(
      result.sessionId,
      result.abandonedPaymentIds,
    );
    // Emit after commit so rolled-back work never fires socket events (#H4).
    this.events.emitTableStatusChanged(
      restaurantId,
      result.tableId,
      result.sessionId,
    );
    const billUpdatedPayload = {
      tableSessionId: result.sessionId,
      tableId: result.tableId,
      paymentId: result.paymentId,
      splitMode: result.splitMode,
      remaining: result.remaining,
      sessionPaid: result.sessionPaid,
    };
    this.events.emitToRestaurant(
      restaurantId,
      'bill:updated',
      billUpdatedPayload,
    );
    this.events.emitToTableSession(
      result.sessionId,
      'bill:updated',
      billUpdatedPayload,
    );
    if (result.sessionPaid) {
      const tableNumber =
        (
          await this.prisma.restaurantTable.findUnique({
            where: { id: result.tableId },
            select: { name: true },
          })
        )?.name ?? null;
      const customerName =
        (
          await this.prisma.order.findFirst({
            where: { tableSessionId: result.sessionId },
            orderBy: { createdAt: 'desc' },
            select: { customerName: true },
          })
        )?.customerName ?? null;
      const paymentConfirmedPayload = {
        paymentId: result.paymentId,
        tableSessionId: result.sessionId,
        amount: result.amount,
        tipAmount: result.tipAmount,
        tableNumber,
        customerName,
      };
      this.events.emitToRestaurant(
        restaurantId,
        'payment:confirmed',
        paymentConfirmedPayload,
      );
      this.events.emitToTableSession(
        result.sessionId,
        'payment:confirmed',
        paymentConfirmedPayload,
      );
    }

    return {
      amount: result.amount,
      remaining: result.remaining,
      sessionPaid: result.sessionPaid,
    };
  }
}
