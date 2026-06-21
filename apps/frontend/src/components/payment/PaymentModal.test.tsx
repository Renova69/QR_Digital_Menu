import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PaymentModal } from './PaymentModal';

const apiMocks = vi.hoisted(() => ({
  getSessionBill: vi.fn(),
  createCheckout: vi.fn(),
  createCashPaymentRequest: vi.fn(),
  abandonCheckout: vi.fn(),
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
const socketMocks = vi.hoisted(() => {
  const handlers: Record<string, Array<(payload?: unknown) => void>> = {};
  const socket: any = {
    emit: vi.fn(),
    on: vi.fn((event: string, handler: (payload?: unknown) => void) => {
      handlers[event] = [...(handlers[event] ?? []), handler];
      return socket;
    }),
    off: vi.fn((event: string, handler: (payload?: unknown) => void) => {
      handlers[event] = (handlers[event] ?? []).filter((h) => h !== handler);
      return socket;
    }),
  };

  return {
    handlers,
    socket,
    state: { socket: null as any, isConnected: false },
  };
});

vi.mock('../../lib/api', () => ({
  getSessionBill: apiMocks.getSessionBill,
  createCheckout: apiMocks.createCheckout,
  createCashPaymentRequest: apiMocks.createCashPaymentRequest,
  abandonCheckout: apiMocks.abandonCheckout,
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: i18nMocks.t,
  }),
}));

vi.mock('../../context/SocketContext', () => ({
  useSocket: () => socketMocks.state,
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
            orderItemId: 'oi-soup',
            name: 'Soup',
            quantity: 1,
            paidQuantity: 0,
            unitPrice: 20,
            unitPriceWithOptions: 20,
            selectedOptions: [],
          },
        ],
      },
    ],
    subtotal: 20,
    paidSubtotal: 0,
    remaining: 20,
    splitItemsAvailable: true,
    restaurantId: 'rest1',
    tableName: '6',
    tipsEnabled: false,
    tipOptions: [],
    paymentProviders,
    pendingPayment: null,
  };
}

function fullTablePendingPayment() {
  return {
    id: 'pending-full',
    tableSessionId: 's1',
    source: 'ONLINE_PAYMENT',
    provider: 'STRIPE',
    status: 'PENDING',
    scope: 'FULL_TABLE',
    orderIds: [],
    amount: 20,
    createdAt: '2026-06-21T08:00:00.000Z',
  };
}

function scopedPendingPayment(orderIds: string[]) {
  return {
    id: 'pending-scoped',
    tableSessionId: 's1',
    source: 'CASH_REQUEST',
    provider: 'CASH',
    status: 'PENDING',
    scope: 'ORDER_ITEMS',
    orderIds,
    amount: 20,
    createdAt: '2026-06-21T08:00:00.000Z',
  };
}

function twoOrderBill() {
  return {
    ...billWithProviders(['STRIPE']),
    sessionId: 's1',
    orders: [
      ...billWithProviders(['STRIPE']).orders,
      {
        id: 'order2',
        source: 'CUSTOMER',
        customerName: 'Ivan',
        customerPhone: null,
        staffName: null,
        staffRole: null,
        totalPrice: 12,
        items: [
          {
            orderItemId: 'oi-salad',
            name: 'Salad',
            quantity: 1,
            paidQuantity: 0,
            unitPrice: 12,
            unitPriceWithOptions: 12,
            selectedOptions: [],
          },
        ],
      },
    ],
    subtotal: 32,
    remaining: 32,
  };
}

describe('PaymentModal hosted provider choices', () => {
  beforeEach(() => {
    apiMocks.getSessionBill.mockReset();
    apiMocks.createCheckout.mockReset();
    apiMocks.createCashPaymentRequest.mockReset();
    apiMocks.abandonCheckout.mockReset();
    Object.keys(socketMocks.handlers).forEach((event) => {
      delete socketMocks.handlers[event];
    });
    socketMocks.socket.emit.mockClear();
    socketMocks.socket.on.mockClear();
    socketMocks.socket.off.mockClear();
    socketMocks.state.socket = null;
    socketMocks.state.isConnected = false;
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

  it('creates a formal cash payment request without starting online checkout', async () => {
    apiMocks.getSessionBill.mockResolvedValueOnce(billWithProviders(['STRIPE']));
    apiMocks.createCashPaymentRequest.mockResolvedValueOnce({ id: 'cash-1' });
    const onCashRequestCreated = vi.fn();

    render(
      <PaymentModal
        sessionToken="tok1"
        onClose={vi.fn()}
        onSuccess={vi.fn()}
        onCashRequestCreated={onCashRequestCreated}
      />,
    );

    fireEvent.click(await screen.findByRole('button', { name: /Pay cash to waiter/i }));

    await waitFor(() => {
      expect(apiMocks.createCashPaymentRequest).toHaveBeenCalledWith('tok1', {
        restaurantId: 'rest1',
      });
    });
    expect(await screen.findByText('Cash request sent')).toBeTruthy();
    expect(onCashRequestCreated).toHaveBeenCalledWith('cash-1');
    expect(apiMocks.createCheckout).not.toHaveBeenCalled();
  });

  it('completes the modal when staff marks its cash request paid over the session socket', async () => {
    socketMocks.state.socket = socketMocks.socket;
    socketMocks.state.isConnected = true;
    apiMocks.getSessionBill.mockResolvedValueOnce(billWithProviders(['STRIPE']));
    apiMocks.createCashPaymentRequest.mockResolvedValueOnce({ id: 'cash-1' });
    const onSuccess = vi.fn();

    render(<PaymentModal sessionToken="tok1" onClose={vi.fn()} onSuccess={onSuccess} />);

    fireEvent.click(await screen.findByRole('button', { name: /Pay cash to waiter/i }));
    await screen.findByText('Cash request sent');

    await waitFor(() => {
      expect(socketMocks.handlers['cashPaymentRequest:updated']?.length).toBe(1);
    });

    act(() => {
      socketMocks.handlers['cashPaymentRequest:updated'][0]({
        id: 'cash-1',
        status: 'PAID',
      });
    });

    expect(onSuccess).toHaveBeenCalledTimes(1);
    expect(socketMocks.socket.emit).toHaveBeenCalledWith('joinTableSessionRoom', {
      token: 'tok1',
    });
  });

  it('blocks payment actions when the loaded bill already has a full-table payment pending', async () => {
    apiMocks.getSessionBill.mockResolvedValueOnce({
      ...billWithProviders(['STRIPE']),
      pendingPayment: fullTablePendingPayment(),
    });

    render(<PaymentModal sessionToken="tok1" onClose={vi.fn()} onSuccess={vi.fn()} />);

    expect(await screen.findByText(/Someone else is already paying the full table bill/i)).toBeTruthy();
    expect((screen.getByTestId('payment-continue-button') as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByRole('button', { name: /Pay cash to waiter/i }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('blocks an already-open modal when a full-table pending payment arrives over the socket', async () => {
    socketMocks.state.socket = socketMocks.socket;
    socketMocks.state.isConnected = true;
    apiMocks.getSessionBill.mockResolvedValueOnce({
      ...billWithProviders(['STRIPE']),
      sessionId: 's1',
    });

    render(<PaymentModal sessionToken="tok1" onClose={vi.fn()} onSuccess={vi.fn()} />);

    await screen.findByTestId('payment-continue-button');
    await waitFor(() => {
      expect(socketMocks.handlers['billPayment:pending']?.length).toBe(1);
    });

    act(() => {
      socketMocks.handlers['billPayment:pending'][0](fullTablePendingPayment());
    });

    expect(await screen.findByText(/Someone else is already paying the full table bill/i)).toBeTruthy();
    expect((screen.getByTestId('payment-continue-button') as HTMLButtonElement).disabled).toBe(true);
  });

  it('disables full-table payment while allowing non-overlapping owned orders', async () => {
    apiMocks.getSessionBill.mockResolvedValueOnce({
      ...twoOrderBill(),
      pendingPayment: scopedPendingPayment(['order1']),
    });
    apiMocks.createCheckout.mockResolvedValueOnce({
      provider: 'STRIPE',
      clientSecret: 'cs_test',
      paymentId: 'pay-owned',
      total: 12,
      tipAmount: 0,
    });

    render(
      <PaymentModal
        sessionToken="tok1"
        ownedOrderIds={['order2']}
        onClose={vi.fn()}
        onSuccess={vi.fn()}
      />,
    );

    expect(await screen.findByText(/Part of this table bill is already being paid/i)).toBeTruthy();
    expect((screen.getByRole('button', { name: 'My orders' }) as HTMLButtonElement).disabled).toBe(false);
    expect((screen.getByRole('button', { name: 'Full table' }) as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByTestId('payment-continue-button') as HTMLButtonElement).disabled).toBe(false);

    fireEvent.click(screen.getByTestId('payment-continue-button'));

    await waitFor(() =>
      expect(apiMocks.createCheckout).toHaveBeenCalledWith('tok1', {
        provider: 'STRIPE',
        tipPercent: 0,
        orderIds: ['order2'],
      }),
    );
  });

  it('blocks owned-order payment when the pending scoped payment overlaps', async () => {
    apiMocks.getSessionBill.mockResolvedValueOnce({
      ...twoOrderBill(),
      pendingPayment: scopedPendingPayment(['order1']),
    });

    render(
      <PaymentModal
        sessionToken="tok1"
        ownedOrderIds={['order1']}
        onClose={vi.fn()}
        onSuccess={vi.fn()}
      />,
    );

    expect(await screen.findByText(/Part of this table bill is already being paid/i)).toBeTruthy();
    expect((screen.getByRole('button', { name: 'Full table' }) as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByTestId('payment-continue-button') as HTMLButtonElement).disabled).toBe(true);
    expect(apiMocks.createCheckout).not.toHaveBeenCalled();
  });

  it('passes owned order ids when paying my orders online', async () => {
    apiMocks.getSessionBill.mockResolvedValueOnce({
      ...billWithProviders(['STRIPE']),
      orders: [
        ...billWithProviders(['STRIPE']).orders,
        {
          id: 'order2',
          source: 'CUSTOMER',
          customerName: 'Ivan',
          customerPhone: null,
          staffName: null,
          staffRole: null,
          totalPrice: 12,
          items: [
            {
              orderItemId: 'oi-salad',
              name: 'Salad',
              quantity: 1,
              paidQuantity: 0,
              unitPrice: 12,
              unitPriceWithOptions: 12,
              selectedOptions: [],
            },
          ],
        },
      ],
      subtotal: 32,
      remaining: 32,
    });
    apiMocks.createCheckout.mockResolvedValueOnce({
      provider: 'STRIPE',
      clientSecret: 'cs_test',
      paymentId: 'pay-owned',
      total: 20,
      tipAmount: 0,
    });

    render(
      <PaymentModal
        sessionToken="tok1"
        ownedOrderIds={['order1']}
        onClose={vi.fn()}
        onSuccess={vi.fn()}
      />,
    );

    expect(await screen.findByRole('button', { name: 'My orders' })).toBeTruthy();
    fireEvent.click(screen.getByTestId('payment-continue-button'));

    await waitFor(() =>
      expect(apiMocks.createCheckout).toHaveBeenCalledWith('tok1', {
        provider: 'STRIPE',
        tipPercent: 0,
        orderIds: ['order1'],
      }),
    );
  });

  it('does not show My orders tabs for the first customer on a table', async () => {
    apiMocks.getSessionBill.mockResolvedValueOnce(billWithProviders(['STRIPE']));

    render(
      <PaymentModal
        sessionToken="tok1"
        ownedOrderIds={['order1']}
        onClose={vi.fn()}
        onSuccess={vi.fn()}
      />,
    );

    await screen.findByTestId('payment-continue-button');
    expect(screen.queryByRole('button', { name: 'My orders' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Full table' })).toBeNull();
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
              orderItemId: 'oi-salad',
              name: 'Salad',
              quantity: 1,
              paidQuantity: 0,
              unitPrice: 12,
              unitPriceWithOptions: 12,
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
              orderItemId: 'oi-soup',
              name: 'Soup',
              quantity: 1,
              paidQuantity: 0,
              unitPrice: 8,
              unitPriceWithOptions: 8,
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
