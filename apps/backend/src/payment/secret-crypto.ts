import * as crypto from 'crypto';

const PREFIX = 'v1';

function getEncryptionKey(): Buffer {
  const source =
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

export function encryptSecret(plaintext: string): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', getEncryptionKey(), iv);
  const ciphertext = Buffer.concat([
    cipher.update(plaintext, 'utf8'),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();

  return [
    PREFIX,
    iv.toString('base64'),
    tag.toString('base64'),
    ciphertext.toString('base64'),
  ].join(':');
}

export function decryptSecret(value: string): string {
  const parts = value.split(':');
  if (parts.length !== 4 || parts[0] !== PREFIX) {
    return value;
  }

  const [, iv, tag, ciphertext] = parts;
  const decipher = crypto.createDecipheriv(
    'aes-256-gcm',
    getEncryptionKey(),
    Buffer.from(iv, 'base64'),
  );
  decipher.setAuthTag(Buffer.from(tag, 'base64'));

  return Buffer.concat([
    decipher.update(Buffer.from(ciphertext, 'base64')),
    decipher.final(),
  ]).toString('utf8');
}
