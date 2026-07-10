import { describe, it, expect, vi, beforeEach, type Mock } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import KitchenPage from "./KitchenPage";
import { MemoryRouter } from "react-router-dom";
import RestaurantContext from "../../context/RestaurantContext";

// Mocks
vi.mock("../../context/OrderContext", () => ({
  useOrders: vi.fn(),
}));
vi.mock("../../context/SocketContext", () => ({
  useSocket: vi.fn(),
}));
vi.mock("../../hooks/useFeature", () => ({
  useFeature: vi.fn(),
}));
vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, defaultText: string) => defaultText,
  }),
}));

import { useOrders } from "../../context/OrderContext";
import { useSocket } from "../../context/SocketContext";
import { useFeature } from "../../hooks/useFeature";

describe("KitchenPage", () => {
  const mockRestaurant = { id: "rest-1", name: "Test Rest" };

  beforeEach(() => {
    vi.clearAllMocks();
    (useFeature as Mock).mockReturnValue(true); // kds is enabled
    (useSocket as Mock).mockReturnValue({
      socket: { on: vi.fn(), off: vi.fn() },
    });
  });

  const renderPage = () => {
    return render(
      <MemoryRouter>
        <RestaurantContext.Provider
          value={
            {
              activeRestaurant: mockRestaurant,
              setActiveRestaurant: vi.fn(),
              restaurants: [],
              loading: false,
              refreshRestaurants: vi.fn(),
            } as unknown as React.ContextType<typeof RestaurantContext>
          }
        >
          <KitchenPage />
        </RestaurantContext.Provider>
      </MemoryRouter>,
    );
  };

  it("renders KDS headers and columns", () => {
    (useOrders as Mock).mockReturnValue({
      orders: [],
      updateOrderStatus: vi.fn(),
    });
    renderPage();
    expect(screen.getByText(/KITCHEN/i)).toBeDefined();
    expect(screen.getByText(/DISPLAY/i)).toBeDefined();
    expect(screen.getByText(/New/i)).toBeDefined();
    expect(screen.getByText(/In Progress/i)).toBeDefined();
    expect(screen.getByText(/Ready/i)).toBeDefined();
  });

  it("renders orders in correct columns", () => {
    (useOrders as Mock).mockReturnValue({
      orders: [
        {
          id: "order-1",
          status: "NEW",
          items: [],
          createdAt: new Date().toISOString(),
        },
        {
          id: "order-2",
          status: "IN_PROGRESS",
          items: [{ quantity: 2, menuItem: { name: "Burger" } }],
          createdAt: new Date().toISOString(),
        },
      ],
      updateOrderStatus: vi.fn(),
    });
    renderPage();
    expect(screen.getByText(/#order-1/)).toBeDefined();
    expect(screen.getByText(/#order-2/)).toBeDefined();
    expect(screen.getByText("2x Burger")).toBeDefined();
  });

  it("cycles order status when clicked", () => {
    const updateSpy = vi.fn();
    (useOrders as Mock).mockReturnValue({
      orders: [
        {
          id: "order-1",
          status: "NEW",
          items: [],
          createdAt: new Date().toISOString(),
        },
      ],
      updateOrderStatus: updateSpy,
    });
    renderPage();

    const button = screen.getByRole("button", { name: /#order-1/ });
    fireEvent.click(button);
    expect(updateSpy).toHaveBeenCalledWith("order-1", "IN_PROGRESS");
  });

  it("redirects if kds feature is disabled", () => {
    (useFeature as Mock).mockReturnValue(false); // kds disabled
    (useOrders as Mock).mockReturnValue({
      orders: [],
      updateOrderStatus: vi.fn(),
    });

    renderPage();
  });

  it("listens to socket newOrder events", () => {
    const onMock = vi.fn();
    const offMock = vi.fn();
    (useSocket as Mock).mockReturnValue({
      socket: { on: onMock, off: offMock },
    });
    (useOrders as Mock).mockReturnValue({
      orders: [],
      updateOrderStatus: vi.fn(),
    });

    const { unmount } = renderPage();
    expect(onMock).toHaveBeenCalledWith("newOrder", expect.any(Function));

    unmount();
    expect(offMock).toHaveBeenCalledWith("newOrder", expect.any(Function));
  });
});
