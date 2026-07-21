import { Injectable } from '@nestjs/common';
import { FeatureService } from '../subscription/feature.service';
import { FeatureFlag } from '../subscription/feature-flag.enum';
import {
  MYPOS_TEST_CLIENT_NUMBER,
  MYPOS_TEST_KEY_INDEX,
  MYPOS_TEST_PRIVATE_KEY,
  MYPOS_TEST_PUBLIC_CERT,
  MYPOS_TEST_STORE_ID,
} from './mypos.provider';
import { decryptSecret } from './secret-crypto';
import { MyposConfig } from './payment.types';

@Injectable()
export class PaymentProviderConfigService {
  constructor(private readonly featureService: FeatureService) {}

  isStripeConfigured(restaurant: any): boolean {
    return !!(
      this.featureService.restaurantHasFeature(
        restaurant,
        FeatureFlag.PAYMENTS_STRIPE,
      ) &&
      restaurant.paymentsEnabled &&
      restaurant.stripeOnboarded &&
      restaurant.stripeAccountId
    );
  }

  isEpayConfigured(restaurant: any): boolean {
    return !!(
      this.featureService.restaurantHasFeature(
        restaurant,
        FeatureFlag.PAYMENTS_EPAY,
      ) &&
      restaurant.paymentsEnabled &&
      restaurant.epayEnabled &&
      restaurant.epayClientId &&
      restaurant.epayMerchantEmail &&
      restaurant.epaySecretEncrypted
    );
  }

  isBoricaConfigured(restaurant: any): boolean {
    if (
      !this.featureService.restaurantHasFeature(
        restaurant,
        FeatureFlag.PAYMENTS_BORICA,
      ) ||
      !restaurant.paymentsEnabled ||
      !restaurant.boricaEnabled
    ) {
      return false;
    }

    if (restaurant.boricaMode === 'LIVE') {
      return !!(
        restaurant.boricaTerminalId &&
        restaurant.boricaMerchantId &&
        restaurant.boricaPrivateKeyEncrypted &&
        restaurant.boricaPublicCert
      );
    }

    // DEMO mode: fall back to platform-level sandbox keypair from env
    return !!(
      process.env.BORICA_TEST_TID &&
      process.env.BORICA_TEST_MID &&
      process.env.BORICA_TEST_PRIVATE_KEY &&
      process.env.BORICA_TEST_CERT
    );
  }

  isMyposConfigured(restaurant: any): boolean {
    if (
      !this.featureService.restaurantHasFeature(
        restaurant,
        FeatureFlag.PAYMENTS_MYPOS,
      ) ||
      !restaurant.paymentsEnabled ||
      !restaurant.myposEnabled
    ) {
      return false;
    }

    if (restaurant.myposMode === 'LIVE') {
      return !!(
        restaurant.myposClientNumber &&
        restaurant.myposStoreId &&
        restaurant.myposKeyIndex &&
        restaurant.myposPrivateKeyEncrypted &&
        restaurant.myposPublicCert
      );
    }

    return true;
  }

  hasAnyConfiguredProvider(restaurant: any): boolean {
    return (
      this.isStripeConfigured(restaurant) ||
      this.isEpayConfigured(restaurant) ||
      this.isBoricaConfigured(restaurant) ||
      this.isMyposConfigured(restaurant)
    );
  }

  resolveBoricaKeypair(restaurant: any): {
    terminal: string;
    merchant: string;
    merchantName: string;
    privateKeyPem: string;
    certPem: string;
  } {
    if (restaurant.boricaMode === 'LIVE') {
      return {
        terminal: restaurant.boricaTerminalId!,
        merchant: restaurant.boricaMerchantId!,
        merchantName: restaurant.boricaMerchantName ?? restaurant.name ?? '',
        privateKeyPem: decryptSecret(restaurant.boricaPrivateKeyEncrypted, {
          restaurantId: restaurant.id,
          purpose: 'borica-private-key',
        }),
        certPem: restaurant.boricaPublicCert!,
      };
    }
    // DEMO: use platform-level bundled sandbox keypair
    return {
      terminal: process.env.BORICA_TEST_TID || 'V1800001',
      merchant: process.env.BORICA_TEST_MID || '1600000001',
      merchantName: restaurant.boricaMerchantName ?? restaurant.name ?? 'Test',
      privateKeyPem: process.env.BORICA_TEST_PRIVATE_KEY!,
      certPem: process.env.BORICA_TEST_CERT!,
    };
  }

  resolveMyposConfig(restaurant: any): MyposConfig {
    const mode = restaurant.myposMode === 'LIVE' ? 'LIVE' : 'DEMO';

    if (mode === 'LIVE') {
      return {
        mode,
        clientNumber: restaurant.myposClientNumber!,
        storeId: restaurant.myposStoreId!,
        keyIndex: restaurant.myposKeyIndex!,
        privateKeyPem: decryptSecret(restaurant.myposPrivateKeyEncrypted, {
          restaurantId: restaurant.id,
          purpose: 'mypos-private-key',
        }),
        publicCertPem: restaurant.myposPublicCert!,
        currency: (restaurant.myposCurrency || 'EUR').toUpperCase(),
      };
    }

    return {
      mode,
      clientNumber:
        restaurant.myposClientNumber ||
        process.env.MYPOS_TEST_CLIENT_NUMBER ||
        MYPOS_TEST_CLIENT_NUMBER,
      storeId:
        restaurant.myposStoreId ||
        process.env.MYPOS_TEST_STORE_ID ||
        MYPOS_TEST_STORE_ID,
      keyIndex:
        restaurant.myposKeyIndex ||
        process.env.MYPOS_TEST_KEY_INDEX ||
        MYPOS_TEST_KEY_INDEX,
      privateKeyPem: restaurant.myposPrivateKeyEncrypted
        ? decryptSecret(restaurant.myposPrivateKeyEncrypted, {
            restaurantId: restaurant.id,
            purpose: 'mypos-private-key',
          })
        : process.env.MYPOS_TEST_PRIVATE_KEY || MYPOS_TEST_PRIVATE_KEY,
      publicCertPem:
        restaurant.myposPublicCert ||
        process.env.MYPOS_TEST_PUBLIC_CERT ||
        MYPOS_TEST_PUBLIC_CERT,
      currency: (restaurant.myposCurrency || 'EUR').toUpperCase(),
    };
  }

  getFrontendBaseUrl(): string {
    return (process.env.FRONTEND_URL || 'http://localhost:3001').replace(
      /\/+$/,
      '',
    );
  }

  buildPublicMenuReturnUrl(
    session: {
      restaurantId: string;
      table?: {
        name?: string | null;
        publicToken?: string | null;
      } | null;
    },
    outcome: string,
  ): string {
    const url = new URL(
      `${this.getFrontendBaseUrl()}/menu/public/${session.restaurantId}`,
    );
    if (session.table?.publicToken) {
      url.searchParams.set('sp', session.table.publicToken);
    } else if (session.table?.name) {
      url.searchParams.set('table', session.table.name);
    }
    url.searchParams.set('payment', outcome);
    return url.toString();
  }

  createEpayInvoice(): string {
    const suffix = Math.floor(Math.random() * 1_000_000)
      .toString()
      .padStart(6, '0');
    return `${Date.now()}${suffix}`;
  }

  getEpayExpirationDate(): Date {
    const minutes = Math.max(
      5,
      Math.min(24 * 60, Number(process.env.EPAY_EXPIRATION_MINUTES || 30)),
    );
    return new Date(Date.now() + minutes * 60 * 1000);
  }
}
