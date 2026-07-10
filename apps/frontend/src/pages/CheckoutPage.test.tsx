import React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { vi, type Mock } from "vitest";
import "@testing-library/jest-dom";
import CheckoutPage from "./CheckoutPage";
import { useAuth } from "../context/AuthContext";
import { useCart } from "../context/CartContext";
import { useNavigate, useLocation, useSearchParams } from "react-router-dom";
import * as api from "../lib/api";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) => key,
    i18n: { resolvedLanguage: "en", changeLanguage: vi.fn(), dir: () => "ltr" },
  }),
}));

vi.mock("../context/AuthContext", () => ({
  useAuth: vi.fn(),
}));

vi.mock("../context/CartContext", () => ({
  useCart: vi.fn(),
}));

vi.mock("react-router-dom", () => ({
  useNavigate: vi.fn(),
  useLocation: vi.fn(),
  useSearchParams: vi.fn(),
}));

vi.mock("@tanstack/react-query", () => ({
  useQuery: vi.fn(() => ({ data: { categories: [] } })),
}));

vi.mock("../lib/api", () => ({
  __esModule: true,
  default: {
    post: vi.fn(() => Promise.resolve({ data: {} })),
    get: vi.fn(() => Promise.resolve({ data: {} })),
  },
  createOrder: vi.fn(),
  getMenu: vi.fn(),
  getSessionBill: vi.fn(),
}));

vi.mock("../../components/pos/PosCartDrawer", () => ({
  default: () => <div data-testid="pos-cart-drawer" />,
}));
vi.mock("../../components/pos/PaymentModal", () => ({
  default: () => <div data-testid="payment-modal" />,
}));

Object.defineProperty(window, "localStorage", {
  value: {
    getItem: vi.fn(),
    setItem: vi.fn(),
    removeItem: vi.fn(),
  },
  writable: true,
});

describe("CheckoutPage", () => {
  const mockNavigate = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    (useNavigate as Mock).mockReturnValue(mockNavigate);
    (useLocation as Mock).mockReturnValue({
      state: { restaurantId: "r1" },
      hash: "",
    });
    (useSearchParams as Mock).mockReturnValue([new URLSearchParams()]);
    (useAuth as Mock).mockReturnValue({ user: null });
    (useCart as Mock).mockReturnValue({
      items: [
        {
          id: "1",
          cartId: "c1",
          quantity: 2,
          price: 10,
          selectedOptions: [],
          rewardPointsPrice: 0,
        },
      ],
      tableNumber: "5",
      getTotal: () => 20,
      clearCart: vi.fn(),
    });

    (api.createOrder as Mock).mockResolvedValue({
      id: "order1",
      restaurantId: "r1",
      sessionToken: "token123",
    });
  });

  it("renders cart items and total", () => {
    render(<CheckoutPage />);
    expect(screen.getByText(/checkout.orderSummary/i)).toBeInTheDocument();
    expect(screen.getByText(/cart.total/i)).toBeInTheDocument();
    expect(screen.getAllByText(/20/)[0]).toBeInTheDocument();
  });

  it("calculates total correctly and submits order", async () => {
    const clearCartMock = vi.fn();
    (useCart as Mock).mockReturnValue({
      items: [
        {
          id: "item1",
          cartId: "c1",
          quantity: 2,
          price: 10,
          selectedOptions: [],
          rewardPointsPrice: 0,
        },
      ],
      tableNumber: "5",
      getTotal: () => 20,
      clearCart: clearCartMock,
    });

    render(<CheckoutPage />);

    const nameInput = screen.getByLabelText(/checkout.name/i);
    fireEvent.change(nameInput, { target: { value: "John Doe" } });

    const submitBtn = screen.getByRole("button", {
      name: /checkout.placeOrder/i,
    });
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(api.createOrder).toHaveBeenCalledWith(
        expect.objectContaining({
          customerName: "John Doe",
          tableId: "5",
          items: [
            {
              menuItemId: "item1",
              cartId: "c1",
              quantity: 2,
              selectedOptions: [],
            },
          ],
        }),
      );
      expect(clearCartMock).toHaveBeenCalled();
      expect(mockNavigate).toHaveBeenCalledWith(
        "/order-confirmation",
        expect.anything(),
      );
    });
  });
});
