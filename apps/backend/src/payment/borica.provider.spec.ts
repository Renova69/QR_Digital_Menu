import * as fs from 'fs';
import * as path from 'path';
import { BoricaProvider } from './borica.provider';

const FIXTURES = path.join(__dirname, '__fixtures__');
const PRIVATE_KEY_PEM = fs.readFileSync(
  path.join(FIXTURES, 'borica-test.key'),
  'utf8',
);
const CERT_PEM = fs.readFileSync(
  path.join(FIXTURES, 'borica-test.cer'),
  'utf8',
);

// Sandbox TID / MID from the bundled test keypair
const TERMINAL = 'V1800001';
const MERCHANT = '1600000001';

describe('BoricaProvider', () => {
  let provider: BoricaProvider;

  beforeEach(() => {
    provider = new BoricaProvider();
  });

  describe('getActionUrl', () => {
    it('returns dev gateway for DEMO mode', () => {
      expect(provider.getActionUrl('DEMO')).toContain('3dsgate-dev.borica.bg');
    });

    it('returns prod gateway for LIVE mode', () => {
      expect(provider.getActionUrl('LIVE')).toContain('3dsgate.borica.bg');
    });
  });

  describe('signSale', () => {
    it('produces a non-empty uppercase-hex P_SIGN', () => {
      const psign = provider.signSale(
        {
          TERMINAL,
          TRTYPE: '1',
          AMOUNT: '10.00',
          CURRENCY: 'EUR',
          ORDER: '000001',
          TIMESTAMP: '20260605120000',
          NONCE: 'ABCDEF01234567890123456789ABCDEF',
        },
        PRIVATE_KEY_PEM,
      );
      expect(psign).toBeTruthy();
      expect(psign).toMatch(/^[0-9A-F]+$/);
    });

    it('signSale self-verifies with extracted public key', () => {
      // Verify that signSale output is a valid RSA-SHA256 signature over the
      // MAC_GENERAL string by checking against the public key derived from the
      // same private key.  (In production the SALE P_SIGN is verified by BORICA
      // on their side — we can't verify it with BORICA's cert here.)
      const fields = {
        TERMINAL,
        TRTYPE: '1',
        AMOUNT: '25.50',
        CURRENCY: 'EUR',
        ORDER: '000042',
        TIMESTAMP: '20260605120000',
        NONCE: 'ABCDEF01234567890123456789ABCDEF',
      };

      const psign = provider.signSale(fields, PRIVATE_KEY_PEM);
      const macMsg =
        `${TERMINAL.length}${TERMINAL}` +
        `${'1'.length}${'1'}` +
        `${'25.50'.length}25.50` +
        `${'EUR'.length}EUR` +
        `${'000042'.length}000042` +
        `${'20260605120000'.length}20260605120000` +
        `${'ABCDEF01234567890123456789ABCDEF'.length}ABCDEF01234567890123456789ABCDEF` +
        '-';

      const { createPublicKey, createVerify } = require('crypto');
      const pubKey = createPublicKey(PRIVATE_KEY_PEM);
      const ok = createVerify('RSA-SHA256')
        .update(macMsg)
        .verify(pubKey, Buffer.from(psign, 'hex'));
      expect(ok).toBe(true);
    });
  });

  describe('verifyResult', () => {
    // Helper: build a realistic callback body signed with a given private key so
    // we can verify it against the corresponding public key / cert.
    function buildSignedCallback(
      privateKeyPem: string,
      overrides: Partial<Record<string, string>> = {},
    ): Record<string, string> {
      const { createSign } = require('crypto');
      const base: Record<string, string> = {
        ACTION: '0',
        RC: '00',
        APPROVAL: '123456',
        TERMINAL,
        TRTYPE: '1',
        AMOUNT: '10.00',
        CURRENCY: 'EUR',
        ORDER: '000099',
        RRN: '123456789012',
        INT_REF: 'ABCDEF123456',
        PARES_STATUS: 'Y',
        ECI: '05',
        TIMESTAMP: '20260605120000',
        NONCE: 'ABCDEF01234567890123456789ABCDEF',
        P_SIGN: '',
        ...overrides,
      };

      const macFields = [
        'ACTION', 'RC', 'APPROVAL', 'TERMINAL', 'TRTYPE', 'AMOUNT',
        'CURRENCY', 'ORDER', 'RRN', 'INT_REF', 'PARES_STATUS', 'ECI',
        'TIMESTAMP', 'NONCE',
      ];
      const msg = macFields.map((k) => `${base[k].length}${base[k]}`).join('') + '-';
      base.P_SIGN = createSign('RSA-SHA256').update(msg).sign(privateKeyPem, 'hex').toUpperCase();
      return base;
    }

    it('verifies a correctly signed callback (self-signed with test key)', () => {
      // In production BORICA signs with their private key and we verify with
      // their cert. Here we sign with test.key and verify with the extracted
      // public key to prove the verify logic is correct.
      const { createPublicKey } = require('crypto');
      const pubKeyPem = createPublicKey(PRIVATE_KEY_PEM).export({ type: 'spki', format: 'pem' }) as string;

      const body = buildSignedCallback(PRIVATE_KEY_PEM);
      const result = provider.verifyResult(body, pubKeyPem);
      expect(result.verified).toBe(true);
      expect(result.order).toBe('000099');
      expect(result.rc).toBe('00');
      expect(result.action).toBe('0');
    });

    it('rejects tampered AMOUNT', () => {
      const { createPublicKey } = require('crypto');
      const pubKeyPem = createPublicKey(PRIVATE_KEY_PEM).export({ type: 'spki', format: 'pem' }) as string;

      const body = buildSignedCallback(PRIVATE_KEY_PEM);
      // Tamper amount after signing
      const tamperedBody = { ...body, AMOUNT: '9999.00' };

      const result = provider.verifyResult(tamperedBody, pubKeyPem);
      expect(result.verified).toBe(false);
    });

    it('rejects invalid P_SIGN', () => {
      const body: Record<string, string> = {
        ACTION: '0',
        RC: '00',
        APPROVAL: '123456',
        TERMINAL,
        TRTYPE: '1',
        AMOUNT: '10.00',
        CURRENCY: 'EUR',
        ORDER: '000001',
        RRN: '123456789012',
        INT_REF: 'ABCDEF123456',
        PARES_STATUS: 'Y',
        ECI: '05',
        TIMESTAMP: '20260605120000',
        NONCE: 'ABCDEF01234567890123456789ABCDEF',
        P_SIGN: 'DEADBEEF',
      };
      const result = provider.verifyResult(body, CERT_PEM);
      expect(result.verified).toBe(false);
    });
  });

  describe('buildSaleForm', () => {
    it('sets mandatory fields', () => {
      const form = provider.buildSaleForm({
        mode: 'DEMO',
        terminal: TERMINAL,
        merchant: MERCHANT,
        merchantName: 'My Restaurant',
        email: 'owner@restaurant.bg',
        order: '000007',
        amount: 49.99,
        currency: 'BGN',
        description: 'Table 5 bill',
        backref: 'https://example.com/api/v1/payments/borica/callback',
        lang: 'BG',
        privateKeyPem: PRIVATE_KEY_PEM,
      });

      expect(form.method).toBe('POST');
      expect(form.action).toContain('3dsgate-dev.borica.bg');
      expect(form.fields.TERMINAL).toBe(TERMINAL);
      expect(form.fields.MERCHANT).toBe(MERCHANT);
      expect(form.fields.ORDER).toBe('000007');
      expect(form.fields.AMOUNT).toBe('49.99');
      expect(form.fields.CURRENCY).toBe('BGN');
      expect(form.fields.TRTYPE).toBe('1');
      expect(form.fields.P_SIGN).toMatch(/^[0-9A-F]+$/);
    });
  });
});
