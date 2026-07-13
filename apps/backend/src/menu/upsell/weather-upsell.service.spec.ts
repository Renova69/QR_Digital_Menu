import { WeatherUpsellService } from './weather-upsell.service';

describe('WeatherUpsellService', () => {
  const originalNodeEnv = process.env.NODE_ENV;
  const originalApiKey = process.env.WEATHERAPI_API_KEY;
  const originalEnabled = process.env.WEATHER_UPSELL_ENABLED;
  const originalWeatherBase = process.env.WEATHERAPI_BASE_URL;

  const restoreEnv = (key: string, value: string | undefined) => {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  };

  beforeEach(() => {
    process.env.NODE_ENV = 'test';
    process.env.WEATHERAPI_API_KEY = 'test-key';
    process.env.WEATHER_UPSELL_ENABLED = 'true';
    delete process.env.WEATHERAPI_BASE_URL;
    jest.restoreAllMocks();
  });

  afterAll(() => {
    restoreEnv('NODE_ENV', originalNodeEnv);
    restoreEnv('WEATHERAPI_API_KEY', originalApiKey);
    restoreEnv('WEATHER_UPSELL_ENABLED', originalEnabled);
    restoreEnv('WEATHERAPI_BASE_URL', originalWeatherBase);
  });

  it('maps WeatherAPI.com current conditions and caches the result', async () => {
    const fetchMock = jest.spyOn(global, 'fetch').mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          current: {
            temp_c: 7,
            precip_mm: 0,
            condition: { code: 1183 },
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

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const requestUrl = new URL(String(fetchMock.mock.calls[0][0]));
    expect(`${requestUrl.origin}${requestUrl.pathname}`).toBe(
      'https://api.weatherapi.com/v1/current.json',
    );
    expect(requestUrl.searchParams.get('key')).toBe('test-key');
    expect(requestUrl.searchParams.get('q')).toBe('Sofia, Bulgaria');
    expect(requestUrl.searchParams.get('aqi')).toBe('no');
  });

  it('deduplicates concurrent cache misses for the same location', async () => {
    let resolveWeather: ((response: Response) => void) | undefined;
    const fetchMock = jest.spyOn(global, 'fetch').mockReturnValueOnce(
      new Promise<Response>((resolve) => {
        resolveWeather = resolve;
      }),
    );
    const service = new WeatherUpsellService();

    const first = service.getContexts({ city: 'Varna', country: 'Bulgaria' });
    const second = service.getContexts({ city: 'Varna', country: 'Bulgaria' });
    resolveWeather!(
      new Response(
        JSON.stringify({
          current: {
            temp_c: 28,
            precip_mm: 0,
            condition: { code: 1000 },
          },
        }),
        { status: 200 },
      ),
    );

    await expect(Promise.all([first, second])).resolves.toEqual([
      new Set(['HOT']),
      new Set(['HOT']),
    ]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
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
    delete process.env.WEATHERAPI_API_KEY;
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

  it('supports a WeatherAPI-compatible base URL override', async () => {
    process.env.WEATHERAPI_BASE_URL = 'https://weather.internal.example';
    const fetchMock = jest.spyOn(global, 'fetch').mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          current: {
            temp_c: 18,
            precip_mm: 0,
            condition: { code: 1000 },
          },
        }),
        { status: 200 },
      ),
    );
    const service = new WeatherUpsellService();

    await expect(
      service.getContexts({ city: 'Sofia', country: 'Bulgaria' }),
    ).resolves.toEqual(new Set());
    expect(String(fetchMock.mock.calls[0][0])).toContain(
      'weather.internal.example/v1/current.json',
    );
  });
});
