import {
  decryptSecret,
  encryptSecret,
  validatePaymentSecretCryptoConfig,
} from './secret-crypto';

// Jest workers run many spec files in one process, so anything this suite writes to
// process.env outlives the file and can flip an unrelated suite into production mode.
// Snapshot every key we touch and put it back rather than deleting or hardcoding.
const PER_TEST_ENV_KEYS = [
  'PAYMENT_SECRET_ENCRYPTION_KEY',
  'PAYMENT_SECRET_ENCRYPTION_KEY_ID',
  'PAYMENT_SECRET_WRITE_VERSION',
  'PAYMENT_SECRET_ALLOW_LEGACY_PLAINTEXT',
  'NODE_ENV',
] as const;

const SUITE_ENV_KEYS = [
  'EPAY_SECRET_ENCRYPTION_KEY',
  ...PER_TEST_ENV_KEYS,
] as const;

describe('secret-crypto', () => {
  const originalEnv = new Map<string, string | undefined>();

  const restoreEnv = (keys: readonly string[]): void => {
    for (const key of keys) {
      const original = originalEnv.get(key);
      if (original === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = original;
      }
    }
  };

  beforeAll(() => {
    for (const key of SUITE_ENV_KEYS) {
      originalEnv.set(key, process.env[key]);
    }
    process.env.EPAY_SECRET_ENCRYPTION_KEY = '01234567890123456789012345678901';
  });

  afterEach(() => {
    restoreEnv(PER_TEST_ENV_KEYS);
  });

  afterAll(() => {
    restoreEnv(SUITE_ENV_KEYS);
  });

  it('should encrypt and decrypt successfully', () => {
    const plain = 'my-secret-data';
    const cipher = encryptSecret(plain);
    expect(cipher).not.toBe(plain);
    const decrypted = decryptSecret(cipher);
    expect(decrypted).toBe(plain);
  });

  it('should randomize IVs for the same plaintext', () => {
    const plain = 'my-secret-data';
    const cipher1 = encryptSecret(plain);
    const cipher2 = encryptSecret(plain);
    expect(cipher1).not.toBe(cipher2);
  });

  it('should detect tampering', () => {
    const plain = 'my-secret-data';
    const cipher = encryptSecret(plain);
    const parts = cipher.split(':');

    // Tamper with ciphertext
    const tamperedParts = [...parts];
    const replacement = tamperedParts[3].startsWith('a') ? 'b' : 'a';
    tamperedParts[3] = replacement + tamperedParts[3].substring(1);
    const tamperedCipher = tamperedParts.join(':');

    expect(tamperedCipher).not.toBe(cipher);
    expect(() => decryptSecret(tamperedCipher)).toThrow(
      'Stored payment secret could not be decrypted',
    );
  });

  it('binds v2 ciphertext to its restaurant and credential purpose', () => {
    process.env.PAYMENT_SECRET_ENCRYPTION_KEY = Buffer.alloc(32, 7).toString(
      'base64',
    );
    process.env.PAYMENT_SECRET_WRITE_VERSION = 'v2';
    const context = {
      restaurantId: 'restaurant-1',
      purpose: 'epay-secret' as const,
    };

    const cipher = encryptSecret('my-secret-data', context);

    expect(cipher).toMatch(/^v2:/);
    expect(decryptSecret(cipher, context)).toBe('my-secret-data');
    expect(() =>
      decryptSecret(cipher, {
        restaurantId: 'restaurant-2',
        purpose: 'epay-secret',
      }),
    ).toThrow('Stored payment secret could not be decrypted');
    expect(() =>
      decryptSecret(cipher, {
        restaurantId: 'restaurant-1',
        purpose: 'borica-private-key',
      }),
    ).toThrow('Stored payment secret could not be decrypted');
  });

  it('rejects legacy plaintext secrets in production unless explicitly enabled', () => {
    process.env.NODE_ENV = 'production';
    process.env.PAYMENT_SECRET_WRITE_VERSION = 'v2';
    process.env.PAYMENT_SECRET_ENCRYPTION_KEY = Buffer.alloc(32, 7).toString(
      'base64',
    );

    expect(() =>
      decryptSecret('plain-provider-secret', {
        restaurantId: 'restaurant-1',
        purpose: 'epay-secret',
      }),
    ).toThrow('Stored payment secret is not encrypted');

    process.env.PAYMENT_SECRET_ALLOW_LEGACY_PLAINTEXT = 'true';
    expect(
      decryptSecret('plain-provider-secret', {
        restaurantId: 'restaurant-1',
        purpose: 'epay-secret',
      }),
    ).toBe('plain-provider-secret');
  });

  it('requires an explicit plaintext opt-in during the v1 compatibility rollout', () => {
    process.env.NODE_ENV = 'production';
    process.env.PAYMENT_SECRET_WRITE_VERSION = 'v1';

    expect(() => decryptSecret('historical-plaintext')).toThrow(
      'Stored payment secret is not encrypted',
    );

    process.env.PAYMENT_SECRET_ALLOW_LEGACY_PLAINTEXT = 'true';
    expect(decryptSecret('historical-plaintext')).toBe('historical-plaintext');
  });

  it('rejects truncated v2 authentication tags and malformed IVs', () => {
    process.env.PAYMENT_SECRET_ENCRYPTION_KEY = Buffer.alloc(32, 7).toString(
      'base64',
    );
    process.env.PAYMENT_SECRET_WRITE_VERSION = 'v2';
    const context = {
      restaurantId: 'restaurant-1',
      purpose: 'epay-secret' as const,
    };
    const parts = encryptSecret('my-secret-data', context).split(':');

    const truncatedTag = [...parts];
    truncatedTag[3] = Buffer.from(parts[3], 'base64')
      .subarray(0, 4)
      .toString('base64');
    expect(() => decryptSecret(truncatedTag.join(':'), context)).toThrow(
      'Stored payment secret could not be decrypted',
    );

    const shortIv = [...parts];
    shortIv[2] = Buffer.alloc(4, 1).toString('base64');
    expect(() => decryptSecret(shortIv.join(':'), context)).toThrow(
      'Stored payment secret could not be decrypted',
    );

    const nonCanonicalIv = [...parts];
    nonCanonicalIv[2] = `${parts[2]}==`;
    expect(() => decryptSecret(nonCanonicalIv.join(':'), context)).toThrow(
      'Stored payment secret could not be decrypted',
    );
  });

  it('rejects delimiter-bearing key IDs before producing unreadable ciphertext', () => {
    process.env.PAYMENT_SECRET_ENCRYPTION_KEY = Buffer.alloc(32, 7).toString(
      'base64',
    );
    process.env.PAYMENT_SECRET_ENCRYPTION_KEY_ID = 'primary:2026';
    process.env.PAYMENT_SECRET_WRITE_VERSION = 'v2';

    expect(() => validatePaymentSecretCryptoConfig()).toThrow(
      'PAYMENT_SECRET_ENCRYPTION_KEY_ID',
    );
    expect(() =>
      encryptSecret('my-secret-data', {
        restaurantId: 'restaurant-1',
        purpose: 'epay-secret',
      }),
    ).toThrow('PAYMENT_SECRET_ENCRYPTION_KEY_ID');
  });

  it('validates a configured primary key before the v2 write switch', () => {
    process.env.NODE_ENV = 'production';
    process.env.PAYMENT_SECRET_WRITE_VERSION = 'v1';
    process.env.PAYMENT_SECRET_ENCRYPTION_KEY = 'not-base64';

    expect(() => validatePaymentSecretCryptoConfig()).toThrow(
      'PAYMENT_SECRET_ENCRYPTION_KEY must be a base64-encoded 32-byte key',
    );
  });

  it('rejects noncanonical Base64 payment-secret keys', () => {
    const canonicalKey = Buffer.alloc(32, 7).toString('base64');
    process.env.PAYMENT_SECRET_ENCRYPTION_KEY = `${canonicalKey}=`;

    expect(() => validatePaymentSecretCryptoConfig()).toThrow(
      'PAYMENT_SECRET_ENCRYPTION_KEY must be a base64-encoded 32-byte key',
    );

    process.env.PAYMENT_SECRET_ENCRYPTION_KEY = canonicalKey.replace(/=+$/, '');
    expect(() => validatePaymentSecretCryptoConfig()).toThrow(
      'PAYMENT_SECRET_ENCRYPTION_KEY must be a base64-encoded 32-byte key',
    );
  });

  it('fails configuration validation before a deployment can write v2 with a weak key', () => {
    process.env.PAYMENT_SECRET_WRITE_VERSION = 'v2';
    process.env.PAYMENT_SECRET_ENCRYPTION_KEY =
      Buffer.from('too-short').toString('base64');

    expect(() => validatePaymentSecretCryptoConfig()).toThrow(
      'PAYMENT_SECRET_ENCRYPTION_KEY must be a base64-encoded 32-byte key',
    );
  });
});
