import { TenantUrlService } from './tenant-url.service';

describe('TenantUrlService', () => {
  const originalFrontendUrl = process.env.FRONTEND_URL;
  let service: TenantUrlService;

  beforeEach(() => {
    service = new TenantUrlService();
  });

  afterEach(() => {
    if (originalFrontendUrl === undefined) {
      delete process.env.FRONTEND_URL;
    } else {
      process.env.FRONTEND_URL = originalFrontendUrl;
    }
  });

  it('builds the branded URL from a persisted slug', () => {
    process.env.FRONTEND_URL = 'https://menu.example.com/';

    expect(
      service.getMenuBaseUrl({ id: 'restaurant-id', slug: 'test-bistro' }),
    ).toBe('https://menu.example.com/m/test-bistro');
  });

  it('falls back to the permanent legacy URL while slug is nullable', () => {
    process.env.FRONTEND_URL = 'https://menu.example.com///';

    expect(service.getMenuBaseUrl({ id: 'restaurant id', slug: null })).toBe(
      'https://menu.example.com/menu/public/restaurant%20id',
    );
  });

  it('uses the local frontend default when FRONTEND_URL is unset', () => {
    delete process.env.FRONTEND_URL;

    expect(
      service.getMenuBaseUrl({ id: 'restaurant-id', slug: 'test-bistro' }),
    ).toBe('http://localhost:3001/m/test-bistro');
  });
});
