import { PaymentProviderConfigService } from './payment-provider-config.service';
import { FeatureService } from '../subscription/feature.service';

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
});
