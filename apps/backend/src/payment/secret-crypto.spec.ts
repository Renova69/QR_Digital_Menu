import { encryptSecret, decryptSecret } from './secret-crypto';

describe('secret-crypto', () => {
  beforeAll(() => {
    process.env.EPAY_SECRET_ENCRYPTION_KEY = '01234567890123456789012345678901';
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
    tamperedParts[3] = 'a' + tamperedParts[3].substring(1);
    const tamperedCipher = tamperedParts.join(':');

    expect(() => decryptSecret(tamperedCipher)).toThrow(
      'Stored payment secret could not be decrypted',
    );
  });
});
