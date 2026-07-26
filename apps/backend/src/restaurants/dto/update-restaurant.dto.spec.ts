import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { UpdateRestaurantDto } from './update-restaurant.dto';
import {
  MAX_TARGET_LANGUAGES,
  SUPPORTED_TARGET_LANGUAGE_CODES,
} from '../restaurant-languages';

/** Phase 1 — restaurant branding/schedule input validation (#14). */
function validate(payload: Record<string, unknown>) {
  const dto = plainToInstance(UpdateRestaurantDto, payload);
  return validateSync(dto, { whitelist: true });
}

function keysFor(payload: Record<string, unknown>, field: string): string[] {
  const err = validate(payload).find((e) => e.property === field);
  return err?.constraints ? Object.keys(err.constraints) : [];
}

describe('UpdateRestaurantDto validation', () => {
  it('accepts a well-formed branding/schedule payload', () => {
    const errors = validate({
      themeBgColor: '#101010',
      themeLightAccentColor: '#3b82f6',
      defaultTheme: 'dark',
      trendingMode: 'AUTO',
      happyHourStartTime: '17:30',
      happyHourEndTime: '19:00',
      happyHourDays: [1, 5, 7],
    });
    expect(errors).toHaveLength(0);
  });

  describe('theme colors', () => {
    it('rejects a non-hex color', () => {
      expect(
        keysFor({ themeBgColor: 'red; } body{display:none}' }, 'themeBgColor'),
      ).toContain('isHexColor');
    });

    it('accepts a valid hex color', () => {
      expect(validate({ themeDarkCardColor: '#1a1a1a' })).toHaveLength(0);
    });
  });

  describe('branding fonts', () => {
    it('accepts an allowlisted font', () => {
      expect(
        validate({ fontHeading: 'Playfair Display', fontBody: 'Inter' }),
      ).toHaveLength(0);
    });

    it('rejects a font outside the allowlist (injection guard #12)', () => {
      expect(
        keysFor({ fontHeading: 'Evil"; } body{}' }, 'fontHeading'),
      ).toContain('isIn');
    });

    it('rejects an over-long font name', () => {
      expect(keysFor({ fontBody: 'x'.repeat(65) }, 'fontBody')).toContain(
        'maxLength',
      );
    });
  });

  describe('logoUrl', () => {
    it('accepts an https URL', () => {
      expect(
        validate({ logoUrl: 'https://cdn.example.com/logo.png' }),
      ).toHaveLength(0);
    });

    it('rejects a non-URL string (must come from the upload pipeline which always emits http/https)', () => {
      expect(keysFor({ logoUrl: 'not-a-url' }, 'logoUrl')).toContain('isUrl');
    });

    it('rejects javascript: scheme', () => {
      expect(keysFor({ logoUrl: 'javascript:alert(1)' }, 'logoUrl')).toContain(
        'isUrl',
      );
    });

    it('rejects data: URI', () => {
      expect(
        keysFor({ logoUrl: 'data:text/html,<h1>xss</h1>' }, 'logoUrl'),
      ).toContain('isUrl');
    });

    it('rejects protocol-relative // URL', () => {
      expect(keysFor({ logoUrl: '//evil.com/logo.png' }, 'logoUrl')).toContain(
        'isUrl',
      );
    });
  });

  describe('defaultTheme', () => {
    it('rejects an unknown theme', () => {
      expect(keysFor({ defaultTheme: 'purple' }, 'defaultTheme')).toContain(
        'isIn',
      );
    });
  });

  describe('trendingMode', () => {
    it('rejects an unknown mode', () => {
      expect(keysFor({ trendingMode: 'SOMETIMES' }, 'trendingMode')).toContain(
        'isIn',
      );
    });
  });

  describe('targetLanguages', () => {
    it('accepts supported target language codes', () => {
      expect(validate({ targetLanguages: ['en', 'bg', 'ro'] })).toHaveLength(0);
    });

    it('rejects unsupported target language codes', () => {
      expect(keysFor({ targetLanguages: ['xx'] }, 'targetLanguages')).toContain(
        'isIn',
      );
    });

    it('rejects duplicate target language codes', () => {
      expect(
        keysFor({ targetLanguages: ['en', 'en'] }, 'targetLanguages'),
      ).toContain('arrayUnique');
    });

    it('rejects more than the supported language count', () => {
      expect(
        keysFor(
          {
            targetLanguages: [
              ...SUPPORTED_TARGET_LANGUAGE_CODES,
              SUPPORTED_TARGET_LANGUAGE_CODES[0],
            ],
          },
          'targetLanguages',
        ),
      ).toContain('arrayMaxSize');
      expect(SUPPORTED_TARGET_LANGUAGE_CODES).toHaveLength(
        MAX_TARGET_LANGUAGES,
      );
    });
  });

  describe('happy-hour times', () => {
    it('rejects an out-of-range time', () => {
      expect(
        keysFor({ happyHourStartTime: '25:99' }, 'happyHourStartTime'),
      ).toContain('matches');
    });

    it('rejects a non-time string', () => {
      expect(
        keysFor({ happyHourEndTime: 'evening' }, 'happyHourEndTime'),
      ).toContain('matches');
    });
  });

  describe('happyHourDays', () => {
    it('rejects 0 (Luxon weekday is 1-7)', () => {
      expect(keysFor({ happyHourDays: [0] }, 'happyHourDays')).toContain('min');
    });
  });

  describe('loyaltyMaxRedemptionPercent', () => {
    it('accepts the full owner-configurable range', () => {
      expect(validate({ loyaltyMaxRedemptionPercent: 0 })).toHaveLength(0);
      expect(validate({ loyaltyMaxRedemptionPercent: 100 })).toHaveLength(0);
    });

    it('rejects values outside 0-100 and fractional percentages', () => {
      expect(
        keysFor(
          { loyaltyMaxRedemptionPercent: -1 },
          'loyaltyMaxRedemptionPercent',
        ),
      ).toContain('min');
      expect(
        keysFor(
          { loyaltyMaxRedemptionPercent: 101 },
          'loyaltyMaxRedemptionPercent',
        ),
      ).toContain('max');
      expect(
        keysFor(
          { loyaltyMaxRedemptionPercent: 12.5 },
          'loyaltyMaxRedemptionPercent',
        ),
      ).toContain('isInt');
    });
  });
});
