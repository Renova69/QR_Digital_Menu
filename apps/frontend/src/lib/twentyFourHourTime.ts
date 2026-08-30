export const HHMM_INPUT_PATTERN = "(?:[01][0-9]|2[0-3]):[0-5][0-9]";

const HHMM_PATTERN = new RegExp(`^${HHMM_INPUT_PATTERN}$`);

export function isValidTwentyFourHourTime(value: string): boolean {
  return HHMM_PATTERN.test(value);
}

export function formatTwentyFourHourTimeInput(value: string): string {
  const digits = value.replace(/\D/g, "").slice(0, 4);
  return digits.length <= 2
    ? digits
    : `${digits.slice(0, 2)}:${digits.slice(2)}`;
}
