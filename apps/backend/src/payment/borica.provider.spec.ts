import * as fs from 'fs';
import * as path from 'path';
import axios, { AxiosResponse } from 'axios';
import { BoricaProvider } from './borica.provider';

jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

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

  describe('inspectCertificate', () => {
    it('reports the bundled historical fixture as valid before expiry', () => {
      const result = provider.inspectCertificate(
        CERT_PEM,
        new Date('2023-01-01T00:00:00.000Z'),
      );

      expect(result.status).toBe('VALID');
      expect(result.validTo?.toISOString()).toBe('2023-09-10T08:47:59.000Z');
    });

    it('warns during the configured window before expiry', () => {
      const result = provider.inspectCertificate(
        CERT_PEM,
        new Date('2023-09-01T00:00:00.000Z'),
      );

      expect(result.status).toBe('EXPIRING');
      expect(result.daysRemaining).toBeGreaterThan(0);
      expect(result.daysRemaining).toBeLessThanOrEqual(30);
    });

    it('distinguishes expired and malformed certificates', () => {
      expect(
        provider.inspectCertificate(
          CERT_PEM,
          new Date('2023-09-11T00:00:00.000Z'),
        ).status,
      ).toBe('EXPIRED');
      expect(provider.inspectCertificate('not-a-certificate').status).toBe(
        'INVALID',
      );
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
        'ACTION',
        'RC',
        'APPROVAL',
        'TERMINAL',
        'TRTYPE',
        'AMOUNT',
        'CURRENCY',
        'ORDER',
        'RRN',
        'INT_REF',
        'PARES_STATUS',
        'ECI',
        'TIMESTAMP',
        'NONCE',
      ];
      // Mirror macField: empty → '-', otherwise length-prefix (matches verifyResult).
      const msg =
        macFields
          .map((k) => {
            const v = base[k] ?? '';
            return v === '' ? '-' : `${v.length}${v}`;
          })
          .join('') + '-';
      base.P_SIGN = createSign('RSA-SHA256')
        .update(msg)
        .sign(privateKeyPem, 'hex')
        .toUpperCase();
      return base;
    }

    it('verifies a correctly signed callback (self-signed with test key)', () => {
      // In production BORICA signs with their private key and we verify with
      // their cert. Here we sign with test.key and verify with the extracted
      // public key to prove the verify logic is correct.
      const { createPublicKey } = require('crypto');
      const pubKeyPem = createPublicKey(PRIVATE_KEY_PEM).export({
        type: 'spki',
        format: 'pem',
      }) as string;

      const body = buildSignedCallback(PRIVATE_KEY_PEM);
      const result = provider.verifyResult(body, pubKeyPem);
      expect(result.verified).toBe(true);
      expect(result.order).toBe('000099');
      expect(result.rc).toBe('00');
      expect(result.action).toBe('0');
    });

    it('rejects tampered AMOUNT', () => {
      const { createPublicKey } = require('crypto');
      const pubKeyPem = createPublicKey(PRIVATE_KEY_PEM).export({
        type: 'spki',
        format: 'pem',
      }) as string;

      const body = buildSignedCallback(PRIVATE_KEY_PEM);
      // Tamper amount after signing
      const tamperedBody = { ...body, AMOUNT: '9999.00' };

      const result = provider.verifyResult(tamperedBody, pubKeyPem);
      expect(result.verified).toBe(false);
    });

    it('verifies callback with empty optional fields (APPROVAL, PARES_STATUS, ECI → "-")', () => {
      const { createPublicKey } = require('crypto');
      const pubKeyPem = createPublicKey(PRIVATE_KEY_PEM).export({
        type: 'spki',
        format: 'pem',
      }) as string;

      const body = buildSignedCallback(PRIVATE_KEY_PEM, {
        APPROVAL: '',
        PARES_STATUS: '',
        ECI: '',
      });
      const result = provider.verifyResult(body, pubKeyPem);
      expect(result.verified).toBe(true);
      expect(result.approval).toBe('');
      expect(result.paresStat).toBe('');
      expect(result.eci).toBe('');
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

    it('verifies a TRTYPE=90 status response with empty CURRENCY via USD substitution (#B)', () => {
      const { createSign, createPublicKey } = require('crypto');
      const pubKeyPem = createPublicKey(PRIVATE_KEY_PEM).export({
        type: 'spki',
        format: 'pem',
      }) as string;

      const fields: Record<string, string> = {
        ACTION: '0',
        RC: '00',
        APPROVAL: '123456',
        TERMINAL,
        TRTYPE: '90',
        AMOUNT: '10.00',
        CURRENCY: '',
        ORDER: '000099',
        RRN: '123456789012',
        INT_REF: 'ABCDEF123456',
        PARES_STATUS: 'Y',
        ECI: '05',
        TIMESTAMP: '20260605120000',
        NONCE: 'ABCDEF01234567890123456789ABCDEF',
      };
      // BORICA signs a TRTYPE=90 status response with 'USD' substituted for the
      // empty CURRENCY; verifyResult must mirror that to validate the MAC.
      const macOrder = [
        'ACTION',
        'RC',
        'APPROVAL',
        'TERMINAL',
        'TRTYPE',
        'AMOUNT',
        'CURRENCY',
        'ORDER',
        'RRN',
        'INT_REF',
        'PARES_STATUS',
        'ECI',
        'TIMESTAMP',
        'NONCE',
      ];
      const msg =
        macOrder
          .map((k) => {
            const v = k === 'CURRENCY' ? 'USD' : (fields[k] ?? '');
            return v === '' ? '-' : `${v.length}${v}`;
          })
          .join('') + '-';
      const P_SIGN = createSign('RSA-SHA256')
        .update(msg)
        .sign(PRIVATE_KEY_PEM, 'hex')
        .toUpperCase();

      const result = provider.verifyResult({ ...fields, P_SIGN }, pubKeyPem);
      expect(result.verified).toBe(true);
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
        cardholder: {
          cardholderName: 'Maria Petrova',
          email: 'maria@example.com',
          phone: '+359893999888',
          billingAddress: '1 Vitosha Blvd',
        },
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
      expect(form.fields.ADDENDUM).toBe('AD,TD');
      expect(form.fields['AD.CUST_BOR_ORDER_ID']).toBe('000007');
      const mInfo = JSON.parse(
        Buffer.from(form.fields.M_INFO, 'base64').toString('utf8'),
      );
      expect(mInfo).toEqual(
        expect.objectContaining({
          threeDSRequestorChallengeInd: '04',
          cardholderName: 'Maria Petrova',
          email: 'maria@example.com',
          billAddrLine1: '1 Vitosha Blvd',
          shipAddrLine1: '1 Vitosha Blvd',
        }),
      );
      expect(mInfo.mobilePhone).toEqual({ cc: '359', subscriber: '893999888' });
      expect(form.fields.P_SIGN).toMatch(/^[0-9A-F]+$/);
      // #A: MERCH_GMT reflects the real Europe/Sofia offset (+02 or +03),
      // not a hardcoded value.
      expect(form.fields.MERCH_GMT).toMatch(/^[+-]\d{2}$/);
      expect(['+02', '+03']).toContain(form.fields.MERCH_GMT);
    });
  });

  describe('signStatusCheck', () => {
    it('produces a non-empty uppercase-hex P_SIGN over TERMINAL+TRTYPE+ORDER+NONCE', () => {
      const psign = provider.signStatusCheck(
        {
          TERMINAL,
          TRTYPE: '90',
          ORDER: '000099',
          NONCE: 'ABCDEF01234567890123456789ABCDEF',
        },
        PRIVATE_KEY_PEM,
      );
      expect(psign).toBeTruthy();
      expect(psign).toMatch(/^[0-9A-F]+$/);
    });

    it('self-verifies with extracted public key (excludes AMOUNT/CURRENCY/TIMESTAMP)', () => {
      const { createPublicKey, createVerify } = require('crypto');
      const fields = {
        TERMINAL,
        TRTYPE: '90',
        ORDER: '000099',
        NONCE: 'ABCDEF01234567890123456789ABCDEF',
      };
      const psign = provider.signStatusCheck(fields, PRIVATE_KEY_PEM);
      const msg =
        `${TERMINAL.length}${TERMINAL}` +
        `${'90'.length}90` +
        `${'000099'.length}000099` +
        `${'ABCDEF01234567890123456789ABCDEF'.length}ABCDEF01234567890123456789ABCDEF` +
        '-';
      const pubKey = createPublicKey(PRIVATE_KEY_PEM);
      const ok = createVerify('RSA-SHA256')
        .update(msg)
        .verify(pubKey, Buffer.from(psign, 'hex'));
      expect(ok).toBe(true);
    });
  });

  describe('queryTransactionStatus', () => {
    // Params no longer include amount/currency — TRTYPE=90 request omits them.
    const statusParams = {
      terminal: TERMINAL,
      order: '000099',
      privateKeyPem: PRIVATE_KEY_PEM,
      certPem: CERT_PEM,
    };

    afterEach(() => {
      jest.clearAllMocks();
    });

    it('fails closed before a LIVE status request when the certificate is expired', async () => {
      const result = await provider.queryTransactionStatus(
        statusParams,
        'LIVE',
      );

      expect(result).toBeNull();
      expect(mockedAxios.post).not.toHaveBeenCalled();
    });

    it('returns null when axios throws (network error)', async () => {
      mockedAxios.post.mockRejectedValueOnce(new Error('Network error'));
      const result = await provider.queryTransactionStatus(
        statusParams,
        'DEMO',
      );
      expect(result).toBeNull();
    });

    it('returns null when response is not an object (non-JSON / HTML)', async () => {
      mockedAxios.post.mockResolvedValueOnce({
        data: '<html>Error page</html>',
      } as Partial<AxiosResponse>);
      const result = await provider.queryTransactionStatus(
        statusParams,
        'DEMO',
      );
      expect(result).toBeNull();
    });

    it('returns null on timeout', async () => {
      const timeoutErr = Object.assign(new Error('timeout'), {
        code: 'ECONNABORTED',
      });
      mockedAxios.post.mockRejectedValueOnce(timeoutErr);
      const result = await provider.queryTransactionStatus(
        statusParams,
        'DEMO',
      );
      expect(result).toBeNull();
    });

    it('posts TRTYPE=90, TRAN_TRTYPE=1 to DEMO gateway — no AMOUNT/CURRENCY/TIMESTAMP', async () => {
      mockedAxios.post.mockRejectedValueOnce(new Error('no-op'));
      await provider.queryTransactionStatus(statusParams, 'DEMO');
      expect(mockedAxios.post).toHaveBeenCalledWith(
        expect.stringContaining('3dsgate-dev.borica.bg'),
        expect.stringMatching(/TRTYPE=90/),
        expect.objectContaining({
          headers: expect.objectContaining({
            'Content-Type': 'application/x-www-form-urlencoded',
          }),
          responseType: 'json',
        }),
      );
      const body: string = mockedAxios.post.mock.calls[0][1] as string;
      expect(body).toContain('TRAN_TRTYPE=1');
      expect(body).not.toContain('AMOUNT');
      expect(body).not.toContain('CURRENCY');
      expect(body).not.toContain('TIMESTAMP');
    });

    it('parses a valid JSON BORICA status response and verifies signature', async () => {
      const { createSign, createPublicKey } = require('crypto');
      const pubKeyPem = createPublicKey(PRIVATE_KEY_PEM).export({
        type: 'spki',
        format: 'pem',
      }) as string;

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
      };
      const macFields = [
        'ACTION',
        'RC',
        'APPROVAL',
        'TERMINAL',
        'TRTYPE',
        'AMOUNT',
        'CURRENCY',
        'ORDER',
        'RRN',
        'INT_REF',
        'PARES_STATUS',
        'ECI',
        'TIMESTAMP',
        'NONCE',
      ];
      const msg =
        macFields
          .map((k) => {
            const v = base[k] ?? '';
            return v === '' ? '-' : `${v.length}${v}`;
          })
          .join('') + '-';
      base.P_SIGN = createSign('RSA-SHA256')
        .update(msg)
        .sign(PRIVATE_KEY_PEM, 'hex')
        .toUpperCase();

      // BORICA returns JSON for status-check responses
      mockedAxios.post.mockResolvedValueOnce({
        data: base,
      } as Partial<AxiosResponse>);

      const result = await provider.queryTransactionStatus(
        { ...statusParams, certPem: pubKeyPem },
        'DEMO',
      );
      expect(result).not.toBeNull();
      expect(result!.verified).toBe(true);
      expect(result!.rc).toBe('00');
      expect(result!.action).toBe('0');
      expect(result!.order).toBe('000099');
    });

    it('returns verified=false for a response with a bad P_SIGN', async () => {
      mockedAxios.post.mockResolvedValueOnce({
        data: {
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
          P_SIGN: 'DEADBEEF',
        },
      } as Partial<AxiosResponse>);

      const result = await provider.queryTransactionStatus(
        statusParams,
        'DEMO',
      );
      expect(result).not.toBeNull();
      expect(result!.verified).toBe(false);
    });
  });
});
