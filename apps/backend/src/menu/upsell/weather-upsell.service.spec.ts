import { WeatherUpsellService } from './weather-upsell.service';

describe('WeatherUpsellService', () => {
  const originalNodeEnv = process.env.NODE_ENV;
  const originalApiKey = process.env.OPEN_METEO_API_KEY;
  const originalEnabled = process.env.WEATHER_UPSELL_ENABLED;
  const originalWeatherBase = process.env.WEATHER_API_BASE_URL;
  const originalGeocodingBase = process.env.WEATHER_GEOCODING_BASE_URL;

  const restoreEnv = (key: string, value: string | undefined) => {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  };

  beforeEach(() => {
    process.env.NODE_ENV = 'test';
    delete process.env.OPEN_METEO_API_KEY;
    process.env.WEATHER_UPSELL_ENABLED = 'true';
    delete process.env.WEATHER_API_BASE_URL;
    delete process.env.WEATHER_GEOCODING_BASE_URL;
    jest.restoreAllMocks();
  });

  afterAll(() => {
    restoreEnv('NODE_ENV', originalNodeEnv);
    restoreEnv('OPEN_METEO_API_KEY', originalApiKey);
    restoreEnv('WEATHER_UPSELL_ENABLED', originalEnabled);
    restoreEnv('WEATHER_API_BASE_URL', originalWeatherBase);
    restoreEnv('WEATHER_GEOCODING_BASE_URL', originalGeocodingBase);
  });

  it('geocodes the restaurant, maps current weather, and caches the result', async () => {
    const fetchMock = jest
      .spyOn(global, 'fetch')
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            results: [{ latitude: 42.6977, longitude: 23.3219 }],
          }),
          { status: 200 },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            current: {
              temperature_2m: 7,
              precipitation: 0.3,
              weather_code: 61,
            },
          }),
          { status: 200 },
        ),
      );
    const service = new WeatherUpsellService();

    await expect(
      service.getContexts({ city: 'Sofia', country: 'Bulgaria' }),
    ).resolves.toEqual(new Set(['COLD', 'RAINY']));
    await expect(
      service.getContexts({ city: 'Sofia', country: 'Bulgaria' }),
    ).resolves.toEqual(new Set(['COLD', 'RAINY']));

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(String(fetchMock.mock.calls[0][0])).toContain(
      'geocoding-api.open-meteo.com/v1/search',
    );
    expect(String(fetchMock.mock.calls[1][0])).toContain(
      'api.open-meteo.com/v1/forecast',
    );
  });

  it('deduplicates concurrent cache misses for the same location', async () => {
    let resolveGeocode: ((response: Response) => void) | undefined;
    const fetchMock = jest
      .spyOn(global, 'fetch')
      .mockReturnValueOnce(
        new Promise<Response>((resolve) => {
          resolveGeocode = resolve;
        }),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            current: {
              temperature_2m: 28,
              precipitation: 0,
              weather_code: 1,
            },
          }),
          { status: 200 },
        ),
      );
    const service = new WeatherUpsellService();

    const first = service.getContexts({ city: 'Varna', country: 'Bulgaria' });
    const second = service.getContexts({ city: 'Varna', country: 'Bulgaria' });
    resolveGeocode!(
      new Response(
        JSON.stringify({
          results: [{ latitude: 43.2141, longitude: 27.9147 }],
        }),
        { status: 200 },
      ),
    );

    await expect(Promise.all([first, second])).resolves.toEqual([
      new Set(['HOT']),
      new Set(['HOT']),
    ]);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('falls back to no weather context when the provider fails', async () => {
    jest.spyOn(global, 'fetch').mockRejectedValue(new Error('offline'));
    const service = new WeatherUpsellService();

    await expect(
      service.getContexts({ city: 'Sofia', country: 'Bulgaria' }),
    ).resolves.toEqual(new Set());
  });

  it('does not call the public free endpoint in production without a key', async () => {
    process.env.NODE_ENV = 'production';
    const fetchMock = jest.spyOn(global, 'fetch');
    const service = new WeatherUpsellService();

    await expect(
      service.getContexts({ city: 'Sofia', country: 'Bulgaria' }),
    ).resolves.toEqual(new Set());
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('does not make external requests in tests unless explicitly enabled', async () => {
    delete process.env.WEATHER_UPSELL_ENABLED;
    const fetchMock = jest.spyOn(global, 'fetch');
    const service = new WeatherUpsellService();

    await expect(
      service.getContexts({ city: 'Sofia', country: 'Bulgaria' }),
    ).resolves.toEqual(new Set());
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('requires both custom provider URLs in production', async () => {
    process.env.NODE_ENV = 'production';
    process.env.WEATHER_API_BASE_URL = 'https://weather.internal.example';
    const fetchMock = jest.spyOn(global, 'fetch');
    const service = new WeatherUpsellService();

    await expect(
      service.getContexts({ city: 'Sofia', country: 'Bulgaria' }),
    ).resolves.toEqual(new Set());
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
