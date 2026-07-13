import { DateTime } from 'luxon';

export const UPSELL_CONTEXTS = [
  'MORNING',
  'LUNCH',
  'EVENING',
  'LATE_NIGHT',
  'WEEKEND',
  'FRIDAY_NIGHT',
  'COLD',
  'HOT',
  'RAINY',
] as const;

export type UpsellContext = (typeof UPSELL_CONTEXTS)[number];

export type WeatherConditions = {
  temperatureC: number;
  precipitationMm: number;
  weatherCode: number;
};

type ContextualItem = {
  upsellContexts?: readonly string[] | null;
  tags?: readonly string[] | null;
};

const CONTEXT_SET = new Set<string>(UPSELL_CONTEXTS);
const CONTEXT_WEIGHTS: Record<UpsellContext, number> = {
  MORNING: 12,
  LUNCH: 12,
  EVENING: 12,
  LATE_NIGHT: 12,
  WEEKEND: 12,
  FRIDAY_NIGHT: 14,
  COLD: 11,
  HOT: 11,
  RAINY: 8,
};
const MAX_CONTEXT_BONUS = 26;

export function getTimeUpsellContexts(
  timezone: string,
  instant: DateTime = DateTime.now(),
): Set<UpsellContext> {
  const zoned = instant.setZone(timezone);
  const local = zoned.isValid ? zoned : instant.toUTC();
  const contexts = new Set<UpsellContext>();

  if (local.hour >= 6 && local.hour < 11) contexts.add('MORNING');
  if (local.hour >= 11 && local.hour < 15) contexts.add('LUNCH');
  if (local.hour >= 17 && local.hour < 22) contexts.add('EVENING');
  if (local.hour >= 22 || local.hour < 4) contexts.add('LATE_NIGHT');
  if (local.weekday === 6 || local.weekday === 7) contexts.add('WEEKEND');
  if (local.weekday === 5 && local.hour >= 17) contexts.add('FRIDAY_NIGHT');

  return contexts;
}

export function weatherConditionsToContexts(
  conditions: WeatherConditions,
): Set<UpsellContext> {
  const contexts = new Set<UpsellContext>();

  if (conditions.temperatureC <= 10) contexts.add('COLD');
  if (conditions.temperatureC >= 26) contexts.add('HOT');

  const code = conditions.weatherCode;
  const rainCode = (code >= 51 && code <= 67) || (code >= 80 && code <= 99);
  if (conditions.precipitationMm > 0.1 || rainCode) contexts.add('RAINY');

  return contexts;
}

export function scoreUpsellItems<T extends ContextualItem>(
  items: readonly T[],
  activeContexts: ReadonlySet<string>,
): T[] {
  return items
    .map((item, index) => {
      const configured =
        item.upsellContexts?.length && item.upsellContexts.length > 0
          ? item.upsellContexts
          : (item.tags ?? []);
      const matchingContexts = new Set(
        configured.filter(
          (context): context is UpsellContext =>
            CONTEXT_SET.has(context) && activeContexts.has(context),
        ),
      );
      const contextBonus = Math.min(
        [...matchingContexts].reduce(
          (total, context) => total + CONTEXT_WEIGHTS[context],
          0,
        ),
        MAX_CONTEXT_BONUS,
      );

      return {
        item,
        index,
        score: (items.length - index) * 10 + contextBonus,
      };
    })
    .sort((left, right) => right.score - left.score || left.index - right.index)
    .map(({ item }) => item);
}
