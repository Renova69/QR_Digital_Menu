import { Injectable, Logger } from '@nestjs/common';
import { UpsellContext, weatherConditionsToContexts } from './upsell-context';

type RestaurantLocation = {
  city?: string | null;
  country?: string | null;
};

type ContextCacheEntry = {
  contexts: UpsellContext[];
  freshUntil: number;
  staleUntil: number;
};

const WEATHER_CACHE_MS = 20 * 60 * 1000;
const WEATHER_STALE_MS = 55 * 60 * 1000;
const WEATHER_FAILURE_CACHE_MS = 5 * 60 * 1000;
const WEATHERAPI_RAIN_CODES = new Set([
  1063, 1069, 1072, 1087, 1150, 1153, 1168, 1171, 1180, 1183, 1186, 1189, 1192,
  1195, 1198, 1201, 1204, 1207, 1240, 1243, 1246, 1249, 1252, 1273, 1276,
]);

@Injectable()
export class WeatherUpsellService {
  private readonly logger = new Logger(WeatherUpsellService.name);
  private readonly contextCache = new Map<string, ContextCacheEntry>();
  private readonly inFlight = new Map<string, Promise<Set<UpsellContext>>>();

  async getContexts(location: RestaurantLocation): Promise<Set<UpsellContext>> {
    const key = this.locationKey(location);
    if (!key || !this.isEnabled()) return new Set();

    const now = Date.now();
    const cached = this.contextCache.get(key);
    if (cached && cached.freshUntil > now) {
      return new Set(cached.contexts);
    }

    if (cached && cached.staleUntil > now) {
      void this.refresh(key, location);
      return new Set(cached.contexts);
    }

    return this.refresh(key, location);
  }

  private refresh(
    key: string,
    location: RestaurantLocation,
  ): Promise<Set<UpsellContext>> {
    const current = this.inFlight.get(key);
    if (current) return current;

    const request = this.fetchContexts(location)
      .then((contexts) => {
        const now = Date.now();
        this.contextCache.set(key, {
          contexts: [...contexts],
          freshUntil: now + WEATHER_CACHE_MS,
          staleUntil: now + WEATHER_STALE_MS,
        });
        return new Set(contexts);
      })
      .catch((error: unknown) => {
        const stale = this.contextCache.get(key);
        if (stale && stale.staleUntil > Date.now()) {
          return new Set(stale.contexts);
        }

        this.logger.debug(
          `Weather context unavailable for ${key}: ${this.errorMessage(error)}`,
        );
        const now = Date.now();
        this.contextCache.set(key, {
          contexts: [],
          freshUntil: now + WEATHER_FAILURE_CACHE_MS,
          staleUntil: now + WEATHER_FAILURE_CACHE_MS,
        });
        return new Set<UpsellContext>();
      })
      .finally(() => {
        this.inFlight.delete(key);
      });

    this.inFlight.set(key, request);
    return request;
  }

  private async fetchContexts(
    location: RestaurantLocation,
  ): Promise<Set<UpsellContext>> {
    const controller = new AbortController();
    const timeout = setTimeout(
      () => controller.abort(),
      this.requestTimeoutMs(),
    );

    try {
      const apiKey = this.apiKey();
      if (!apiKey) throw new Error('WeatherAPI.com API key is not configured');

      const url = new URL('/v1/current.json', this.baseUrl());
      url.searchParams.set('key', apiKey);
      url.searchParams.set(
        'q',
        [location.city, location.country].filter(Boolean).join(', '),
      );
      url.searchParams.set('aqi', 'no');

      const payload = (await this.fetchJson(url, controller.signal)) as {
        current?: {
          temp_c?: unknown;
          precip_mm?: unknown;
          condition?: { code?: unknown };
        };
      };
      const temperatureC = Number(payload.current?.temp_c);
      const precipitationMm = Number(payload.current?.precip_mm);
      const conditionCode = Number(payload.current?.condition?.code);
      if (
        !Number.isFinite(temperatureC) ||
        !Number.isFinite(precipitationMm) ||
        !Number.isFinite(conditionCode)
      ) {
        throw new Error('Weather provider returned incomplete current data');
      }

      return weatherConditionsToContexts({
        temperatureC,
        precipitationMm,
        weatherCode: WEATHERAPI_RAIN_CODES.has(conditionCode) ? 61 : 0,
      });
    } finally {
      clearTimeout(timeout);
    }
  }

  private async fetchJson(url: URL, signal: AbortSignal): Promise<unknown> {
    const response = await fetch(url, {
      headers: { Accept: 'application/json' },
      signal,
    });
    if (!response.ok) {
      throw new Error(`Weather provider returned HTTP ${response.status}`);
    }
    return response.json();
  }

  private locationKey(location: RestaurantLocation): string | null {
    const city = location.city?.trim().toLowerCase();
    if (!city) return null;
    const country = location.country?.trim().toLowerCase() || '';
    return `${city}|${country}`;
  }

  private isEnabled(): boolean {
    if (process.env.WEATHER_UPSELL_ENABLED === 'false') return false;
    if (
      process.env.NODE_ENV === 'test' &&
      process.env.WEATHER_UPSELL_ENABLED !== 'true'
    ) {
      return false;
    }
    return Boolean(this.apiKey());
  }

  private apiKey(): string | null {
    return process.env.WEATHERAPI_API_KEY?.trim() || null;
  }

  private baseUrl(): string {
    return (
      process.env.WEATHERAPI_BASE_URL?.trim() || 'https://api.weatherapi.com'
    );
  }

  private requestTimeoutMs(): number {
    const configured = Number(process.env.WEATHER_REQUEST_TIMEOUT_MS);
    return Number.isFinite(configured)
      ? Math.min(Math.max(configured, 250), 5000)
      : 1200;
  }

  private errorMessage(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
  }
}
