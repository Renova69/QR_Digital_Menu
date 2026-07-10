export const SERVICE_POINT_TYPES = [
  'TABLE',
  'ROOM',
  'PICKUP',
  'OTHER',
] as const;
export type ServicePointType = (typeof SERVICE_POINT_TYPES)[number];

export const FULFILLMENT_MODES = [
  'DINE_IN',
  'ROOM_DELIVERY',
  'PICKUP',
] as const;
export type FulfillmentMode = (typeof FULFILLMENT_MODES)[number];

export const PAYMENT_METHODS = [
  'ONLINE',
  'CASH',
  'PAY_ON_DELIVERY',
  'PAY_AT_PICKUP',
] as const;
export type ServicePointPaymentMethod = (typeof PAYMENT_METHODS)[number];

export const DEFAULT_FULFILLMENT_MODES: Record<
  ServicePointType,
  FulfillmentMode[]
> = {
  TABLE: ['DINE_IN'],
  ROOM: ['ROOM_DELIVERY', 'PICKUP'],
  PICKUP: ['PICKUP'],
  OTHER: ['PICKUP'],
};

export const DEFAULT_PAYMENT_METHODS: Record<
  ServicePointType,
  ServicePointPaymentMethod[]
> = {
  TABLE: ['ONLINE', 'CASH'],
  ROOM: ['ONLINE', 'PAY_ON_DELIVERY'],
  PICKUP: ['ONLINE', 'PAY_AT_PICKUP'],
  OTHER: ['ONLINE', 'CASH'],
};
