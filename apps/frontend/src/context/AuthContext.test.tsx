import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AuthProvider, useAuth } from './AuthContext';
import React, { type ReactNode } from 'react';

// AuthProvider calls useQueryClient(); mock it so the test doesn't need a real
// QueryClientProvider (which trips the monorepo's dual-React resolution in jsdom).
vi.mock('@tanstack/react-query', () => ({
  useQueryClient: () => ({ clear: vi.fn() }),
}));

const renderWithProviders = (ui: ReactNode) =>
  render(<AuthProvider>{ui}</AuthProvider>);

vi.mock('../lib/api', () => ({
  default: {
    get: vi.fn().mockResolvedValue({ data: null }),
    post: vi.fn().mockResolvedValue({}),
  },
  login: vi.fn(),
  register: vi.fn(),
}));

import api from '../lib/api';

const mockUser = { id: '1', email: 'test@test.com', name: 'Test', role: 'customer' };

function TestConsumer() {
  const auth = useAuth();
  return (
    <div>
      <span data-testid="is-auth">{String(auth.isAuthenticated)}</span>
    </div>
  );
}

function TestConsumerWithLogin() {
  const auth = useAuth();
  return (
    <div>
      <span data-testid="is-auth">{String(auth.isAuthenticated)}</span>
      {auth.user && <span data-testid="user-email">{auth.user.email}</span>}
      <button data-testid="login-btn" onClick={() => auth.loginWithToken(mockUser)}>
        Login
      </button>
    </div>
  );
}

describe('AuthContext', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('exposes isAuthenticated as false when no user is logged in', async () => {
    renderWithProviders(<TestConsumer />);

    const element = await screen.findByTestId('is-auth');
    expect(element.textContent).toBe('false');
  });

  it('exposes isAuthenticated as true when /auth/me returns a user', async () => {
    (api.get as ReturnType<typeof vi.fn>).mockResolvedValue({ data: mockUser });

    renderWithProviders(<TestConsumer />);

    await waitFor(() => {
      expect(screen.getByTestId('is-auth').textContent).toBe('true');
    });
  });

  it('sets user and isAuthenticated after loginWithToken is called', async () => {
    renderWithProviders(<TestConsumerWithLogin />);

    // Initially not authenticated (mock returns null from /auth/me)
    await waitFor(() => {
      expect(screen.getByTestId('is-auth').textContent).toBe('false');
    });

    // Click login button which calls loginWithToken(mockUser)
    await userEvent.click(screen.getByTestId('login-btn'));

    // After loginWithToken, isAuthenticated is true and user is set
    await waitFor(() => {
      expect(screen.getByTestId('is-auth').textContent).toBe('true');
    });
    expect(screen.getByTestId('user-email').textContent).toBe('test@test.com');
  });
});
