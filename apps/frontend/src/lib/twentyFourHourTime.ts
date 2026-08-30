export const HHMM_INPUT_PATTERN = "(?:[01][0-9]|2[0-3]):[0-5][0-9]";

const HHMM_PATTERN = new RegExp(`^${HHMM_INPUT_PATTERN}$`);

export function isValidTwentyFourHourTime(value: string): boolean {
  return HHMM_PATTERN.test(value);
}

export type TwentyFourHourWindow = {
  crossesMidnight: boolean;
  durationMinutes: number;
};

export function getTwentyFourHourWindow(
  startTime: string,
  endTime: string,
): TwentyFourHourWindow | null {
  if (
    !isValidTwentyFourHourTime(startTime) ||
    !isValidTwentyFourHourTime(endTime)
  ) {
    return null;
  }

  const toMinutes = (value: string) => {
    const [hours, minutes] = value.split(":").map(Number);
    return hours * 60 + minutes;
  };
  const startMinutes = toMinutes(startTime);
  const endMinutes = toMinutes(endTime);

  return {
    crossesMidnight: endMinutes < startMinutes,
    durationMinutes: (endMinutes - startMinutes + 24 * 60) % (24 * 60),
  };
}

export function formatTwentyFourHourTimeInput(value: string): string {
  const digits = value.replace(/\D/g, "").slice(0, 4);
  return digits.length <= 2
    ? digits
    : `${digits.slice(0, 2)}:${digits.slice(2)}`;
}
