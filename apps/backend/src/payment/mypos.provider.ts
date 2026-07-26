import { Injectable, Logger } from '@nestjs/common';
import * as crypto from 'crypto';

export type MyposMode = 'DEMO' | 'LIVE';

export interface MyposCheckoutParams {
  mode: MyposMode;
  clientNumber: string;
  storeId: string;
  keyIndex: string;
  privateKeyPem: string;
  orderId: string;
  amount: number;
  currency: string;
  description: string;
  urlOk: string;
  urlCancel: string;
  urlNotify: string;
  customerEmail?: string | null;
  language?: 'BG' | 'EN';
  source?: string;
}

export interface MyposCheckoutForm {
  action: string;
  method: 'POST';
  fields: Record<string, string>;
}

export interface MyposNotificationResult {
  verified: boolean;
  method: string;
  orderId: string;
  amount: string;
  currency: string;
  storeId: string;
  transactionRef: string;
  requestStan: string;
  requestDateTime: string;
  // myPOS IPC purchase status: '0' = success. Any other value is a decline /
  // reversal / error and must NOT be claimed as a successful payment (#M4).
  status: string;
}

export const MYPOS_TEST_CLIENT_NUMBER = '61938166610';
export const MYPOS_TEST_STORE_ID = '000000000000010';
export const MYPOS_TEST_KEY_INDEX = '1';
export const MYPOS_TEST_PRIVATE_KEY = [
  '-----BEGIN RSA PRIVATE KEY-----',
  'MIICXAIBAAKBgQCf0TdcTuphb7X+Zwekt1XKEWZDczSGecfo6vQfqvraf5VPzcnJ',
  '2Mc5J72HBm0u98EJHan+nle2WOZMVGItTa/2k1FRWwbt7iQ5dzDh5PEeZASg2UWe',
  'hoR8L8MpNBqH6h7ZITwVTfRS4LsBvlEfT7Pzhm5YJKfM+CdzDM+L9WVEGwIDAQAB',
  'AoGAYfKxwUtEbq8ulVrD3nnWhF+hk1k6KejdUq0dLYN29w8WjbCMKb9IaokmqWiQ',
  '5iZGErYxh7G4BDP8AW/+M9HXM4oqm5SEkaxhbTlgks+E1s9dTpdFQvL76TvodqSy',
  'l2E2BghVgLLgkdhRn9buaFzYta95JKfgyKGonNxsQA39PwECQQDKbG0Kp6KEkNgB',
  'srCq3Cx2od5OfiPDG8g3RYZKx/O9dMy5CM160DwusVJpuywbpRhcWr3gkz0QgRMd',
  'IRVwyxNbAkEAyh3sipmcgN7SD8xBG/MtBYPqWP1vxhSVYPfJzuPU3gS5MRJzQHBz',
  'sVCLhTBY7hHSoqiqlqWYasi81JzBEwEuQQJBAKw9qGcZjyMH8JU5TDSGllr3jybx',
  'FFMPj8TgJs346AB8ozqLL/ThvWPpxHttJbH8QAdNuyWdg6dIfVAa95h7Y+MCQEZg',
  'jRDl1Bz7eWGO2c0Fq9OTz3IVLWpnmGwfW+HyaxizxFhV+FOj1GUVir9hylV7V0DU',
  'QjIajyv/oeDWhFQ9wQECQCydhJ6NaNQOCZh+6QTrH3TC5MeBA1Yeipoe7+BhsLNr',
  'cFG8s9sTxRnltcZl1dXaBSemvpNvBizn0Kzi8G3ZAgc=',
  '-----END RSA PRIVATE KEY-----',
].join('\n');
export const MYPOS_TEST_PUBLIC_CERT = [
  '-----BEGIN CERTIFICATE-----',
  'MIIBsTCCARoCCQCCPjNttGNQWDANBgkqhkiG9w0BAQsFADAdMQswCQYDVQQGEwJC',
  'RzEOMAwGA1UECgwFbXlQT1MwHhcNMTgxMDEyMDcwOTEzWhcNMjgxMDA5MDcwOTEz',
  'WjAdMQswCQYDVQQGEwJCRzEOMAwGA1UECgwFbXlQT1MwgZ8wDQYJKoZIhvcNAQEB',
  'BQADgY0AMIGJAoGBAML+VTmiY4yChoOTMZTXAIG/mk+xf/9mjwHxWzxtBJbNncNK',
  '0OLI0VXYKW2GgVklGHHQjvew1hTFkEGjnCJ7f5CDnbgxevtyASDGst92a6xcAedE',
  'adP0nFXhUz+cYYIgIcgfDcX3ZWeNEF5kscqy52kpD2O7nFNCV+85vS4duJBNAgMB',
  'AAEwDQYJKoZIhvcNAQELBQADgYEACj0xb+tNYERJkL+p+zDcBsBK4RvknPlpk+YP',
  'ephunG2dBGOmg/WKgoD1PLWD2bEfGgJxYBIg9r1wLYpDC1txhxV+2OBQS86KULh0',
  'NEcr0qEY05mI4FlE+D/BpT/+WFyKkZug92rK0Flz71Xy/9mBXbQfm+YK6l9roRYd',
  'J4sHeQc=',
  '-----END CERTIFICATE-----',
].join('\n');

@Injectable()
export class MyposProvider {
  private readonly logger = new Logger(MyposProvider.name);

  getActionUrl(mode: MyposMode): string {
    if (mode === 'DEMO') {
      return (
        process.env.MYPOS_DEMO_URL || 'https://www.mypos.com/vmp/checkout-test'
      );
    }
    return process.env.MYPOS_LIVE_URL || 'https://www.mypos.com/vmp/checkout';
  }

  createCheckoutForm(params: MyposCheckoutParams): MyposCheckoutForm {
    const amount = params.amount.toFixed(2);
    const currency = params.currency.toUpperCase();
    const description = params.description.slice(0, 100);
    const fields: Record<string, string> = {
      IPCmethod: 'IPCPurchase',
      IPCVersion: '1.4',
      IPCLanguage: params.language ?? 'BG',
      SID: params.storeId,
      WalletNumber: params.clientNumber,
      Amount: amount,
      Currency: currency,
      OrderID: params.orderId,
      URL_OK: params.urlOk,
      URL_Cancel: params.urlCancel,
      URL_Notify: params.urlNotify,
      CardTokenRequest: '0',
      KeyIndex: params.keyIndex,
      PaymentParametersRequired: '3',
      PaymentMethod: '1',
      Note: description,
      Source: params.source ?? 'QR Digital Menu',
      CartItems: '1',
      Article_1: description || 'QR Menu bill',
      Quantity_1: '1',
      Price_1: amount,
      Currency_1: currency,
      Amount_1: amount,
    };

    if (params.customerEmail?.trim()) {
      fields.CustomerEmail = params.customerEmail.trim();
    }

    fields.Signature = this.signPostData(fields, params.privateKeyPem);

    return {
      action: this.getActionUrl(params.mode),
      method: 'POST',
      fields,
    };
  }

  signPostData(fields: Record<string, string>, privateKeyPem: string): string {
    const payload = this.buildSignedPayload(fields);
    return crypto
      .createSign('RSA-SHA256')
      .update(payload)
      .sign(privateKeyPem, 'base64');
  }

  verifyNotification(
    body: Record<string, string>,
    publicCertPem: string,
  ): MyposNotificationResult {
    const signature = getField(body, 'Signature');
    const fields: Record<string, string> = {};
    for (const [key, value] of Object.entries(body)) {
      if (key.toLowerCase() === 'signature') continue;
      fields[key] = String(value ?? '');
    }

    let verified = false;
    try {
      verified = crypto
        .createVerify('RSA-SHA256')
        .update(this.buildSignedPayload(fields))
        .verify(publicCertPem, Buffer.from(signature, 'base64'));
    } catch (error) {
      // Distinguish "signature genuinely doesn't match" (silent, expected for
      // real fraud attempts) from "verification itself threw" (bad cert PEM,
      // malformed base64 Signature field, unsupported format) — the latter is
      // a config/data problem support needs to see, not a fraud signal.
      verified = false;
      this.logger.warn(
        `myPOS notification signature verification threw for order ${getField(body, 'OrderID')}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }

    return {
      verified,
      method: getField(body, 'IPCmethod'),
      orderId: getField(body, 'OrderID'),
      amount: getField(body, 'Amount'),
      currency: getField(body, 'Currency'),
      storeId: getField(body, 'SID'),
      transactionRef: getField(body, 'IPC_Trnref'),
      requestStan: getField(body, 'RequestSTAN'),
      requestDateTime: getField(body, 'RequestDateTime'),
      status: getField(body, 'Status'),
    };
  }

  private buildSignedPayload(fields: Record<string, string>): string {
    const concatenated = Object.entries(fields)
      .filter(([key]) => key.toLowerCase() !== 'signature')
      .map(([, value]) => String(value ?? ''))
      .join('-');
    return Buffer.from(concatenated, 'utf8').toString('base64');
  }
}

function getField(body: Record<string, string>, key: string): string {
  return body[key] ?? body[key.toLowerCase()] ?? '';
}
