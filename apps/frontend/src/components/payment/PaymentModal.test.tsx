import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PaymentModal } from './PaymentModal';

const apiMocks = vi.hoisted(() => ({
  getSessionBill: vi.fn(),
  createCheckout: vi.fn(),
}));
const i18nMocks = vi.hoisted(() => ({
  t: (key: string, fallbackOrOptions?: string | { defaultValue?: string; name?: string; n?: number }) => {
    const value = typeof fallbackOrOptions === 'string'
      ? fallbackOrOptions
      : fallbackOrOptions?.defaultValue ?? key;
    return value
      .replace(
        /\{\{\s*name\s*\}\}/g,
        fallbackOrOptions && typeof fallbackOrOptions !== 'string' && fallbackOrOptions.name
          ? fallbackOrOptions.name
          : '',
      )
      .replace(
        /\{\{\s*n\s*\}\}/g,
        fallbackOrOptions && typeof fallbackOrOptions !== 'string' && fallbackOrOptions.n
          ? String(fallbackOrOptions.n)
          : '',
      );
  },
}));

vi.mock('../../lib/api', () => ({
  getSessionBill: apiMocks.getSessionBill,
  createCheckout: apiMocks.createCheckout,
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: i18nMocks.t,
  }),
}));

vi.mock('@stripe/stripe-js', () => ({
  loadStripe: vi.fn(() => Promise.resolve({})),
}));

vi.mock('@stripe/react-stripe-js', () => ({
  Elements: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  PaymentElement: () => <div data-testid="payment-element" />,
  useStripe: () => null,
  useElements: () => null,
}));

function billWithProviders(paymentProviders: Array<'STRIPE' | 'EPAY' | 'BORICA' | 'MYPOS'>) {
  return {
    orders: [
      {
        id: 'order1',
        source: 'CUSTOMER',
        customerName: 'Maria Petrova',
        customerPhone: '+359893999888',
        staffName: null,
        staffRole: null,
        totalPrice: 20,
        items: [
          {
            name: 'Soup',
            quantity: 1,
            unitPrice: 20,
            selectedOptions: [],
          },
        ],
      },
    ],
    subtotal: 20,
    tipsEnabled: false,
    tipOptions: [],
    paymentProviders,
  };
}

describe('PaymentModal hosted provider choices', () => {
  beforeEach(() => {
    apiMocks.getSessionBill.mockReset();
    apiMocks.createCheckout.mockReset();
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('shows the ePay option only when the bill advertises EPAY', async () => {
    apiMocks.getSessionBill.mockResolvedValueOnce(
      billWithProviders(['STRIPE', 'EPAY']),
    );

    render(<PaymentModal sessionToken="tok1" onClose={vi.fn()} onSuccess={vi.fn()} />);

    expect(await screen.findByRole('button', { name: 'ePay.bg' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Card online' })).toBeTruthy();

    cleanup();
    apiMocks.getSessionBill.mockResolvedValueOnce(billWithProviders(['STRIPE']));

    render(<PaymentModal sessionToken="tok1" onClose={vi.fn()} onSuccess={vi.fn()} />);

    await screen.findByTestId('payment-continue-button');
    expect(screen.queryByRole('button', { name: 'ePay.bg' })).toBeNull();
  });

  it('uses customer-facing source labels instead of exposing staff roles', async () => {
    apiMocks.getSessionBill.mockResolvedValueOnce({
      ...billWithProviders(['STRIPE']),
      orders: [
        {
          id: 'pos-order',
          source: 'POS',
          customerName: 'Table',
          customerPhone: null,
          staffName: '666',
          staffRole: 'OWNER',
          totalPrice: 12,
          items: [
            {
              name: 'Salad',
              quantity: 1,
              unitPrice: 12,
              selectedOptions: [],
            },
          ],
        },
        {
          id: 'customer-order',
          source: 'CUSTOMER',
          customerName: 'Johny',
          customerPhone: null,
          staffName: null,
          staffRole: null,
          totalPrice: 8,
          items: [
            {
              name: 'Soup',
              quantity: 1,
              unitPrice: 8,
              selectedOptions: [],
            },
          ],
        },
      ],
      subtotal: 20,
    });

    render(<PaymentModal sessionToken="tok1" onClose={vi.fn()} onSuccess={vi.fn()} />);

    expect(await screen.findByText(/Staff: 666/)).toBeTruthy();
    expect(screen.getByText(/You$/)).toBeTruthy();
    expect(screen.queryByText(/Owner/i)).toBeNull();
  });

  it('auto-submits returned ePay form fields', async () => {
    vi.useFakeTimers();
    const submitSpy = vi
      .spyOn(HTMLFormElement.prototype, 'submit')
      .mockImplementation(() => undefined);
    apiMocks.getSessionBill.mockResolvedValueOnce(billWithProviders(['EPAY']));
    apiMocks.createCheckout.mockResolvedValueOnce({
      provider: 'EPAY',
      paymentId: 'pay1',
      total: 20,
      tipAmount: 0,
      action: 'https://demo.epay.bg/',
      method: 'POST',
      fields: {
        PAGE: 'credit_paydirect',
        ENCODED: 'encoded',
        CHECKSUM: 'checksum',
        URL_OK: 'https://app.test/ok',
        URL_CANCEL: 'https://app.test/cancel',
      },
    });

    render(<PaymentModal sessionToken="tok1" onClose={vi.fn()} onSuccess={vi.fn()} />);

    fireEvent.click(await screen.findByRole('button', { name: 'Continue to ePay.bg' }));

    await waitFor(() =>
      expect(apiMocks.createCheckout).toHaveBeenCalledWith('tok1', {
        provider: 'EPAY',
        tipPercent: 0,
      }),
    );
    await screen.findByText('Opening ePay.bg secure checkout...');
    expect(screen.getByDisplayValue('encoded')).toBeTruthy();
    expect(screen.getByDisplayValue('checksum')).toBeTruthy();

    act(() => {
      vi.advanceTimersByTime(200);
    });

    expect(submitSpy).toHaveBeenCalledTimes(1);
  });

  it('sends BORICA cardholder details and auto-submits returned BORICA form fields', async () => {
    vi.useFakeTimers();
    const submitSpy = vi
      .spyOn(HTMLFormElement.prototype, 'submit')
      .mockImplementation(() => undefined);
    apiMocks.getSessionBill.mockResolvedValueOnce(billWithProviders(['BORICA']));
    apiMocks.createCheckout.mockResolvedValueOnce({
      provider: 'BORICA',
      paymentId: 'pay-borica',
      total: 20,
      tipAmount: 0,
      action: 'https://3dsgate-dev.borica.bg/cgi-bin/cgi_link',
      method: 'POST',
      fields: {
        TERMINAL: 'V1800001',
        ORDER: '000001',
        P_SIGN: 'abc123',
      },
    });

    render(<PaymentModal sessionToken="tok1" onClose={vi.fn()} onSuccess={vi.fn()} />);

    expect(await screen.findByDisplayValue('Maria Petrova')).toBeTruthy();
    fireEvent.change(screen.getByLabelText('Email'), {
      target: { value: 'maria@example.com' },
    });
    fireEvent.change(screen.getByLabelText('Billing address'), {
      target: { value: '1 Vitosha Blvd' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Pay by card (BORICA)' }));

    await waitFor(() =>
      expect(apiMocks.createCheckout).toHaveBeenCalledWith('tok1', {
        provider: 'BORICA',
        tipPercent: 0,
        boricaCardholder: {
          cardholderName: 'Maria Petrova',
          email: 'maria@example.com',
          phone: '+359893999888',
          billingAddress: '1 Vitosha Blvd',
        },
      }),
    );
    await screen.findByText('Opening BORICA secure checkout...');
    expect(screen.getByDisplayValue('V1800001')).toBeTruthy();

    act(() => {
      vi.advanceTimersByTime(200);
    });

    expect(submitSpy).toHaveBeenCalledTimes(1);
  });

  it('auto-submits returned myPOS form fields', async () => {
    vi.useFakeTimers();
    const submitSpy = vi
      .spyOn(HTMLFormElement.prototype, 'submit')
      .mockImplementation(() => undefined);
    apiMocks.getSessionBill.mockResolvedValueOnce(billWithProviders(['MYPOS']));
    apiMocks.createCheckout.mockResolvedValueOnce({
      provider: 'MYPOS',
      paymentId: 'pay-mypos',
      total: 20,
      tipAmount: 0,
      action: 'https://www.mypos.com/vmp/checkout-test',
      method: 'POST',
      fields: {
        IPCmethod: 'IPCPurchase',
        OrderID: 'MP123',
        Signature: 'signed',
      },
    });

    render(<PaymentModal sessionToken="tok1" onClose={vi.fn()} onSuccess={vi.fn()} />);

    fireEvent.click(await screen.findByRole('button', { name: 'Pay by card (myPOS)' }));

    await waitFor(() =>
      expect(apiMocks.createCheckout).toHaveBeenCalledWith('tok1', {
        provider: 'MYPOS',
        tipPercent: 0,
      }),
    );
    await screen.findByText('Opening myPOS secure checkout...');
    expect(screen.getByDisplayValue('IPCPurchase')).toBeTruthy();
    expect(screen.getByDisplayValue('MP123')).toBeTruthy();

    act(() => {
      vi.advanceTimersByTime(200);
    });

    expect(submitSpy).toHaveBeenCalledTimes(1);
  });
});
