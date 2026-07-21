import { PaymentProviderConfigService } from './payment-provider-config.service';
import { FeatureService } from '../subscription/feature.service';
import { encryptSecret } from './secret-crypto';

describe('PaymentProviderConfigService', () => {
  const service = new PaymentProviderConfigService(new FeatureService());

  describe('buildPublicMenuReturnUrl', () => {
    it('preserves a service-point token on hosted payment returns', () => {
      const url = new URL(
        service.buildPublicMenuReturnUrl(
          {
            restaurantId: 'rest-1',
            table: { name: '301', publicToken: 'room-token' },
          },
          'epay-ok',
        ),
      );

      expect(url.pathname).toBe('/menu/public/rest-1');
      expect(url.searchParams.get('sp')).toBe('room-token');
      expect(url.searchParams.has('table')).toBe(false);
      expect(url.searchParams.get('payment')).toBe('epay-ok');
    });

    it('keeps the table number for ordinary table sessions', () => {
      const url = new URL(
        service.buildPublicMenuReturnUrl(
          { restaurantId: 'rest-1', table: { name: '3' } },
          'mypos-cancel',
        ),
      );

      expect(url.searchParams.get('table')).toBe('3');
      expect(url.searchParams.has('sp')).toBe(false);
    });
  });

  it('decrypts a tenant-bound v2 MyPOS key with the selected restaurant ID', () => {
    process.env.PAYMENT_SECRET_ENCRYPTION_KEY = Buffer.alloc(32, 4).toString(
      'base64',
    );
    process.env.PAYMENT_SECRET_WRITE_VERSION = 'v2';
    const context = {
      restaurantId: 'rest-1',
      purpose: 'mypos-private-key' as const,
    };

    const config = service.resolveMyposConfig({
      id: 'rest-1',
      myposMode: 'LIVE',
      myposClientNumber: 'client-1',
      myposStoreId: 'store-1',
      myposKeyIndex: '1',
      myposPrivateKeyEncrypted: encryptSecret('private-key', context),
      myposPublicCert: 'public-cert',
      myposCurrency: 'EUR',
    });

    expect(config.privateKeyPem).toBe('private-key');
    delete process.env.PAYMENT_SECRET_ENCRYPTION_KEY;
    delete process.env.PAYMENT_SECRET_WRITE_VERSION;
  });
});
