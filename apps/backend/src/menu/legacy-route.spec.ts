import { readFileSync } from 'node:fs';
import { join } from 'node:path';

describe('legacy public menu route', () => {
  // Hard invariant: every QR code already printed encodes
  // /menu/public/:restaurantId. This route is never redirected and never
  // removed. If this test fails, someone is about to break physical media.
  it('still exists and is not redirected', () => {
    const source = readFileSync(
      join(__dirname, 'public-menu.controller.ts'),
      'utf8',
    );
    expect(source).toContain("@Get('public/:restaurantId')");
    expect(source).not.toMatch(/Redirect\(\s*['"`]\/m\//);
  });
});
