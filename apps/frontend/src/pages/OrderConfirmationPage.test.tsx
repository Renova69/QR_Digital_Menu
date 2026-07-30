import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import "@testing-library/jest-dom";
import { vi, type Mock } from "vitest";
import { useLocation, useNavigate } from "react-router-dom";
import OrderConfirmationPage from "./OrderConfirmationPage";

vi.mock("react-router-dom", () => ({
  useLocation: vi.fn(),
  useNavigate: vi.fn(),
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

vi.mock("../context/SocketContext", () => ({
  useSocket: () => ({ socket: null, isConnected: false }),
}));

describe("OrderConfirmationPage service-point navigation", () => {
  it("preserves the service-point token when returning to the menu", () => {
    const navigate = vi.fn();
    (useNavigate as Mock).mockReturnValue(navigate);
    (useLocation as Mock).mockReturnValue({
      state: {
        orderNumber: "order-1",
        orderId: "order-1",
        restaurantId: "restaurant-1",
        tableNumber: "301",
        menuReturnUrl: "/menu/public/restaurant-1?sp=room-token",
      },
    });

    render(<OrderConfirmationPage />);
    expect(
      screen.queryByText("orderConfirmation.enjoyingVisit"),
    ).not.toBeInTheDocument();
    fireEvent.click(
      screen.getByRole("button", {
        name: "orderConfirmation.continueBrowsing",
      }),
    );

    expect(navigate).toHaveBeenCalledWith(
      "/menu/public/restaurant-1?sp=room-token",
    );
  });
});
