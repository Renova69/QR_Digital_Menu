import { InternalServerErrorException } from '@nestjs/common';
import * as crypto from 'crypto';

const LEGACY_PREFIX = 'v1';
const CURRENT_PREFIX = 'v2';
const V2_HKDF_SALT = Buffer.from('qr-menu/payment-secrets/v2', 'utf8');
const KEY_ID_PATTERN = /^[A-Za-z0-9._-]{1,64}$/;

export type PaymentSecretPurpose =
  'epay-secret' | 'borica-private-key' | 'mypos-private-key';

export interface PaymentSecretContext {
  restaurantId: string;
  purpose: PaymentSecretPurpose;
}

export interface PaymentSecretCryptoConfig {
  writeVersion: 'v1' | 'v2';
  allowsLegacyPlaintext: boolean;
  warnings: string[];
}

function getLegacyEncryptionKey(): Buffer {
  const source =
    process.env.PAYMENT_SECRET_LEGACY_V1_KEY ||
    process.env.EPAY_SECRET_ENCRYPTION_KEY ||
    process.env.JWT_SECRET ||
    process.env.COOKIE_SECRET ||
    (process.env.NODE_ENV === 'production' ? '' : 'dev-only-epay-secret-key');

  if (!source) {
    throw new Error(
      'EPAY_SECRET_ENCRYPTION_KEY must be set before storing ePay secrets in production',
    );
  }

  return crypto.createHash('sha256').update(source).digest();
}

function decodePrimaryKey(): Buffer {
  const encoded = process.env.PAYMENT_SECRET_ENCRYPTION_KEY?.trim();
  if (!encoded) {
    throw new Error(
      'PAYMENT_SECRET_ENCRYPTION_KEY must be set before using v2 payment secrets',
    );
  }

  const decoded = Buffer.from(encoded, 'base64');
  if (decoded.length !== 32 || decoded.toString('base64') !== encoded) {
    throw new Error(
      'PAYMENT_SECRET_ENCRYPTION_KEY must be a base64-encoded 32-byte key',
    );
  }
  return decoded;
}

function getPrimaryKeyId(): string {
  const keyId =
    process.env.PAYMENT_SECRET_ENCRYPTION_KEY_ID?.trim() || 'primary';
  if (!KEY_ID_PATTERN.test(keyId)) {
    throw new Error(
      'PAYMENT_SECRET_ENCRYPTION_KEY_ID must contain 1-64 letters, numbers, dots, underscores, or hyphens',
    );
  }
  return keyId;
}

export function validatePaymentSecretV2Key(): void {
  decodePrimaryKey();
  getPrimaryKeyId();
}

function requireContext(
  context: PaymentSecretContext | undefined,
): PaymentSecretContext {
  if (!context?.restaurantId || !context.purpose) {
    throw new Error(
      'Payment secret context is required for v2 encryption and decryption',
    );
  }
  return context;
}

function getV2Key(context: PaymentSecretContext): Buffer {
  return Buffer.from(
    crypto.hkdfSync(
      'sha256',
      decodePrimaryKey(),
      V2_HKDF_SALT,
      Buffer.from(context.purpose, 'utf8'),
      32,
    ),
  );
}

function getV2AdditionalData(
  context: PaymentSecretContext,
  keyId: string,
): Buffer {
  return Buffer.from(
    [CURRENT_PREFIX, keyId, context.restaurantId, context.purpose].join('\0'),
    'utf8',
  );
}

export function validatePaymentSecretCryptoConfig(): PaymentSecretCryptoConfig {
  const writeVersion = process.env.PAYMENT_SECRET_WRITE_VERSION || 'v1';
  if (writeVersion !== LEGACY_PREFIX && writeVersion !== CURRENT_PREFIX) {
    throw new Error('PAYMENT_SECRET_WRITE_VERSION must be either "v1" or "v2"');
  }

  if (process.env.PAYMENT_SECRET_ENCRYPTION_KEY?.trim()) {
    decodePrimaryKey();
    getPrimaryKeyId();
  } else if (writeVersion === CURRENT_PREFIX) {
    decodePrimaryKey();
  }
  if (writeVersion === LEGACY_PREFIX && process.env.NODE_ENV === 'production') {
    getLegacyEncryptionKey();
  }

  const allowsLegacyPlaintext = shouldAllowLegacyPlaintext();
  const warnings: string[] = [];
  if (writeVersion === LEGACY_PREFIX) {
    warnings.push(
      'Payment secrets are still written in legacy v1 format; deploy v2-compatible readers before switching PAYMENT_SECRET_WRITE_VERSION.',
    );
  }
  if (process.env.NODE_ENV === 'production' && allowsLegacyPlaintext) {
    warnings.push(
      'Legacy plaintext payment secrets are temporarily enabled in production.',
    );
  }

  return { writeVersion, allowsLegacyPlaintext, warnings };
}

function shouldAllowLegacyPlaintext(): boolean {
  if (process.env.NODE_ENV !== 'production') return true;
  return process.env.PAYMENT_SECRET_ALLOW_LEGACY_PLAINTEXT === 'true';
}

function decodeEnvelopePart(
  value: string,
  label: string,
  expectedLength?: number,
  allowEmpty = false,
): Buffer {
  if (value.length === 0) {
    if (allowEmpty) return Buffer.alloc(0);
    throw new Error(`Malformed ${label}`);
  }
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(value) || value.length % 4 === 1) {
    throw new Error(`Malformed ${label}`);
  }
  const decoded = Buffer.from(value, 'base64');
  if (
    decoded.toString('base64') !== value ||
    (expectedLength !== undefined && decoded.length !== expectedLength)
  ) {
    throw new Error(`Malformed ${label}`);
  }
  return decoded;
}

function encryptV1(plaintext: string): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(
    'aes-256-gcm',
    getLegacyEncryptionKey(),
    iv,
  );
  const ciphertext = Buffer.concat([
    cipher.update(plaintext, 'utf8'),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();

  return [
    LEGACY_PREFIX,
    iv.toString('base64'),
    tag.toString('base64'),
    ciphertext.toString('base64'),
  ].join(':');
}

function encryptV2(plaintext: string, context: PaymentSecretContext): string {
  const keyId = getPrimaryKeyId();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', getV2Key(context), iv);
  cipher.setAAD(getV2AdditionalData(context, keyId));
  const ciphertext = Buffer.concat([
    cipher.update(plaintext, 'utf8'),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();

  return [
    CURRENT_PREFIX,
    keyId,
    iv.toString('base64'),
    tag.toString('base64'),
    ciphertext.toString('base64'),
  ].join(':');
}

export function encryptSecretV2(
  plaintext: string,
  context: PaymentSecretContext,
): string {
  return encryptV2(plaintext, requireContext(context));
}

export function encryptSecret(
  plaintext: string,
  context?: PaymentSecretContext,
): string {
  const writeVersion = process.env.PAYMENT_SECRET_WRITE_VERSION || 'v1';
  if (writeVersion === CURRENT_PREFIX) {
    return encryptV2(plaintext, requireContext(context));
  }
  if (writeVersion !== LEGACY_PREFIX) {
    throw new Error('PAYMENT_SECRET_WRITE_VERSION must be either "v1" or "v2"');
  }
  return encryptV1(plaintext);
}

function decryptV1(parts: string[]): string {
  if (parts.length !== 4) {
    throw new Error('Malformed v1 payment secret');
  }
  const [, iv, tag, ciphertext] = parts;
  const ivBytes = decodeEnvelopePart(iv, 'v1 IV', 12);
  const tagBytes = decodeEnvelopePart(tag, 'v1 authentication tag', 16);
  const ciphertextBytes = decodeEnvelopePart(
    ciphertext,
    'v1 ciphertext',
    undefined,
    true,
  );
  const decipher = crypto.createDecipheriv(
    'aes-256-gcm',
    getLegacyEncryptionKey(),
    ivBytes,
    { authTagLength: 16 },
  );
  decipher.setAuthTag(tagBytes);
  return Buffer.concat([
    decipher.update(ciphertextBytes),
    decipher.final(),
  ]).toString('utf8');
}

function decryptV2(
  parts: string[],
  context: PaymentSecretContext | undefined,
): string {
  if (parts.length !== 5) {
    throw new Error('Malformed v2 payment secret');
  }
  const resolvedContext = requireContext(context);
  const [, keyId, iv, tag, ciphertext] = parts;
  if (!KEY_ID_PATTERN.test(keyId)) {
    throw new Error('Malformed v2 key ID');
  }
  const ivBytes = decodeEnvelopePart(iv, 'v2 IV', 12);
  const tagBytes = decodeEnvelopePart(tag, 'v2 authentication tag', 16);
  const ciphertextBytes = decodeEnvelopePart(
    ciphertext,
    'v2 ciphertext',
    undefined,
    true,
  );
  const decipher = crypto.createDecipheriv(
    'aes-256-gcm',
    getV2Key(resolvedContext),
    ivBytes,
    { authTagLength: 16 },
  );
  decipher.setAAD(getV2AdditionalData(resolvedContext, keyId));
  decipher.setAuthTag(tagBytes);
  return Buffer.concat([
    decipher.update(ciphertextBytes),
    decipher.final(),
  ]).toString('utf8');
}

export function decryptSecret(
  value: string,
  context?: PaymentSecretContext,
): string {
  const parts = value.split(':');
  if (parts[0] !== LEGACY_PREFIX && parts[0] !== CURRENT_PREFIX) {
    const allowLegacyPlaintext = shouldAllowLegacyPlaintext();
    if (!allowLegacyPlaintext) {
      throw new InternalServerErrorException(
        'Stored payment secret is not encrypted',
      );
    }
    return value;
  }

  try {
    return parts[0] === LEGACY_PREFIX
      ? decryptV1(parts)
      : decryptV2(parts, context);
  } catch {
    throw new InternalServerErrorException(
      'Stored payment secret could not be decrypted',
    );
  }
}
