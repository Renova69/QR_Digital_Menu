import { readFileSync } from 'fs';
import { join } from 'path';

/**
 * `main.ts` cannot be imported in a unit test — doing so boots Nest, connects
 * Prisma and binds a port. The wiring it performs is still an invariant worth
 * pinning, so this reads the source and asserts the ordering directly. The
 * alternative is that someone moves the listener below bootstrap() and nothing
 * fails until a rejection during boot goes unreported in production.
 */
describe('main.ts fatal-error wiring', () => {
  const source = readFileSync(join(__dirname, 'main.ts'), 'utf8');

  it('installs the unhandled-rejection listener before bootstrap is called', () => {
    const install = source.indexOf('installFatalErrorHandlers()');
    const bootstrapCall = source.indexOf('void bootstrap()');

    expect(install).toBeGreaterThan(-1);
    expect(bootstrapCall).toBeGreaterThan(-1);
    expect(install).toBeLessThan(bootstrapCall);
  });

  it('routes a boot failure through the shared fatal handler', () => {
    expect(source).toContain("handleFatalError(error, 'bootstrap')");
  });

  it('leaves termination to the fatal handler rather than exiting inline', () => {
    // bootstrap() used to catch its own failure, log it and call
    // process.exit(1) — no Sentry capture, no flush.
    expect(source).not.toContain('process.exit');
  });
});
