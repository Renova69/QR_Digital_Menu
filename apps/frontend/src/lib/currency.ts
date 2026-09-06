/** All menu prices, option modifiers, and payments are denominated in EUR. */
export function formatEuro(value: number): string {
  if (!Number.isFinite(value)) return "— €";
  return `${value.toFixed(2)} €`;
}
