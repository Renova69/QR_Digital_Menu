export interface ExpiringPointBatch {
  points: number;
  value: number;
  expiresAt: string;
}

export interface ExpiringPointGroup {
  dateKey: string;
  expiresAt: string;
  points: number;
  value: number;
}

const dateKeyFormatter = (timeZone: string) =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });

const getDateKey = (date: Date, timeZone: string) => {
  let parts: Intl.DateTimeFormatPart[];
  try {
    parts = dateKeyFormatter(timeZone).formatToParts(date);
  } catch {
    parts = dateKeyFormatter("UTC").formatToParts(date);
  }
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((candidate) => candidate.type === type)?.value ?? "";
  return `${part("year")}-${part("month")}-${part("day")}`;
};

export function groupExpiringPointBatches(
  batches: ExpiringPointBatch[] | null | undefined,
  redeemRate: number,
  timeZone = "UTC",
): ExpiringPointGroup[] {
  if (!batches?.length) return [];

  const groups = new Map<string, { expiresAt: string; points: number }>();

  for (const batch of batches) {
    const date = new Date(batch.expiresAt);
    if (
      Number.isNaN(date.getTime()) ||
      !Number.isFinite(batch.points) ||
      batch.points <= 0
    ) {
      continue;
    }
    const dateKey = getDateKey(date, timeZone);
    const current = groups.get(dateKey);
    if (current) {
      current.points += batch.points;
    } else {
      groups.set(dateKey, {
        expiresAt: batch.expiresAt,
        points: batch.points,
      });
    }
  }

  return [...groups.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([dateKey, group]) => ({
      dateKey,
      expiresAt: group.expiresAt,
      points: group.points,
      value:
        redeemRate > 0
          ? Math.round((group.points / redeemRate) * 100) / 100
          : 0,
    }));
}

export function formatLoyaltyExpiryDate(
  expiresAt: string,
  locale: string,
  timeZone = "UTC",
) {
  const date = new Date(expiresAt);
  if (Number.isNaN(date.getTime())) return "";
  try {
    return new Intl.DateTimeFormat(locale, {
      dateStyle: "medium",
      timeZone,
    }).format(date);
  } catch {
    return new Intl.DateTimeFormat(locale, {
      dateStyle: "medium",
      timeZone: "UTC",
    }).format(date);
  }
}
