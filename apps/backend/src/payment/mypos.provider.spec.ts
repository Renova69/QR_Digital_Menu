import {
  MYPOS_TEST_PRIVATE_KEY,
  MyposProvider,
} from './mypos.provider';
import * as crypto from 'crypto';

describe('MyposProvider', () => {
  let provider: MyposProvider;

  beforeEach(() => {
    provider = new MyposProvider();
  });

  it('builds signed IPCPurchase form fields for hosted checkout', () => {
    const form = provider.createCheckoutForm({
      mode: 'DEMO',
      clientNumber: '61938166610',
      storeId: '000000000000010',
      keyIndex: '1',
      privateKeyPem: MYPOS_TEST_PRIVATE_KEY,
      orderId: 'MP123',
      amount: 23.45,
      currency: 'EUR',
      description: 'QR Menu bill 7',
      urlOk: 'https://app.example.com/menu/public/rest1?payment=mypos-ok',
      urlCancel:
        'https://app.example.com/menu/public/rest1?payment=mypos-cancel',
      urlNotify: 'https://api.example.com/api/v1/payments/mypos/notify',
      language: 'BG',
    });

    expect(form).toEqual(
      expect.objectContaining({
        action: 'https://www.mypos.com/vmp/checkout-test',
        method: 'POST',
      }),
    );
    expect(form.fields).toEqual(
      expect.objectContaining({
        IPCmethod: 'IPCPurchase',
        IPCVersion: '1.4',
        SID: '000000000000010',
        WalletNumber: '61938166610',
        Amount: '23.45',
        Currency: 'EUR',
        OrderID: 'MP123',
        URL_Notify: 'https://api.example.com/api/v1/payments/mypos/notify',
        CardTokenRequest: '0',
        KeyIndex: '1',
        PaymentMethod: '1',
      }),
    );
    expect(form.fields.Signature).toEqual(expect.any(String));
  });

  it('verifies a myPOS notification signed with the matching key', () => {
    const { privateKey, publicKey } = crypto.generateKeyPairSync('rsa', {
      modulusLength: 2048,
      privateKeyEncoding: { type: 'pkcs1', format: 'pem' },
      publicKeyEncoding: { type: 'spki', format: 'pem' },
    });
    const notifyBody: Record<string, string> = {
      IPCmethod: 'IPCPurchaseNotify',
      SID: '000000000000010',
      Amount: '23.45',
      Currency: 'EUR',
      OrderID: 'MP123',
      IPC_Trnref: '813705',
      RequestSTAN: '000006',
      RequestDateTime: '2015-08-21 10:39:37',
    };
    notifyBody.Signature = provider.signPostData(
      notifyBody,
      privateKey,
    );

    const result = provider.verifyNotification(
      notifyBody,
      publicKey,
    );

    expect(result).toEqual(
      expect.objectContaining({
        verified: true,
        method: 'IPCPurchaseNotify',
        orderId: 'MP123',
        amount: '23.45',
        currency: 'EUR',
        storeId: '000000000000010',
        transactionRef: '813705',
      }),
    );
  });

  it('fails verification when notification data is tampered', () => {
    const { privateKey, publicKey } = crypto.generateKeyPairSync('rsa', {
      modulusLength: 2048,
      privateKeyEncoding: { type: 'pkcs1', format: 'pem' },
      publicKeyEncoding: { type: 'spki', format: 'pem' },
    });
    const notifyBody: Record<string, string> = {
      IPCmethod: 'IPCPurchaseNotify',
      SID: '000000000000010',
      Amount: '23.45',
      Currency: 'EUR',
      OrderID: 'MP123',
    };
    notifyBody.Signature = provider.signPostData(
      notifyBody,
      privateKey,
    );
    notifyBody.Amount = '99.99';

    const result = provider.verifyNotification(
      notifyBody,
      publicKey,
    );

    expect(result.verified).toBe(false);
  });
});
