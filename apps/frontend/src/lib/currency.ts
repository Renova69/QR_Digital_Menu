// apps/frontend/src/lib/currency.ts

/** Bulgarian National Bank fixed exchange rate: 1 EUR = 1.95583 BGN */
export const BGN_RATE = 1.95583;

export function formatEuro(value: number): string {
  return `${value.toFixed(2)} €`;
}

export function formatBgn(value: number): string {
  return `${(value * BGN_RATE).toFixed(2)} лв`;
}

/**
 * Returns primary + secondary price strings for dual-currency display.
 * Primary currency is determined by the item's currency field (EUR or BGN).
 */
export function formatDualCurrency(
  value: number,
  primaryCurrency: 'EUR' | 'BGN' = 'EUR',
): { primary: string; secondary: string } {
  if (primaryCurrency === 'EUR') {
    return { primary: formatEuro(value), secondary: formatBgn(value) };
  }
  // Value is already in BGN, format directly; derive EUR as secondary
  return {
    primary: `${value.toFixed(2)} лв`,
    secondary: formatEuro(value / BGN_RATE),
  };
}

/** Single-line inline format: "12.50 € / 24.45 лв" */
export function formatInlineDual(value: number, primaryCurrency: 'EUR' | 'BGN' = 'EUR'): string {
  const { primary, secondary } = formatDualCurrency(value, primaryCurrency);
  return `${primary} / ${secondary}`;
}
