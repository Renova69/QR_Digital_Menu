type Translate = (
  key: string,
  optionsOrDefault?: string | ({ defaultValue?: string } & Record<string, unknown>),
) => string;

export type CustomerFacingOrderSource = {
  source?: 'CUSTOMER' | 'POS' | string | null;
  staffName?: string | null;
};

const interpolateNameFallback = (value: string, name: string) =>
  value.replace(/\{\{\s*name\s*\}\}/g, name);

export function getCustomerFacingOrderSourceLabel(
  order: CustomerFacingOrderSource,
  t: Translate,
) {
  if (order.source === 'CUSTOMER') {
    return t('payment.sourceYou', 'You');
  }

  const staffName = order.staffName?.trim();
  if (!staffName) {
    return t('payment.sourceStaff', 'Staff');
  }

  const label = t('payment.sourceStaffWithName', {
    name: staffName,
    defaultValue: 'Staff: {{name}}',
  });

  return interpolateNameFallback(label, staffName);
}
