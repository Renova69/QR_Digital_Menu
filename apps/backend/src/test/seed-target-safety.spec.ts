import { assertLocalSeedTarget } from '../../scripts/seed-target-safety';

describe('seed target safety', () => {
  it('accepts a named local PostgreSQL database', () => {
    expect(
      assertLocalSeedTarget(
        'postgresql://postgres:example-password@localhost:5432/qr_menu_dev',
        'development',
      ),
    ).toEqual({ database: 'qr_menu_dev', host: 'localhost' });
  });

  it.each([
    undefined,
    'postgresql://postgres:example-password@db.example.com:5432/qr_menu_dev',
    'postgresql://postgres:example-password@localhost:5432/postgres',
  ])('rejects missing, remote, and maintenance targets', (target) => {
    expect(() => assertLocalSeedTarget(target, 'development')).toThrow(
      /Seed aborted/,
    );
  });

  it('has no production or remote override', () => {
    expect(() =>
      assertLocalSeedTarget(
        'postgresql://postgres:example-password@localhost:5432/qr_menu_dev',
        'production',
      ),
    ).toThrow(/NODE_ENV=production/);
  });
});
