import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PaymentModal } from './PaymentModal';

const apiMocks = vi.hoisted(() => ({
  getSessionBill: vi.fn(),
  createCheckout: vi.fn(),
}));
const i18nMocks = vi.hoisted(() => ({
  t: (key: string, fallbackOrOptions?: string | { defaultValue?: string }) =>
    typeof fallbackOrOptions === 'string'
      ? fallbackOrOptions
      : fallbackOrOptions?.defaultValue ?? key,
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

function billWithProviders(paymentProviders: Array<'STRIPE' | 'EPAY'>) {
  return {
    orders: [
      {
        id: 'order1',
        source: 'CUSTOMER',
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

    await screen.findByRole('button', { name: 'payment.continue' });
    expect(screen.queryByRole('button', { name: 'ePay.bg' })).toBeNull();
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
});
