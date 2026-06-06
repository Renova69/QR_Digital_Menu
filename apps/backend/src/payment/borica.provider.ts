import { Injectable } from '@nestjs/common';
import * as crypto from 'crypto';
import axios from 'axios';

export type BoricaMode = 'DEMO' | 'LIVE';

export interface BoricaCheckoutParams {
  mode: BoricaMode;
  terminal: string;
  merchant: string;
  merchantName: string;
  merchantUrl?: string;
  email?: string | null;
  order: string;
  amount: number;
  currency: string;
  description: string;
  backref: string;
  lang?: 'BG' | 'EN';
  country?: string;
  privateKeyPem: string;
}

export interface BoricaCheckoutForm {
  action: string;
  method: 'POST';
  fields: Record<string, string>;
}

export interface BoricaCallbackResult {
  verified: boolean;
  order: string;
  rc: string;
  action: string;
  approval: string;
  rrn: string;
  intRef: string;
  terminal: string;
  amount: string;
  currency: string;
  paresStat: string;
  eci: string;
}

@Injectable()
export class BoricaProvider {
  getActionUrl(mode: BoricaMode): string {
    if (mode === 'DEMO') {
      return (
        process.env.BORICA_DEV_URL ||
        'https://3dsgate-dev.borica.bg/cgi-bin/cgi_link'
      );
    }
    return (
      process.env.BORICA_PROD_URL ||
      'https://3dsgate.borica.bg/cgi-bin/cgi_link'
    );
  }

  buildSaleForm(params: BoricaCheckoutParams): BoricaCheckoutForm {
    const ts = utcTimestamp();
    const n = nonce();

    const fields: Record<string, string> = {
      TERMINAL: params.terminal,
      TRTYPE: '1',
      AMOUNT: params.amount.toFixed(2),
      CURRENCY: params.currency.toUpperCase(),
      ORDER: params.order,
      DESC: params.description.slice(0, 50),
      MERCHANT: params.merchant,
      MERCH_NAME: (params.merchantName || '').slice(0, 25),
      MERCH_URL: params.merchantUrl || '',
      MERCH_GMT: '+03',
      EMAIL: params.email || '',
      TIMESTAMP: ts,
      NONCE: n,
      LANG: params.lang ?? 'BG',
      COUNTRY: params.country ?? 'BG',
      M_INFO: buildMInfo(params.email),
      BACKREF: params.backref,
      ADDENDUM: 'AD',
      'AD.CUST_BOR_ORDER_ID': params.order,
      P_SIGN: '',
    };

    fields.P_SIGN = this.signSale(
      {
        TERMINAL: fields.TERMINAL,
        TRTYPE: fields.TRTYPE,
        AMOUNT: fields.AMOUNT,
        CURRENCY: fields.CURRENCY,
        ORDER: fields.ORDER,
        TIMESTAMP: fields.TIMESTAMP,
        NONCE: fields.NONCE,
      },
      params.privateKeyPem,
    );

    return {
      action: this.getActionUrl(params.mode),
      method: 'POST',
      fields,
    };
  }

  signSale(
    fields: {
      TERMINAL: string;
      TRTYPE: string;
      AMOUNT: string;
      CURRENCY: string;
      ORDER: string;
      TIMESTAMP: string;
      NONCE: string;
    },
    privateKeyPem: string,
  ): string {
    const msg =
      lenPrefix(fields.TERMINAL) +
      lenPrefix(fields.TRTYPE) +
      lenPrefix(fields.AMOUNT) +
      lenPrefix(fields.CURRENCY) +
      lenPrefix(fields.ORDER) +
      lenPrefix(fields.TIMESTAMP) +
      lenPrefix(fields.NONCE) +
      '-'; // RFU

    return crypto
      .createSign('RSA-SHA256')
      .update(msg)
      .sign(privateKeyPem, 'hex')
      .toUpperCase();
  }

  /**
   * TRTYPE=90 MAC_GENERAL signature.
   * Field order: TERMINAL, TRTYPE, ORDER, NONCE, RFU.
   * (Differs from the Sale signature which includes AMOUNT, CURRENCY, TIMESTAMP.)
   */
  signStatusCheck(
    fields: { TERMINAL: string; TRTYPE: string; ORDER: string; NONCE: string },
    privateKeyPem: string,
  ): string {
    const msg =
      lenPrefix(fields.TERMINAL) +
      lenPrefix(fields.TRTYPE) +
      lenPrefix(fields.ORDER) +
      lenPrefix(fields.NONCE) +
      '-'; // RFU
    return crypto
      .createSign('RSA-SHA256')
      .update(msg)
      .sign(privateKeyPem, 'hex')
      .toUpperCase();
  }

  /**
   * TRTYPE=90 server-to-server status inquiry.
   * Request fields: TERMINAL, TRTYPE=90, ORDER, TRAN_TRTYPE=1, NONCE, P_SIGN.
   * BORICA returns JSON; verifyResult handles the P_SIGN verification.
   * Returns null on any network error, timeout, or unparseable response — caller
   * must treat null as "status unknown, not confirmed succeeded".
   */
  async queryTransactionStatus(
    params: {
      terminal: string;
      order: string;
      privateKeyPem: string;
      certPem: string;
    },
    mode: BoricaMode,
  ): Promise<BoricaCallbackResult | null> {
    const n = nonce();

    const psign = this.signStatusCheck(
      { TERMINAL: params.terminal, TRTYPE: '90', ORDER: params.order, NONCE: n },
      params.privateKeyPem,
    );

    const postBody = new URLSearchParams({
      TERMINAL: params.terminal,
      TRTYPE: '90',
      ORDER: params.order,
      TRAN_TRTYPE: '1',
      NONCE: n,
      P_SIGN: psign,
    }).toString();

    try {
      const { data } = await axios.post<unknown>(
        this.getActionUrl(mode),
        postBody,
        {
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          timeout: 8000,
          responseType: 'json',
        },
      );
      if (typeof data !== 'object' || data === null) return null;
      const asRecord: Record<string, string> = {};
      for (const [k, v] of Object.entries(data as Record<string, unknown>)) {
        asRecord[k] = String(v ?? '');
      }
      return this.verifyResult(asRecord, params.certPem);
    } catch {
      return null;
    }
  }

  verifyResult(
    body: Record<string, string>,
    certPem: string,
  ): BoricaCallbackResult {
    const get = (k: string) => (body[k] ?? body[k.toLowerCase()] ?? '');

    const ACTION = get('ACTION');
    const RC = get('RC');
    const APPROVAL = get('APPROVAL');
    const TERMINAL = get('TERMINAL');
    const TRTYPE = get('TRTYPE');
    const AMOUNT = get('AMOUNT');
    const CURRENCY = get('CURRENCY');
    const ORDER = get('ORDER');
    const RRN = get('RRN');
    const INT_REF = get('INT_REF');
    const PARES_STATUS = get('PARES_STATUS');
    const ECI = get('ECI');
    const TIMESTAMP = get('TIMESTAMP');
    const NONCE = get('NONCE');
    const P_SIGN = get('P_SIGN');

    const msg =
      lenPrefix(ACTION) +
      lenPrefix(RC) +
      lenPrefix(APPROVAL) +
      lenPrefix(TERMINAL) +
      lenPrefix(TRTYPE) +
      lenPrefix(AMOUNT) +
      lenPrefix(CURRENCY) +
      lenPrefix(ORDER) +
      lenPrefix(RRN) +
      lenPrefix(INT_REF) +
      lenPrefix(PARES_STATUS) +
      lenPrefix(ECI) +
      lenPrefix(TIMESTAMP) +
      lenPrefix(NONCE) +
      '-'; // RFU

    let verified = false;
    try {
      verified = crypto
        .createVerify('RSA-SHA256')
        .update(msg)
        .verify(certPem, Buffer.from(P_SIGN, 'hex'));
    } catch {
      verified = false;
    }

    return {
      verified,
      order: ORDER,
      rc: RC,
      action: ACTION,
      approval: APPROVAL,
      rrn: RRN,
      intRef: INT_REF,
      terminal: TERMINAL,
      amount: AMOUNT,
      currency: CURRENCY,
      paresStat: PARES_STATUS,
      eci: ECI,
    };
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function lenPrefix(value: string): string {
  const s = value ?? '';
  return String(s.length) + s;
}

function nonce(): string {
  return crypto.randomBytes(16).toString('hex').toUpperCase();
}

function utcTimestamp(): string {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return (
    now.getUTCFullYear() +
    pad(now.getUTCMonth() + 1) +
    pad(now.getUTCDate()) +
    pad(now.getUTCHours()) +
    pad(now.getUTCMinutes()) +
    pad(now.getUTCSeconds())
  );
}

function buildMInfo(email?: string | null): string {
  const info: Record<string, string> = {
    threeDSRequestorChallengeInd: '04',
  };
  if (email) info.email = email;
  return Buffer.from(JSON.stringify(info)).toString('base64');
}
