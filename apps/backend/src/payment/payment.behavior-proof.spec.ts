import { ConflictException } from '@nestjs/common';
import { PaymentService } from './payment.service';

type Provider = 'STRIPE' | 'EPAY' | 'BORICA';

const cardholder = {
  cardholderName: 'Maria Petrova',
  email: 'maria@example.com',
  phone: '+359893999888',
  billingAddress: '1 Vitosha Blvd',
};

function matchesWhere(payment: any, where: any = {}) {
  for (const [key, expected] of Object.entries(where)) {
    const actual = payment[key];
    if (expected && typeof expected === 'object' && !Array.isArray(expected)) {
      if ('in' in expected && !(expected as any).in.includes(actual)) return false;
      if ('not' in expected && actual === (expected as any).not) return false;
      if ('gte' in expected && !(actual >= (expected as any).gte)) return false;
      if ('lte' in expected && !(actual <= (expected as any).lte)) return false;
      continue;
    }
    if (actual !== expected) return false;
  }
  return true;
}

function createHarness() {
  const restaurant = {
    id: 'rest1',
    ownerId: 'owner1',
    name: 'Proof Restaurant',
    paymentsEnabled: true,
    stripeOnboarded: true,
    stripeAccountId: 'acct_123',
    platformFeePercent: 0,
    tipsEnabled: false,
    tipOptions: [],
    tier: 'PROFESSIONAL',
    epayEnabled: true,
    epayMode: 'DEMO',
    epayClientId: '1000000000',
    epayMerchantEmail: 'merchant@example.com',
    epaySecretEncrypted: 'secret-word',
    epayPage: 'credit_paydirect',
    boricaEnabled: true,
    boricaMode: 'DEMO',
    boricaTerminalId: null,
    boricaMerchantId: null,
    boricaMerchantName: 'Proof Merchant',
    boricaPrivateKeyEncrypted: null,
    boricaPublicCert: null,
    boricaCurrency: 'EUR',
  };
  const session = {
    id: 's1',
    token: 'tok1',
    status: 'OPEN',
    restaurantId: 'rest1',
    tableId: 'table1',
    table: { name: '7' },
    restaurant,
  };
  const payments: any[] = [];
  let paymentSeq = 0;

  const withIncludes = (payment: any) => ({
    ...payment,
    tableSession: {
      id: session.id,
      table: { name: '7' },
      orders: [{ customerName: 'Maria' }],
    },
  });

  const prisma: any = {
    tableSession: {
      findFirst: jest.fn(async ({ where }: any) => {
        if (where.token && where.token !== session.token) return null;
        if (where.status && where.status !== session.status) return null;
        return session;
      }),
      updateMany: jest.fn(async () => ({ count: 1 })),
    },
    restaurant: {
      findUnique: jest.fn(async () => restaurant),
    },
    user: {
      findUnique: jest.fn(async () => ({ restaurantId: 'rest1', role: 'OWNER' })),
    },
    order: {
      findMany: jest.fn(async () => [{ totalPrice: 20, customerName: 'Maria' }]),
      findFirst: jest.fn(async () => ({ customerName: 'Maria' })),
    },
    payment: {
      create: jest.fn(async ({ data }: any) => {
        const payment = {
          id: `pay-${++paymentSeq}`,
          provider: data.provider ?? 'STRIPE',
          providerStatus: data.providerStatus ?? null,
          providerReference: data.providerReference ?? null,
          providerPayload: data.providerPayload ?? null,
          stripePaymentIntentId: data.stripePaymentIntentId ?? null,
          createdAt: new Date(Date.now() + paymentSeq),
          updatedAt: new Date(Date.now() + paymentSeq),
          ...data,
        };
        payments.push(payment);
        return payment;
      }),
      findMany: jest.fn(async (args: any = {}) => {
        let rows = payments.filter((payment) => matchesWhere(payment, args.where));
        if (args.orderBy?.createdAt === 'desc') {
          rows = [...rows].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
        }
        if (typeof args.skip === 'number' || typeof args.take === 'number') {
          rows = rows.slice(args.skip ?? 0, (args.skip ?? 0) + (args.take ?? rows.length));
        }
        return args.include ? rows.map(withIncludes) : rows;
      }),
      findFirst: jest.fn(async (args: any = {}) => {
        const rows = payments.filter((payment) => matchesWhere(payment, args.where));
        return rows[0] ?? null;
      }),
      update: jest.fn(async ({ where, data }: any) => {
        const payment = payments.find((row) => matchesWhere(row, where));
        if (!payment) throw new Error('Payment not found');
        Object.assign(payment, data, { updatedAt: new Date() });
        return payment;
      }),
      updateMany: jest.fn(async ({ where, data }: any) => {
        let count = 0;
        for (const payment of payments) {
          if (matchesWhere(payment, where)) {
            Object.assign(payment, data, { updatedAt: new Date() });
            count++;
          }
        }
        return { count };
      }),
      count: jest.fn(async (args: any = {}) =>
        payments.filter((payment) => matchesWhere(payment, args.where)).length,
      ),
    },
    $transaction: jest.fn((arg: any) => {
      if (typeof arg === 'function') return arg(prisma);
      return Promise.all(arg);
    }),
  };

  const stripe = {
    createPaymentIntent: jest.fn(async ({ idempotencyKey }: any) => ({
      clientSecret: `cs_${idempotencyKey}`,
      paymentIntentId: `pi_${idempotencyKey}`,
    })),
    cancelPaymentIntent: jest.fn(async () => undefined),
    createRefund: jest.fn(),
    constructWebhookEvent: jest.fn(),
  };
  const epay = {
    createCheckoutForm: jest.fn(() => ({
      action: 'https://demo.epay.bg/',
      method: 'POST' as const,
      fields: {
        ENCODED: 'encoded',
        CHECKSUM: 'checksum',
        URL_CANCEL: 'http://localhost:3001/menu/public/rest1?table=7&payment=epay-cancel',
      },
    })),
    parseNotifications: jest.fn(),
    verifyChecksum: jest.fn(),
    formatNotificationResponses: jest.fn(),
  };
  const borica = {
    buildSaleForm: jest.fn(({ order }: any) => ({
      action: 'https://3dsgate-dev.borica.bg/cgi-bin/cgi_link',
      method: 'POST' as const,
      fields: { ORDER: order, P_SIGN: 'signed' },
    })),
    verifyResult: jest.fn(),
    getActionUrl: jest.fn(),
    queryTransactionStatus: jest.fn(async () => null),
  };
  const events = {
    emitToRestaurant: jest.fn(),
    emitTableStatusChanged: jest.fn(),
  };
  const features = {
    restaurantHasFeature: jest.fn(() => true),
  };
  const service = new PaymentService(
    prisma,
    stripe as any,
    epay as any,
    borica as any,
    events as any,
    features as any,
  );

  return { service, payments, stripe, prisma };
}

async function checkout(service: PaymentService, provider: Provider) {
  return service.createCheckout(
    'tok1',
    provider,
    0,
    provider === 'BORICA' ? cardholder : undefined,
  );
}

describe('Payment abandonment behavior proof', () => {
  beforeEach(() => {
    process.env.BORICA_TEST_TID = 'V1800001';
    process.env.BORICA_TEST_MID = '1600000001';
    process.env.BORICA_TEST_PRIVATE_KEY = 'test-pem';
    process.env.BORICA_TEST_CERT = 'test-cert';
    process.env.BACKEND_URL = 'https://api.example.com';
  });

  afterEach(() => {
    delete process.env.BORICA_TEST_TID;
    delete process.env.BORICA_TEST_MID;
    delete process.env.BORICA_TEST_PRIVATE_KEY;
    delete process.env.BORICA_TEST_CERT;
    delete process.env.BACKEND_URL;
  });

  it('explicit provider cancel abandons the pending row and dashboard history hides it', async () => {
    const { service, payments } = createHarness();

    await checkout(service, 'EPAY');
    expect(payments).toMatchObject([{ provider: 'EPAY', status: 'PENDING' }]);

    await service.abandonCheckout('tok1');
    expect(payments).toMatchObject([{ provider: 'EPAY', status: 'ABANDONED' }]);

    const history = await service.getPaymentHistory('rest1', {}, 'owner1');
    expect(history.data).toHaveLength(0);
  });

  it('ePay pending after raw back no longer blocks switching to Stripe', async () => {
    const { service, payments } = createHarness();

    await checkout(service, 'EPAY');
    const result = await checkout(service, 'STRIPE');

    expect(result.provider).toBe('STRIPE');
    expect(payments).toMatchObject([
      { provider: 'EPAY', status: 'ABANDONED' },
      { provider: 'STRIPE', status: 'PENDING' },
    ]);
  });

  it('all cross-provider raw-back switches create the new checkout without the processing conflict', async () => {
    const pairs: Array<[Provider, Provider]> = [
      ['EPAY', 'STRIPE'],
      ['EPAY', 'BORICA'],
      ['BORICA', 'STRIPE'],
      ['BORICA', 'EPAY'],
      ['STRIPE', 'EPAY'],
      ['STRIPE', 'BORICA'],
    ];

    for (const [from, to] of pairs) {
      const { service, payments } = createHarness();

      await checkout(service, from);
      await expect(checkout(service, to)).resolves.toMatchObject({ provider: to });

      const pending = payments.filter((payment) => payment.status === 'PENDING');
      expect(pending).toHaveLength(1);
      expect(pending[0].provider).toBe(to);
    }
  });

  it('a succeeded payment still blocks every later provider attempt', async () => {
    const { service, payments } = createHarness();
    payments.push({
      id: 'paid',
      tableSessionId: 's1',
      restaurantId: 'rest1',
      provider: 'EPAY',
      status: 'SUCCEEDED',
      amount: 20,
      tipAmount: 0,
      platformFeeAmount: 0,
      currency: 'eur',
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    await expect(checkout(service, 'STRIPE')).rejects.toBeInstanceOf(ConflictException);
    await expect(checkout(service, 'EPAY')).rejects.toBeInstanceOf(ConflictException);
    await expect(checkout(service, 'BORICA')).rejects.toBeInstanceOf(ConflictException);
  });

  it('browser-back abandon signal hides the pending hosted checkout from dashboard history', async () => {
    const { service } = createHarness();

    await checkout(service, 'EPAY');
    await service.abandonCheckout('tok1');

    const history = await service.getPaymentHistory('rest1', {}, 'owner1');

    expect(history.data).toHaveLength(0);
  });
});
