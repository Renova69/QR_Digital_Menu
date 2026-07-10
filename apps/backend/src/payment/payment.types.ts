import {
  CashPaymentRequestScope,
  CashPaymentRequestStatus,
} from '@prisma/client';
import { SplitMode } from './dto/settle-partial.dto';
import { CheckoutScope } from './payment-scope.utils';

export type CheckoutProvider = 'STRIPE' | 'EPAY' | 'BORICA' | 'MYPOS';

export type CheckoutCharge = {
  subtotal: number;
  tipAmount: number;
  total: number;
  platformFeeCents: number;
  platformFeeAmount: number;
  checkoutScope: CheckoutScope | null;
  checkoutScopeKey: string | null;
};

export type PaymentClaimResult = {
  claimed: boolean;
  sessionPaid: boolean;
  remaining?: number;
  splitMode?: SplitMode;
};

export type CashPaymentRequestDto = {
  id: string;
  restaurantId: string;
  tableSessionId: string;
  // Nullable: CashPaymentRequest.tableId is SetNull on table deletion (was
  // Cascade) so historical cash-payment records survive table removal.
  tableId: string | null;
  tableName: string | null;
  status: CashPaymentRequestStatus;
  scope: CashPaymentRequestScope;
  orderIds: string[];
  requestedAmount: number;
  currency: string;
  paymentId: string | null;
  resolvedById: string | null;
  resolvedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

export type PendingBillPaymentDto = {
  id: string;
  tableSessionId: string;
  source: 'ONLINE_PAYMENT' | 'CASH_REQUEST';
  provider: CheckoutProvider | 'CASH';
  status: 'PENDING';
  scope: 'FULL_TABLE' | 'ORDER_ITEMS';
  orderIds: string[];
  amount: number;
  createdAt: Date;
};

export const DAY_MS = 24 * 60 * 60 * 1000;
export const ABANDONED_PAYMENT_RETENTION_DAYS = 90;
export const STALE_OPEN_SESSION_HOURS = 36;

export type BoricaCardholderInput = {
  cardholderName?: string | null;
  email?: string | null;
  phone?: string | null;
  billingAddress?: string | null;
};

export type MyposConfig = {
  mode: 'DEMO' | 'LIVE';
  clientNumber: string;
  storeId: string;
  keyIndex: string;
  privateKeyPem: string;
  publicCertPem: string;
  currency: string;
};
