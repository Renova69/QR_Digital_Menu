import { Injectable, Logger } from '@nestjs/common';
import { UpsellContext, weatherConditionsToContexts } from './upsell-context';

type RestaurantLocation = {
  city?: string | null;
  country?: string | null;
};

type Coordinates = {
  latitude: number;
  longitude: number;
};

type ContextCacheEntry = {
  contexts: UpsellContext[];
  freshUntil: number;
  staleUntil: number;
};

const WEATHER_CACHE_MS = 20 * 60 * 1000;
const WEATHER_STALE_MS = 2 * 60 * 60 * 1000;
const WEATHER_FAILURE_CACHE_MS = 5 * 60 * 1000;
const GEOCODE_CACHE_MS = 7 * 24 * 60 * 60 * 1000;

@Injectable()
export class WeatherUpsellService {
  private readonly logger = new Logger(WeatherUpsellService.name);
  private readonly contextCache = new Map<string, ContextCacheEntry>();
  private readonly geocodeCache = new Map<
    string,
    { coordinates: Coordinates; expiresAt: number }
  >();
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

    const request = this.fetchContexts(key, location)
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
    key: string,
    location: RestaurantLocation,
  ): Promise<Set<UpsellContext>> {
    const controller = new AbortController();
    const timeout = setTimeout(
      () => controller.abort(),
      this.requestTimeoutMs(),
    );

    try {
      const coordinates = await this.getCoordinates(
        key,
        location,
        controller.signal,
      );
      const url = new URL('/v1/forecast', this.forecastBaseUrl());
      url.searchParams.set('latitude', String(coordinates.latitude));
      url.searchParams.set('longitude', String(coordinates.longitude));
      url.searchParams.set(
        'current',
        'temperature_2m,precipitation,weather_code',
      );
      url.searchParams.set('forecast_days', '1');
      this.appendApiKey(url);

      const payload = (await this.fetchJson(url, controller.signal)) as {
        current?: {
          temperature_2m?: unknown;
          precipitation?: unknown;
          weather_code?: unknown;
        };
      };
      const temperatureC = Number(payload.current?.temperature_2m);
      const precipitationMm = Number(payload.current?.precipitation);
      const weatherCode = Number(payload.current?.weather_code);
      if (
        !Number.isFinite(temperatureC) ||
        !Number.isFinite(precipitationMm) ||
        !Number.isFinite(weatherCode)
      ) {
        throw new Error('Weather provider returned incomplete current data');
      }

      return weatherConditionsToContexts({
        temperatureC,
        precipitationMm,
        weatherCode,
      });
    } finally {
      clearTimeout(timeout);
    }
  }

  private async getCoordinates(
    key: string,
    location: RestaurantLocation,
    signal: AbortSignal,
  ): Promise<Coordinates> {
    const cached = this.geocodeCache.get(key);
    if (cached && cached.expiresAt > Date.now()) return cached.coordinates;

    const url = new URL('/v1/search', this.geocodingBaseUrl());
    url.searchParams.set(
      'name',
      [location.city, location.country].filter(Boolean).join(', '),
    );
    url.searchParams.set('count', '1');
    url.searchParams.set('language', 'en');
    url.searchParams.set('format', 'json');
    this.appendApiKey(url);

    const payload = (await this.fetchJson(url, signal)) as {
      results?: Array<{ latitude?: unknown; longitude?: unknown }>;
    };
    const latitude = Number(payload.results?.[0]?.latitude);
    const longitude = Number(payload.results?.[0]?.longitude);
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
      throw new Error('Restaurant location could not be geocoded');
    }

    const coordinates = { latitude, longitude };
    this.geocodeCache.set(key, {
      coordinates,
      expiresAt: Date.now() + GEOCODE_CACHE_MS,
    });
    return coordinates;
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
    const hasCommercialKey = Boolean(process.env.OPEN_METEO_API_KEY);
    const hasCustomProvider = Boolean(
      process.env.WEATHER_API_BASE_URL &&
      process.env.WEATHER_GEOCODING_BASE_URL,
    );
    return (
      process.env.NODE_ENV !== 'production' ||
      hasCommercialKey ||
      hasCustomProvider
    );
  }

  private forecastBaseUrl(): string {
    if (process.env.WEATHER_API_BASE_URL) {
      return process.env.WEATHER_API_BASE_URL;
    }
    return process.env.OPEN_METEO_API_KEY
      ? 'https://customer-api.open-meteo.com'
      : 'https://api.open-meteo.com';
  }

  private geocodingBaseUrl(): string {
    if (process.env.WEATHER_GEOCODING_BASE_URL) {
      return process.env.WEATHER_GEOCODING_BASE_URL;
    }
    return process.env.OPEN_METEO_API_KEY
      ? 'https://customer-geocoding-api.open-meteo.com'
      : 'https://geocoding-api.open-meteo.com';
  }

  private appendApiKey(url: URL): void {
    if (
      process.env.OPEN_METEO_API_KEY &&
      url.hostname.endsWith('open-meteo.com')
    ) {
      url.searchParams.set('apikey', process.env.OPEN_METEO_API_KEY);
    }
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
