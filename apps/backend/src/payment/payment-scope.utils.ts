import { BadRequestException } from '@nestjs/common';
import { createHash } from 'crypto';
import { CashPaymentRequestScope } from '@prisma/client';

// Pure scope/bill-scope algebra extracted from PaymentService. These functions
// are stateless data transforms over scope objects — no Prisma, no events, no
// `this`. They are exercised end-to-end by payment.service.spec /
// payment.behavior-proof.spec; behavior here must stay identical to the original
// private methods they replaced.

export type CheckoutScopeInput = {
  orderIds?: string[];
};

export type CheckoutScopeAllocation = {
  orderItemId: string;
  quantity: number;
  amount: number;
  snapshotPaid: number;
};

export type CheckoutScope = {
  kind: 'ORDER_ITEMS';
  orderIds: string[];
  allocations: CheckoutScopeAllocation[];
  chargeSubtotal: number;
};

export type BillPaymentScope =
  | { kind: 'FULL_TABLE' }
  | { kind: 'ORDER_ITEMS'; orderIds: string[] };

export function normalizeCheckoutScope(
  scope?: CheckoutScopeInput,
): { orderIds: string[] } | null {
  if (!scope?.orderIds) return null;
  if (!Array.isArray(scope.orderIds)) {
    throw new BadRequestException('orderIds must be an array');
  }

  const orderIds = Array.from(
    new Set(
      scope.orderIds
        .map((id) => (typeof id === 'string' ? id.trim() : ''))
        .filter(Boolean),
    ),
  );

  if (orderIds.length === 0) {
    throw new BadRequestException('Select at least one order to pay');
  }
  if (orderIds.length > 50) {
    throw new BadRequestException('Too many orders selected');
  }

  return { orderIds };
}

export function getCheckoutScopeKey(
  scope: CheckoutScope | null,
): string | null {
  if (!scope) return null;
  return createHash('sha256')
    .update(
      JSON.stringify({
        kind: scope.kind,
        orderIds: scope.orderIds,
        allocations: scope.allocations.map((a) => ({
          orderItemId: a.orderItemId,
          quantity: a.quantity,
          amount: a.amount,
          snapshotPaid: a.snapshotPaid,
        })),
        chargeSubtotal: scope.chargeSubtotal,
      }),
    )
    .digest('hex')
    .slice(0, 16);
}

export function getCheckoutScopeFromPayload(
  payload: unknown,
): CheckoutScope | null {
  const base =
    payload && typeof payload === 'object' && !Array.isArray(payload)
      ? (payload as Record<string, any>)
      : null;
  const scope = base?.checkoutScope;
  if (
    !scope ||
    scope.kind !== 'ORDER_ITEMS' ||
    !Array.isArray(scope.orderIds) ||
    !Array.isArray(scope.allocations)
  ) {
    return null;
  }

  const allocations = scope.allocations
    .map((a: any) => ({
      orderItemId: typeof a.orderItemId === 'string' ? a.orderItemId : '',
      quantity: Number(a.quantity),
      amount: Number(a.amount),
      snapshotPaid: Number(a.snapshotPaid),
    }))
    .filter(
      (a: CheckoutScopeAllocation) =>
        a.orderItemId &&
        Number.isInteger(a.quantity) &&
        a.quantity > 0 &&
        Number.isFinite(a.amount) &&
        a.amount > 0 &&
        Number.isInteger(a.snapshotPaid) &&
        a.snapshotPaid >= 0,
    );

  if (allocations.length === 0) return null;

  return {
    kind: 'ORDER_ITEMS',
    orderIds: scope.orderIds
      .filter((id: unknown) => typeof id === 'string' && id.trim())
      .map((id: string) => id.trim()),
    allocations,
    // Inlined PaymentService.roundMoney (Math.round(v * 100) / 100).
    chargeSubtotal: Math.round((Number(scope.chargeSubtotal) || 0) * 100) / 100,
  };
}

export function paymentScopeMatches(
  payment: any,
  scope: CheckoutScope | null,
): boolean {
  const stored = getCheckoutScopeFromPayload(payment.providerPayload);
  if (!stored && !scope) return true;
  if (!stored || !scope) return false;
  return getCheckoutScopeKey(stored) === getCheckoutScopeKey(scope);
}

export function checkoutScopePayload(scope: CheckoutScope | null) {
  return scope
    ? ({ checkoutScope: scope } as Record<string, unknown>)
    : undefined;
}

export function billScopeFromCheckoutScope(
  scope: CheckoutScope | null,
): BillPaymentScope {
  return scope
    ? { kind: 'ORDER_ITEMS', orderIds: normalizeScopeOrderIds(scope.orderIds) }
    : { kind: 'FULL_TABLE' };
}

export function billScopeFromCashRequest(request: {
  scope: CashPaymentRequestScope;
  orderIds?: string[] | null;
}): BillPaymentScope {
  return request.scope === CashPaymentRequestScope.ORDER_ITEMS
    ? {
        kind: 'ORDER_ITEMS',
        orderIds: normalizeScopeOrderIds(request.orderIds ?? []),
      }
    : { kind: 'FULL_TABLE' };
}

export function billScopeFromPayment(payment: any): BillPaymentScope {
  return billScopeFromCheckoutScope(
    getCheckoutScopeFromPayload(payment.providerPayload),
  );
}

export function normalizeScopeOrderIds(orderIds: string[]): string[] {
  return Array.from(
    new Set(
      orderIds
        .filter(
          (id): id is string => typeof id === 'string' && id.trim().length > 0,
        )
        .map((id) => id.trim()),
    ),
  ).sort();
}

export function billScopesEqual(
  a: BillPaymentScope,
  b: BillPaymentScope,
): boolean {
  if (a.kind !== b.kind) return false;
  if (a.kind === 'FULL_TABLE') return true;
  if (b.kind === 'FULL_TABLE') return true;
  const aIds = normalizeScopeOrderIds(a.orderIds);
  const bIds = normalizeScopeOrderIds(b.orderIds);
  return (
    aIds.length === bIds.length && aIds.every((id, index) => id === bIds[index])
  );
}

export function billScopesOverlap(
  a: BillPaymentScope,
  b: BillPaymentScope,
): boolean {
  if (a.kind === 'FULL_TABLE' || b.kind === 'FULL_TABLE') return true;
  const bIds = new Set(normalizeScopeOrderIds(b.orderIds));
  return normalizeScopeOrderIds(a.orderIds).some((id) => bIds.has(id));
}

export function paymentBillScopeEquals(
  payment: any,
  scope: BillPaymentScope,
): boolean {
  return billScopesEqual(billScopeFromPayment(payment), scope);
}
