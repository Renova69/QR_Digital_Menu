import React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom";
import { vi, type Mock } from "vitest";
import PosCartDrawer from "./PosCartDrawer";
import { usePos } from "../../context/PosContext";
import RestaurantContext from "../../context/RestaurantContext";
import { usePosTheme } from "../../context/PosThemeContext";
import * as api from "../../lib/api";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

vi.mock("../../context/PosContext", () => ({
  usePos: vi.fn(),
}));

vi.mock("../../context/PosThemeContext", () => ({
  usePosTheme: vi.fn(),
}));

vi.mock("../../lib/api", () => ({
  createOrder: vi.fn(),
  closeSession: vi.fn(),
  closeSessionWithCard: vi.fn(),
  closeSessionWithCash: vi.fn(),
  getOrCreateSession: vi.fn(),
}));

vi.mock("react-dom", async () => {
  const actual = (await vi.importActual("react-dom")) as Record<
    string,
    unknown
  >;
  return {
    ...actual,
    createPortal: (node: React.ReactNode) => node,
  };
});

vi.mock("./PosSplitDrawer", () => ({
  default: () => <div data-testid="split-drawer" />,
}));
vi.mock("./PosQRBill", () => ({
  default: () => <div data-testid="qr-bill" />,
}));
vi.mock("./PaymentModal", () => ({
  default: () => <div data-testid="payment-modal" />,
}));

describe("PosCartDrawer", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (usePosTheme as Mock).mockReturnValue({ theme: "light" });
    (usePos as Mock).mockReturnValue({
      items: [
        {
          cartId: "c1",
          menuItemId: "m1",
          name: "Burger",
          quantity: 2,
          price: 10,
          selectedOptions: [],
          submitted: false,
        },
      ],
      session: {
        sessionToken: "token123",
        tableName: "Table 1",
        tableId: "t1",
      },
      setSession: vi.fn(),
      removeItem: vi.fn(),
      updateQuantity: vi.fn(),
      updateNote: vi.fn(),
      markAsSubmitted: vi.fn(),
      clearSession: vi.fn(),
      getPendingTotal: () => 20,
      buildSpecialRequests: () => "",
      historyLoading: false,
      historyError: null,
    });
  });

  const renderWithContext = (ui: React.ReactElement) => {
    return render(
      <RestaurantContext.Provider
        value={
          {
            activeRestaurant: { id: "r1", paymentsEnabled: true },
          } as unknown as React.ContextType<typeof RestaurantContext>
        }
      >
        {ui}
      </RestaurantContext.Provider>,
    );
  };

  it("renders cart summary button and opens sheet on click", () => {
    renderWithContext(<PosCartDrawer itemCount={2} total={20} />);
    const openBtn = screen.getByRole("button", { name: /item/i });
    expect(openBtn).toBeInTheDocument();
    fireEvent.click(openBtn);
    expect(screen.getByText(/pos.tableLabel/i)).toBeInTheDocument();
  });

  it("allows modifying quantity of items", () => {
    const updateQuantityMock = vi.fn();
    (usePos as Mock).mockReturnValue({
      items: [
        {
          cartId: "c1",
          menuItemId: "m1",
          name: "Burger",
          quantity: 2,
          price: 10,
          selectedOptions: [],
          submitted: false,
        },
      ],
      session: {
        sessionToken: "token123",
        tableName: "Table 1",
        tableId: "t1",
      },
      updateQuantity: updateQuantityMock,
      getPendingTotal: () => 20,
      buildSpecialRequests: () => "",
    });

    renderWithContext(<PosCartDrawer itemCount={2} total={20} />);
    fireEvent.click(screen.getByRole("button", { name: /item/i })); // open
    const minusBtn = screen.getByRole("button", { name: "−" });
    const plusBtn = screen.getByRole("button", { name: "+" });

    fireEvent.click(plusBtn);
    expect(updateQuantityMock).toHaveBeenCalledWith("c1", 3);

    fireEvent.click(minusBtn);
    expect(updateQuantityMock).toHaveBeenCalledWith("c1", 1);
  });

  it("handles checkout submission correctly", async () => {
    const markAsSubmittedMock = vi.fn();
    (usePos as Mock).mockReturnValue({
      items: [
        {
          cartId: "c1",
          menuItemId: "m1",
          name: "Burger",
          quantity: 1,
          price: 10,
          selectedOptions: [],
          submitted: false,
        },
      ],
      session: {
        sessionToken: "token123",
        tableName: "Table 1",
        tableId: "t1",
      },
      getPendingTotal: () => 10,
      buildSpecialRequests: () => "",
      markAsSubmitted: markAsSubmittedMock,
    });
    (api.createOrder as Mock).mockResolvedValue({});

    renderWithContext(<PosCartDrawer itemCount={1} total={10} />);
    fireEvent.click(screen.getByRole("button", { name: /item/i })); // open

    const submitBtn = screen.getByRole("button", {
      name: /pos.submitOrderTotal/i,
    });
    fireEvent.click(submitBtn);

    // opens confirm dialog
    const confirmBtn = screen.getByRole("button", { name: /pos.submit/i });
    fireEvent.click(confirmBtn);

    await waitFor(() => {
      expect(api.createOrder).toHaveBeenCalledWith(
        expect.objectContaining({
          restaurantId: "r1",
          tableId: "Table 1",
          items: [{ menuItemId: "m1", quantity: 1, selectedOptions: [] }],
        }),
      );
      expect(markAsSubmittedMock).toHaveBeenCalled();
    });
  });
});
