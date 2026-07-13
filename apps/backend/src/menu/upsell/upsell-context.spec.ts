import { DateTime } from 'luxon';
import {
  getTimeUpsellContexts,
  scoreUpsellItems,
  weatherConditionsToContexts,
} from './upsell-context';

describe('upsell context', () => {
  it('uses the restaurant timezone and adds a dedicated Friday-night context', () => {
    const instant = DateTime.fromISO('2026-01-16T18:30:00Z');

    expect([...getTimeUpsellContexts('Europe/Sofia', instant)]).toEqual([
      'EVENING',
      'FRIDAY_NIGHT',
    ]);
    expect([...getTimeUpsellContexts('America/New_York', instant)]).toEqual([
      'LUNCH',
    ]);
  });

  it('derives stable weather contexts at the configured boundaries', () => {
    expect([
      ...weatherConditionsToContexts({
        temperatureC: 10,
        precipitationMm: 0,
        weatherCode: 3,
      }),
    ]).toEqual(['COLD']);

    expect([
      ...weatherConditionsToContexts({
        temperatureC: 26,
        precipitationMm: 0.4,
        weatherCode: 61,
      }),
    ]).toEqual(['HOT', 'RAINY']);
  });

  it('lets a relevant nearby item move up while preserving a strong base rank', () => {
    const items = [
      { id: 'first', upsellContexts: [] },
      { id: 'morning', upsellContexts: ['MORNING'] },
      { id: 'cold-morning', upsellContexts: ['MORNING', 'COLD'] },
      { id: 'last', upsellContexts: [] },
    ];

    expect(
      scoreUpsellItems(items, new Set(['MORNING', 'COLD'])).map(
        (item) => item.id,
      ),
    ).toEqual(['cold-morning', 'morning', 'first', 'last']);
  });

  it('recognizes legacy context tags without allowing unknown tags to score', () => {
    const items = [
      { id: 'first', tags: [] },
      { id: 'legacy', tags: ['MORNING', 'HOT_DRINK'] },
    ];

    expect(
      scoreUpsellItems(items, new Set(['MORNING'])).map((item) => item.id),
    ).toEqual(['legacy', 'first']);
  });
});
