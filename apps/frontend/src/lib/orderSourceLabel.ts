import type { TFunction } from "i18next";

export type CustomerFacingOrderSource = {
  source?: 'CUSTOMER' | 'POS' | string | null;
  staffName?: string | null;
};

const interpolateNameFallback = (value: string, name: string) =>
  value.replace(/\{\{\s*name\s*\}\}/g, name);

export function getCustomerFacingOrderSourceLabel(
  order: CustomerFacingOrderSource,
  t: TFunction,
) {
  if (order.source === 'CUSTOMER') {
    return String(t('payment.sourceYou', { defaultValue: 'You' }));
  }

  const staffName = order.staffName?.trim();
  if (!staffName) {
    return String(t('payment.sourceStaff', { defaultValue: 'Staff' }));
  }

  const label = String(t('payment.sourceStaffWithName', {
    name: staffName,
    defaultValue: 'Staff: {{name}}',
  }));

  return interpolateNameFallback(label, staffName);
}
