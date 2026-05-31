import { describe, it, expect, beforeAll } from 'vitest';
import { render } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useContext } from 'react';
import { PublicLayout, AppLayout } from './App';
import { useCart } from './context/CartContext';
import { useOrders } from './context/OrderContext';
import { useAssistance } from './context/AssistanceContext';
import { AuthProvider } from './context/AuthContext';
import RestaurantContext from './context/RestaurantContext';
import { useNotifications } from './context/NotificationContext';

const localStorageMock = (() => {
  let store: Record<string, string> = {};
  return {
    getItem: (key: string) => store[key] ?? null,
    setItem: (key: string, value: string) => { store[key] = value; },
    removeItem: (key: string) => { delete store[key]; },
    clear: () => { store = {}; },
  };
})();

beforeAll(() => {
  Object.defineProperty(window, 'localStorage', { value: localStorageMock });
  Object.defineProperty(window, 'matchMedia', {
    value: (query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false,
    }),
  });
});

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: false } },
});

function wrapper({ children }: { children: React.ReactNode }) {
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}

function CartConsumer() {
  const cart = useCart();
  return <div data-testid="cart">{cart ? 'available' : 'null'}</div>;
}

function OrderConsumer() {
  const orders = useOrders();
  return <div data-testid="orders">{orders ? 'available' : 'null'}</div>;
}

function AssistanceConsumer() {
  const assistance = useAssistance();
  return <div data-testid="assistance">{assistance ? 'available' : 'null'}</div>;
}

function RestaurantConsumer() {
  const ctx = useContext(RestaurantContext);
  return <div data-testid="restaurant">{ctx ? 'available' : 'null'}</div>;
}

function NotificationConsumer() {
  const ctx = useNotifications();
  return <div data-testid="notification">{ctx.__providerMounted ? 'available' : 'null'}</div>;
}

describe('App provider scoping', () => {
  it('PublicLayout provides CartContext so children can call useCart without throwing', () => {
    expect(() => {
      render(
        <AuthProvider>
          <MemoryRouter initialEntries={['/test']}>
            <Routes>
              <Route element={<PublicLayout />}>
                <Route path="/test" element={<CartConsumer />} />
              </Route>
            </Routes>
          </MemoryRouter>
        </AuthProvider>,
        { wrapper },
      );
    }).not.toThrow();
  });

  it('AppLayout provides OrderContext so children can call useOrders without throwing', () => {
    expect(() => {
      render(
        <AuthProvider>
          <MemoryRouter initialEntries={['/test']}>
            <Routes>
              <Route element={<AppLayout />}>
                <Route path="/test" element={<OrderConsumer />} />
              </Route>
            </Routes>
          </MemoryRouter>
        </AuthProvider>,
        { wrapper },
      );
    }).not.toThrow();
  });

  it('AppLayout provides AssistanceContext so children can call useAssistance without throwing', () => {
    expect(() => {
      render(
        <AuthProvider>
          <MemoryRouter initialEntries={['/test']}>
            <Routes>
              <Route element={<AppLayout />}>
                <Route path="/test" element={<AssistanceConsumer />} />
              </Route>
            </Routes>
          </MemoryRouter>
        </AuthProvider>,
        { wrapper },
      );
    }).not.toThrow();
  });

  it('AppLayout provides RestaurantContext so children can access it without throwing', () => {
    expect(() => {
      render(
        <AuthProvider>
          <MemoryRouter initialEntries={['/test']}>
            <Routes>
              <Route element={<AppLayout />}>
                <Route path="/test" element={<RestaurantConsumer />} />
              </Route>
            </Routes>
          </MemoryRouter>
        </AuthProvider>,
        { wrapper },
      );
    }).not.toThrow();
  });

  it('AppLayout provides NotificationContext with __providerMounted true', () => {
    const { getByTestId } = render(
      <AuthProvider>
        <MemoryRouter initialEntries={['/test']}>
          <Routes>
            <Route element={<AppLayout />}>
              <Route path="/test" element={<NotificationConsumer />} />
            </Route>
          </Routes>
        </MemoryRouter>
      </AuthProvider>,
      { wrapper },
    );
    expect(getByTestId('notification').textContent).toBe('available');
  });
});
