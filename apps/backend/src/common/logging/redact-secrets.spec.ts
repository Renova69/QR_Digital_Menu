import { redactDiagnosticText, redactSecrets } from './redact-secrets';

// Credential-shaped fixtures are assembled at runtime from fragments rather
// than written as literals. A literal here is indistinguishable from a real
// credential to gitleaks and to this repo's own staged-diff scanner, and the
// files that test redaction are exactly the ones that must stay fully scanned —
// so the fixtures must not be what forces an exemption.
const STRIPE_SECRET_KEY = ['sk', 'live', '51NabcdefGHIJ'].join('_');
const JWT = [
  'eyJhbGciOiJIUzI1NiJ9',
  'eyJzdWIiOiJ1c2VyIn0',
  'c2lnbmF0dXJl',
].join('.');
const JWT_HEADER_SEGMENT = JWT.split('.')[0];

describe('redactSecrets', () => {
  it('strips the password from a Postgres connection URI in error text', () => {
    const text =
      'Error: P1001 cannot reach postgresql://postgres.abc:s3cr3t-pw@aws-0-eu.pooler.example.supabase.com:6543/postgres';

    const redacted = redactSecrets(text);

    expect(redacted).not.toContain('s3cr3t-pw');
    expect(redacted).toContain('postgresql://:redacted@');
    expect(redacted).toContain('pooler.example.supabase.com:6543');
  });

  it('strips the password from a rediss:// URI', () => {
    const redacted = redactSecrets(
      'connect ECONNREFUSED rediss://default:abc123@redis.example:6379',
    );

    expect(redacted).not.toContain('abc123');
    expect(redacted).toContain('rediss://:redacted@redis.example:6379');
  });

  it('redacts secret-bearing query parameters but keeps the rest of the URL', () => {
    const redacted = redactSecrets(
      'Request failed: https://api.deepl.com/v2/translate?auth_key=1234-abcd&target_lang=BG',
    );

    expect(redacted).not.toContain('1234-abcd');
    expect(redacted).toContain('auth_key=:redacted');
    expect(redacted).toContain('target_lang=BG');
  });

  it('redacts a bearer credential quoted out of a header', () => {
    const redacted = redactSecrets(
      `Unauthorized (Authorization: Bearer ${STRIPE_SECRET_KEY})`,
    );

    expect(redacted).not.toContain(STRIPE_SECRET_KEY);
    expect(redacted).toContain('Bearer :redacted');
  });

  it('redacts a bare JWT wherever it appears', () => {
    const redacted = redactSecrets(`jwt malformed: ${JWT} trailing`);

    expect(redacted).not.toContain(JWT_HEADER_SEGMENT);
    expect(redacted).toBe('jwt malformed: :redacted trailing');
  });

  it('leaves text without secrets untouched', () => {
    const text = 'Order 42 failed validation: Invalid choice selected';

    expect(redactSecrets(text)).toBe(text);
  });

  it('is idempotent, so double-scrubbing cannot corrupt a message', () => {
    const once = redactSecrets('rediss://default:abc123@redis.example:6379');

    expect(redactSecrets(once)).toBe(once);
  });

  it('returns an empty string for non-string input', () => {
    expect(redactSecrets(undefined)).toBe('');
    expect(redactSecrets(null)).toBe('');
    expect(redactSecrets(42)).toBe('');
  });
});

describe('redactDiagnosticText', () => {
  it('also covers path-shaped secrets, which redactSecrets alone does not', () => {
    const text =
      'GET https://api.example.com/api/v1/payments/session/9f8e7d6c/bill failed';

    expect(redactSecrets(text)).toContain('9f8e7d6c');
    expect(redactDiagnosticText(text)).not.toContain('9f8e7d6c');
    expect(redactDiagnosticText(text)).toContain('/session/:token/bill');
  });

  it('covers both kinds of secret in one string', () => {
    const redacted = redactDiagnosticText(
      'reservations/public/1/manage/tok_abc123 rejected by postgresql://u:pw@db.example:5432/db',
    );

    expect(redacted).not.toContain('tok_abc123');
    expect(redacted).not.toContain(':pw@');
    expect(redacted).toContain('/manage/:token');
  });
});
