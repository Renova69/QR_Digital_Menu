import React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { vi, type Mock } from "vitest";
import "@testing-library/jest-dom";
import CheckoutPage from "./CheckoutPage";
import { useAuth } from "../context/AuthContext";
import { useCart } from "../context/CartContext";
import { useNavigate, useLocation, useSearchParams } from "react-router-dom";
import * as api from "../lib/api";
import bgTranslation from "../locales/bg/translation.json";

const i18nMock = vi.hoisted(() => ({
  resolvedLanguage: "en",
  translate: vi.fn((key: string) => key),
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: i18nMock.translate,
    i18n: {
      resolvedLanguage: i18nMock.resolvedLanguage,
      changeLanguage: vi.fn(),
      dir: () => "ltr",
    },
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

vi.mock("../components/payment/PaymentModal", () => ({
  PaymentModal: ({
    sessionToken,
    allowCashRequest,
  }: {
    sessionToken: string;
    allowCashRequest?: boolean;
  }) => (
    <div data-testid="payment-modal" data-allow-cash={String(allowCashRequest)}>
      {sessionToken}
    </div>
  ),
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
    i18nMock.resolvedLanguage = "en";
    // Most keys just echo back (existing tests assert on raw keys). The two
    // tier-progress keys carry interpolated variables the tier-progress
    // tests assert on, so those two are resolved to their real en-locale
    // copy here.
    i18nMock.translate.mockImplementation(
      (key: string, options?: Record<string, unknown>) => {
        if (options && typeof options === "object") {
          if (key === "checkout.tierProgressToNext") {
            return `${options.points} pts to ${options.tier}`;
          }
          if (key === "checkout.tierProgressMaxTier") {
            return `Earning ${options.multiplier}x on every order`;
          }
          if (key === "checkout.pointsExpire") {
            return `${options.points} points expire on ${options.date}`;
          }
        }
        return key;
      },
    );
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
    (api.getSessionBill as Mock).mockResolvedValue({
      sessionId: "session-1",
      restaurantId: "r1",
      tableId: "room-301",
      tableName: "301",
      orders: [],
      subtotal: 10,
      paidSubtotal: 0,
      remaining: 10,
      splitItemsAvailable: false,
      tipsEnabled: false,
      tipOptions: [],
      paymentProviders: ["MYPOS"],
      pendingPayment: null,
    });
  });

  it("renders Bulgarian checkout copy instead of English fallbacks", () => {
    i18nMock.resolvedLanguage = "bg";
    i18nMock.translate.mockImplementation(
      (key: string, fallback?: string | Record<string, unknown>) => {
        const translated = key
          .split(".")
          .reduce<unknown>(
            (value, part) =>
              value &&
              typeof value === "object" &&
              part in (value as Record<string, unknown>)
                ? (value as Record<string, unknown>)[part]
                : undefined,
            bgTranslation,
          );
        return typeof translated === "string"
          ? translated
          : typeof fallback === "string"
            ? fallback
            : key;
      },
    );
    (useLocation as Mock).mockReturnValue({
      state: { restaurantId: "r1", paymentsEnabled: true },
      hash: "",
    });

    render(<CheckoutPage />);

    expect(screen.getByLabelText("Име (по избор)")).toBeInTheDocument();
    expect(screen.getByLabelText("Телефон (по избор)")).toBeInTheDocument();
    expect(
      screen.getByLabelText("Специални изисквания (по избор)"),
    ).toBeInTheDocument();
    expect(screen.getByText("Сигурно плащане чрез")).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("Име (по избор)"), {
      target: { value: "Мария" },
    });
    expect(
      screen.getByText("Чудесно - ще използваме това име за поръчката ви."),
    ).toBeInTheDocument();
  });

  it("renders cart items and total", () => {
    render(<CheckoutPage />);
    expect(screen.getByText(/checkout.orderSummary/i)).toBeInTheDocument();
    expect(screen.getByText(/cart.total/i)).toBeInTheDocument();
    expect(screen.getAllByText(/20/)[0]).toBeInTheDocument();
  });

  it("shows only supported card network trust badges", () => {
    (useLocation as Mock).mockReturnValue({
      state: { restaurantId: "r1", paymentsEnabled: true },
      hash: "",
    });

    render(<CheckoutPage />);

    expect(
      screen.getByRole("img", { name: "checkout.paymentTrust.visa" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("img", { name: "checkout.paymentTrust.mastercard" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByText("checkout.paymentTrust.paypal"),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByText("checkout.paymentTrust.applePay"),
    ).not.toBeInTheDocument();
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

  it("shows tier progress bar and points-to-next-tier for a Silver member", async () => {
    (useAuth as Mock).mockReturnValue({ user: { id: "u1", name: "Jane" } });
    (api.default.post as Mock).mockImplementation((url: string) => {
      if (url.includes("/loyalty/") && url.includes("/enroll")) {
        return Promise.resolve({
          data: {
            points: 340,
            lifetimePoints: 340,
            tier: "Silver",
            tierMultiplier: 1.2,
            tierProgressPercent: 68,
            pointsToNextTier: 160,
            nextTierName: "Gold",
            restaurantConfig: { isLoyaltyEnabled: true },
          },
        });
      }
      return Promise.resolve({ data: {} });
    });

    render(<CheckoutPage />);

    await waitFor(() => {
      expect(screen.getByText(/Silver/)).toBeInTheDocument();
    });
    expect(screen.getByText(/160 pts to Gold/)).toBeInTheDocument();
  });

  it("shows a static max-tier badge with no progress bar for a Gold member", async () => {
    (useAuth as Mock).mockReturnValue({ user: { id: "u1", name: "Jane" } });
    (api.default.post as Mock).mockImplementation((url: string) => {
      if (url.includes("/loyalty/") && url.includes("/enroll")) {
        return Promise.resolve({
          data: {
            points: 2500,
            lifetimePoints: 2500,
            tier: "Gold",
            tierMultiplier: 1.5,
            tierProgressPercent: 100,
            pointsToNextTier: 0,
            nextTierName: "Max Tier",
            restaurantConfig: { isLoyaltyEnabled: true },
          },
        });
      }
      return Promise.resolve({ data: {} });
    });

    render(<CheckoutPage />);

    await waitFor(() => {
      expect(
        screen.getByText(/Earning 1.5x on every order/),
      ).toBeInTheDocument();
    });
    expect(screen.queryByText(/pts to/)).not.toBeInTheDocument();
  });

  it("submits an owner-selected loyalty redemption amount from public checkout", async () => {
    (useAuth as Mock).mockReturnValue({
      user: { id: "owner-1", name: "666", role: "OWNER" },
    });
    (useCart as Mock).mockReturnValue({
      items: [
        {
          id: "item1",
          cartId: "c1",
          quantity: 1,
          price: 15.34,
          selectedOptions: [],
          rewardPointsPrice: 0,
        },
      ],
      tableNumber: "5",
      getTotal: () => 15.34,
      clearCart: vi.fn(),
    });
    (api.default.post as Mock).mockResolvedValue({
      data: {
        points: 10214,
        lifetimePoints: 10214,
        restaurantConfig: {
          isLoyaltyEnabled: true,
          loyaltyRedeemRate: 150,
          loyaltyMaxRedemptionPercent: 100,
        },
      },
    });

    render(<CheckoutPage />);

    const redemptionToggle = await screen.findByRole("switch", {
      name: "checkout.redeemForDiscount",
    });
    fireEvent.click(redemptionToggle);
    fireEvent.change(
      screen.getByRole("spinbutton", { name: "checkout.pointsToRedeem" }),
      { target: { value: "2301" } },
    );
    fireEvent.click(
      screen.getByRole("button", { name: /checkout.placeOrder/i }),
    );

    await waitFor(() =>
      expect(api.createOrder).toHaveBeenCalledWith(
        expect.objectContaining({
          usePoints: true,
          redeemPoints: 2301,
        }),
      ),
    );
  });

  it("shows the points expiring on each actual date instead of assigning the earliest date to all points", async () => {
    (useAuth as Mock).mockReturnValue({
      user: { id: "customer-1", name: "Jane", role: "CUSTOMER" },
    });
    (api.default.post as Mock).mockResolvedValue({
      data: {
        points: 10214,
        expiringSoonPoints: 600,
        expiringSoonValue: 4,
        nextExpirationAt: "2026-08-07T15:30:05.725Z",
        expiringSoon: [
          {
            points: 50,
            value: 0.33,
            expiresAt: "2026-08-07T15:30:05.725Z",
          },
          {
            points: 62,
            value: 0.41,
            expiresAt: "2026-08-08T08:51:39.745Z",
          },
          {
            points: 488,
            value: 3.25,
            expiresAt: "2026-08-08T09:10:26.471Z",
          },
        ],
        restaurantConfig: {
          isLoyaltyEnabled: true,
          loyaltyRedeemRate: 150,
          loyaltyMaxRedemptionPercent: 15,
          timezone: "Europe/Sofia",
        },
      },
    });

    render(<CheckoutPage />);

    expect(
      await screen.findByText("50 points expire on Aug 7, 2026"),
    ).toBeInTheDocument();
    expect(
      screen.getByText("550 points expire on Aug 8, 2026"),
    ).toBeInTheDocument();
    expect(
      screen.queryByText("600 points expire on Aug 7, 2026"),
    ).not.toBeInTheDocument();
  });

  it("does not render the tier progress row for a guest (no user)", () => {
    (useAuth as Mock).mockReturnValue({ user: null });

    render(<CheckoutPage />);

    expect(screen.queryByText(/pts to/)).not.toBeInTheDocument();
    expect(
      screen.queryByText(/Earning .*x on every order/),
    ).not.toBeInTheDocument();
  });

  it("requires explicit choices when a service point offers multiple options", async () => {
    (useCart as Mock).mockReturnValue({
      items: [
        {
          id: "item1",
          cartId: "c1",
          quantity: 1,
          price: 10,
          selectedOptions: [],
          rewardPointsPrice: 0,
        },
      ],
      tableNumber: null,
      orderLocation: {
        type: "ROOM",
        label: "301",
        token: "room-token",
        fulfillmentModes: ["ROOM_DELIVERY", "PICKUP"],
        paymentMethods: ["ONLINE", "PAY_ON_DELIVERY"],
      },
      getTotal: () => 10,
      clearCart: vi.fn(),
    });
    render(<CheckoutPage />);
    fireEvent.change(screen.getByLabelText(/checkout.name/i), {
      target: { value: "Carl" },
    });
    fireEvent.click(
      screen.getByRole("button", { name: /checkout.placeOrder/i }),
    );

    await waitFor(() => {
      expect(api.createOrder).not.toHaveBeenCalled();
      expect(
        screen.getByText("servicePoints.checkout.fulfillmentRequired"),
      ).toBeInTheDocument();
    });
  });

  it("opens the secure session payment flow for an online service-point order", async () => {
    (useLocation as Mock).mockReturnValue({
      state: {
        restaurantId: "r1",
        paymentsEnabled: true,
      },
      hash: "",
    });
    (useCart as Mock).mockReturnValue({
      items: [
        {
          id: "item1",
          cartId: "c1",
          quantity: 1,
          price: 10,
          selectedOptions: [],
          rewardPointsPrice: 0,
        },
      ],
      tableNumber: null,
      orderLocation: {
        type: "ROOM",
        label: "301",
        token: "room-token",
        fulfillmentModes: ["ROOM_DELIVERY"],
        paymentMethods: ["ONLINE"],
      },
      getTotal: () => 10,
      clearCart: vi.fn(),
    });
    (api.createOrder as Mock).mockResolvedValue({
      id: "order1",
      restaurantId: "r1",
      sessionToken: "token123",
      status: "PENDING_PAYMENT",
    });

    render(<CheckoutPage />);
    fireEvent.change(screen.getByLabelText(/checkout.name/i), {
      target: { value: "Carl" },
    });
    fireEvent.click(
      screen.getByRole("button", { name: /checkout.placeOrder/i }),
    );

    await waitFor(() =>
      expect(mockNavigate).toHaveBeenCalledWith(
        "/checkout#session=token123",
        expect.objectContaining({
          replace: true,
          state: expect.objectContaining({
            menuReturnUrl: "/menu/public/r1?sp=room-token",
            autoOpenPayment: true,
          }),
        }),
      ),
    );
    const paymentModal = await screen.findByTestId("payment-modal");
    expect(paymentModal).toHaveTextContent("token123");
    expect(paymentModal).toHaveAttribute("data-allow-cash", "false");
  });

  it("does not open a payment flow when points cover the full online order", async () => {
    (useLocation as Mock).mockReturnValue({
      state: {
        restaurantId: "r1",
        features: ["LOYALTY"],
      },
      hash: "",
    });
    (useAuth as Mock).mockReturnValue({
      user: { id: "owner-1", name: "666", role: "OWNER" },
    });
    (useCart as Mock).mockReturnValue({
      items: [
        {
          id: "item1",
          cartId: "c1",
          quantity: 1,
          price: 10,
          selectedOptions: [],
          rewardPointsPrice: 0,
        },
      ],
      tableNumber: null,
      orderLocation: {
        type: "ROOM",
        label: "301",
        token: "room-token",
        fulfillmentModes: ["ROOM_DELIVERY"],
        paymentMethods: ["ONLINE"],
      },
      getTotal: () => 10,
      clearCart: vi.fn(),
    });
    (api.default.post as Mock).mockResolvedValue({
      data: {
        points: 2000,
        restaurantConfig: {
          isLoyaltyEnabled: true,
          loyaltyRedeemRate: 150,
          loyaltyMaxRedemptionPercent: 100,
        },
      },
    });
    (api.createOrder as Mock).mockResolvedValue({
      id: "order1",
      restaurantId: "r1",
      sessionToken: "token123",
      status: "NEW",
      totalPrice: 0,
    });

    render(<CheckoutPage />);
    fireEvent.change(screen.getByLabelText(/checkout.name/i), {
      target: { value: "666" },
    });
    fireEvent.click(
      await screen.findByRole("switch", {
        name: "checkout.redeemForDiscount",
      }),
    );
    fireEvent.click(
      screen.getByRole("button", { name: /checkout.placeOrder/i }),
    );

    await waitFor(() => {
      expect(api.createOrder).toHaveBeenCalledWith(
        expect.objectContaining({
          usePoints: true,
          redeemPoints: 1500,
          paymentPreference: "ONLINE",
        }),
      );
      expect(mockNavigate).toHaveBeenCalledWith(
        "/order-confirmation",
        expect.anything(),
      );
    });
    expect(mockNavigate).not.toHaveBeenCalledWith(
      expect.stringContaining("/checkout#session="),
      expect.anything(),
    );
  });
});
