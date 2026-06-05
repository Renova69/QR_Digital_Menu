import { Injectable } from '@nestjs/common';
import { DateTime } from 'luxon';
import * as crypto from 'crypto';

export type EpayMode = 'DEMO' | 'LIVE';
export type EpayPage = 'credit_paydirect' | 'paylogin';
export type EpayNotificationStatus = 'PAID' | 'DENIED' | 'EXPIRED';

export interface EpayCheckoutParams {
  mode: EpayMode;
  page: EpayPage;
  min: string;
  email?: string | null;
  secret: string;
  invoice: string;
  amount: number;
  currency: string;
  expiresAt: Date;
  description: string;
  urlOk: string;
  urlCancel: string;
  lang?: 'bg' | 'en';
}

export interface EpayCheckoutForm {
  action: string;
  method: 'POST';
  fields: {
    PAGE: EpayPage;
    LANG: 'bg' | 'en';
    ENCODED: string;
    CHECKSUM: string;
    URL_OK: string;
    URL_CANCEL: string;
  };
}

export interface EpayNotification {
  invoice: string;
  status: EpayNotificationStatus;
  payTime?: string;
  stan?: string;
  bcode?: string;
}

@Injectable()
export class EpayProvider {
  getActionUrl(mode: EpayMode): string {
    if (mode === 'DEMO') {
      return process.env.EPAY_DEMO_URL || 'https://demo.epay.bg/';
    }
    return process.env.EPAY_LIVE_URL || 'https://www.epay.bg/';
  }

  createCheckoutForm(params: EpayCheckoutParams): EpayCheckoutForm {
    const encoded = this.encodeRequest({
      MIN: params.min,
      ...(params.email ? { EMAIL: params.email } : {}),
      INVOICE: params.invoice,
      AMOUNT: params.amount.toFixed(2),
      CURRENCY: params.currency.toUpperCase(),
      EXP_TIME: this.formatExpiration(params.expiresAt),
      DESCR: params.description.slice(0, 100),
      ENCODING: 'utf-8',
    });

    return {
      action: this.getActionUrl(params.mode),
      method: 'POST',
      fields: {
        PAGE: params.page,
        LANG: params.lang ?? 'bg',
        ENCODED: encoded,
        CHECKSUM: this.signEncoded(encoded, params.secret),
        URL_OK: params.urlOk,
        URL_CANCEL: params.urlCancel,
      },
    };
  }

  encodeRequest(values: Record<string, string>): string {
    const payload = Object.entries(values)
      .map(([key, value]) => `${key}=${value}`)
      .join('\n');
    return Buffer.from(payload, 'utf8').toString('base64');
  }

  signEncoded(encoded: string, secret: string): string {
    return crypto.createHmac('sha1', secret).update(encoded).digest('hex');
  }

  verifyChecksum(encoded: string, checksum: string, secret: string): boolean {
    const expected = this.signEncoded(encoded, secret);
    const expectedBuffer = Buffer.from(expected, 'hex');
    const actualBuffer = Buffer.from((checksum || '').toLowerCase(), 'hex');
    return (
      expectedBuffer.length === actualBuffer.length &&
      crypto.timingSafeEqual(expectedBuffer, actualBuffer)
    );
  }

  parseNotifications(encoded: string): EpayNotification[] {
    const decoded = Buffer.from(encoded, 'base64').toString('utf8').trim();
    if (!decoded) return [];

    return decoded
      .split(/(?=INVOICE=)/g)
      .map((record) => record.trim().replace(/\s+$/, ''))
      .filter(Boolean)
      .map((record) => this.parseNotificationRecord(record));
  }

  formatNotificationResponses(
    responses: Array<{ invoice: string; status: 'OK' | 'NO' | `ERR=${string}` }>,
  ): string {
    return responses
      .map((response) =>
        response.status.startsWith('ERR=')
          ? `INVOICE=${response.invoice}:STATUS=ERR`
          : `INVOICE=${response.invoice}:STATUS=${response.status}`,
      )
      .join('\n');
  }

  private parseNotificationRecord(record: string): EpayNotification {
    const fields = new Map<string, string>();
    for (const segment of record.split(':')) {
      const [key, ...rest] = segment.trim().split('=');
      if (key && rest.length > 0) {
        fields.set(key, rest.join('='));
      }
    }

    const invoice = fields.get('INVOICE');
    const status = fields.get('STATUS') as EpayNotificationStatus | undefined;
    if (!invoice || !status || !['PAID', 'DENIED', 'EXPIRED'].includes(status)) {
      throw new Error('Invalid ePay notification payload');
    }

    return {
      invoice,
      status,
      payTime: fields.get('PAY_TIME'),
      stan: fields.get('STAN'),
      bcode: fields.get('BCODE'),
    };
  }

  private formatExpiration(date: Date): string {
    return DateTime.fromJSDate(date)
      .setZone('Europe/Sofia')
      .toFormat('dd.MM.yyyy HH:mm:ss');
  }
}
