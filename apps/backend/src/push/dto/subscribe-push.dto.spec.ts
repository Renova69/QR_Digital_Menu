import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { SubscribePushDto } from './subscribe-push.dto';

/** Mirrors the global pipe config in main.ts exactly. */
function validate(payload: Record<string, unknown>) {
  const dto = plainToInstance(SubscribePushDto, payload);
  return validateSync(dto, { whitelist: true, forbidNonWhitelisted: true });
}

/**
 * Exactly what the browser's native PushSubscription.toJSON() emits — the
 * frontend posts this verbatim (pushSubscription.ts). `expirationTime` is
 * ALWAYS present and is null on every current browser, so the DTO must
 * declare it or forbidNonWhitelisted rejects the whole subscription with
 * "property expirationTime should not exist".
 */
const browserSubscription = {
  endpoint: 'https://fcm.googleapis.com/fcm/send/abc123',
  expirationTime: null,
  keys: { p256dh: 'p256dh-key', auth: 'auth-key' },
};

describe('SubscribePushDto validation', () => {
  it('accepts a real PushSubscription.toJSON() payload (expirationTime: null)', () => {
    expect(validate(browserSubscription)).toHaveLength(0);
  });

  it('accepts a numeric expirationTime', () => {
    expect(
      validate({ ...browserSubscription, expirationTime: 1786073642000 }),
    ).toHaveLength(0);
  });

  it('accepts the payload with expirationTime omitted entirely', () => {
    const { expirationTime: _omitted, ...withoutExpiry } = browserSubscription;

    expect(validate(withoutExpiry)).toHaveLength(0);
  });

  it('still rejects a genuinely unknown property', () => {
    const errors = validate({ ...browserSubscription, bogusField: 'x' });

    expect(errors).toHaveLength(1);
    expect(errors[0].property).toBe('bogusField');
  });

  // @ValidateNested() alone silently passes a missing `keys`, which then threw
  // on `keys.p256dh` in createSubscription — a 500 on malformed client input.
  it('rejects a missing keys object rather than 500ing downstream', () => {
    const { keys: _dropped, ...withoutKeys } = browserSubscription;
    const errors = validate(withoutKeys);

    expect(errors).toHaveLength(1);
    expect(errors[0].property).toBe('keys');
  });

  it('rejects a null keys object', () => {
    expect(validate({ ...browserSubscription, keys: null })).not.toHaveLength(
      0,
    );
  });

  it('rejects keys that is not an object', () => {
    expect(
      validate({ ...browserSubscription, keys: 'p256dh' }),
    ).not.toHaveLength(0);
  });

  it('rejects keys missing p256dh', () => {
    expect(
      validate({ ...browserSubscription, keys: { auth: 'auth-key' } }),
    ).not.toHaveLength(0);
  });
});
