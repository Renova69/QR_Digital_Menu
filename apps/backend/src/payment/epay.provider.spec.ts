import { EpayProvider } from './epay.provider';

describe('EpayProvider', () => {
  let provider: EpayProvider;

  beforeEach(() => {
    provider = new EpayProvider();
  });

  it('generates and verifies HMAC SHA1 checksums', () => {
    const encoded = provider.encodeRequest({ INVOICE: '123456', AMOUNT: '22.80' });
    const checksum = provider.signEncoded(encoded, 'secret-word');

    expect(checksum).toMatch(/^[a-f0-9]{40}$/);
    expect(provider.verifyChecksum(encoded, checksum, 'secret-word')).toBe(true);
    expect(provider.verifyChecksum(encoded, checksum, 'wrong-secret')).toBe(false);
  });

  it('builds the hosted checkout form with the required ePay fields', () => {
    const form = provider.createCheckoutForm({
      mode: 'DEMO',
      page: 'credit_paydirect',
      min: '1000000000',
      email: 'merchant@example.com',
      secret: 'secret-word',
      invoice: '123456',
      amount: 22.8,
      currency: 'EUR',
      expiresAt: new Date('2026-06-05T12:30:00+03:00'),
      description: 'Table bill',
      urlOk: 'https://example.com/ok',
      urlCancel: 'https://example.com/cancel',
      lang: 'en',
    });

    const decoded = Buffer.from(form.fields.ENCODED, 'base64').toString('utf8');

    expect(form.method).toBe('POST');
    expect(form.fields.PAGE).toBe('credit_paydirect');
    expect(form.fields.LANG).toBe('en');
    expect(form.fields.URL_OK).toBe('https://example.com/ok');
    expect(form.fields.URL_CANCEL).toBe('https://example.com/cancel');
    expect(form.fields.CHECKSUM).toBe(
      provider.signEncoded(form.fields.ENCODED, 'secret-word'),
    );
    expect(decoded).toContain('MIN=1000000000');
    expect(decoded).toContain('EMAIL=merchant@example.com');
    expect(decoded).toContain('INVOICE=123456');
    expect(decoded).toContain('AMOUNT=22.80');
    expect(decoded).toContain('CURRENCY=EUR');
    expect(decoded).toContain('EXP_TIME=');
    expect(decoded).toContain('DESCR=Table bill');
    expect(decoded).toContain('ENCODING=utf-8');
  });

  it('parses single and multiple payment notifications', () => {
    const single = Buffer.from(
      'INVOICE=1402:STATUS=PAID:PAY_TIME=20220629145257:STAN=000000:BCODE=000000',
      'utf8',
    ).toString('base64');
    const multipleSpace = Buffer.from(
      'INVOICE=123456:STATUS=DENIED INVOICE=123457:STATUS=EXPIRED',
      'utf8',
    ).toString('base64');
    const multipleNewline = Buffer.from(
      'INVOICE=123456:STATUS=DENIED\nINVOICE=123457:STATUS=EXPIRED',
      'utf8',
    ).toString('base64');

    expect(provider.parseNotifications(single)).toEqual([
      {
        invoice: '1402',
        status: 'PAID',
        payTime: '20220629145257',
        stan: '000000',
        bcode: '000000',
      },
    ]);
    expect(provider.parseNotifications(multipleSpace)).toEqual([
      { invoice: '123456', status: 'DENIED' },
      { invoice: '123457', status: 'EXPIRED' },
    ]);
    expect(provider.parseNotifications(multipleNewline)).toEqual([
      { invoice: '123456', status: 'DENIED' },
      { invoice: '123457', status: 'EXPIRED' },
    ]);
  });

  it('formats per-invoice notification responses', () => {
    expect(
      provider.formatNotificationResponses([
        { invoice: '123456', status: 'OK' },
        { invoice: '123457', status: 'NO' },
      ]),
    ).toBe('INVOICE=123456:STATUS=OK\nINVOICE=123457:STATUS=NO');
  });

  it('rejects invalid notification payloads', () => {
    const encoded = Buffer.from('INVOICE=123456:STATUS=UNKNOWN', 'utf8').toString(
      'base64',
    );

    expect(() => provider.parseNotifications(encoded)).toThrow(
      'Invalid ePay notification payload',
    );
  });
});
