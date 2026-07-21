import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import "@testing-library/jest-dom";
import CustomerProfilePage from "./CustomerProfilePage";
import { useAuth } from "../context/AuthContext";
import api from "../lib/api";

vi.mock("../context/AuthContext", () => ({
  useAuth: vi.fn(),
}));

vi.mock("../lib/api", () => ({
  default: {
    get: vi.fn(),
  },
}));

vi.mock("react-router-dom", () => ({
  useNavigate: () => vi.fn(),
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, fallbackOrOptions?: string | Record<string, unknown>) =>
      typeof fallbackOrOptions === "string" ? fallbackOrOptions : key,
    i18n: { language: "en" },
  }),
}));

vi.mock("./profile/DataPrivacyTab", () => ({
  default: () => <div data-testid="data-privacy-tab" />,
}));

describe("CustomerProfilePage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(useAuth).mockReturnValue({
      user: {
        id: "customer-1",
        email: "customer@example.com",
        name: "Maria",
        role: "CUSTOMER",
      },
    } as ReturnType<typeof useAuth>);
  });

  it("keeps successful past orders visible when loyalty accounts fail to load", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    vi.mocked(api.get).mockImplementation((path: string) => {
      if (path === "/loyalty/orders/history") {
        return Promise.resolve({
          data: [
            {
              id: "order-1",
              restaurant: { name: "Cafe Test" },
              createdAt: "2026-07-16T12:00:00.000Z",
              items: [
                {
                  quantity: 2,
                  menuItem: { name: "Banitsa" },
                },
              ],
              totalPrice: 12.5,
              pointsEarned: 10,
              pointsRedeemed: 0,
            },
          ],
        });
      }

      return Promise.reject(new Error("Loyalty accounts unavailable"));
    });

    render(<CustomerProfilePage />);

    await waitFor(() => {
      expect(screen.getByText("Cafe Test")).toBeInTheDocument();
    });
    expect(screen.queryByText("profile.noOrders")).not.toBeInTheDocument();
  });

  it("shows a load error instead of claiming there are no past orders", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    vi.mocked(api.get).mockImplementation((path: string) => {
      if (path === "/loyalty/orders/history") {
        return Promise.reject(new Error("Order history unavailable"));
      }

      return Promise.resolve({ data: [] });
    });

    render(<CustomerProfilePage />);

    expect(
      await screen.findByText("Could not load past orders. Please try again."),
    ).toBeInTheDocument();
    expect(screen.queryByText("profile.noOrders")).not.toBeInTheDocument();
  });

  it("loads older orders through the server cursor without replacing the first page", async () => {
    vi.mocked(api.get).mockImplementation(
      (path: string, config?: { params?: { cursor?: string } }) => {
        if (path === "/loyalty/accounts") {
          return Promise.resolve({ data: [] });
        }
        if (config?.params?.cursor === "order-1") {
          return Promise.resolve({
            data: {
              data: [
                {
                  id: "order-0",
                  restaurant: { name: "Older Cafe" },
                  createdAt: "2026-07-15T12:00:00.000Z",
                  items: [],
                  totalPrice: 5,
                  pointsEarned: 5,
                  pointsRedeemed: 0,
                },
              ],
              nextCursor: null,
            },
          });
        }
        return Promise.resolve({
          data: {
            data: [
              {
                id: "order-1",
                restaurant: { name: "Newest Cafe" },
                createdAt: "2026-07-16T12:00:00.000Z",
                items: [],
                totalPrice: 10,
                pointsEarned: 10,
                pointsRedeemed: 0,
              },
            ],
            nextCursor: "order-1",
          },
        });
      },
    );

    render(<CustomerProfilePage />);

    fireEvent.click(
      await screen.findByRole("button", { name: "Load more orders" }),
    );

    expect(await screen.findByText("Older Cafe")).toBeInTheDocument();
    expect(screen.getByText("Newest Cafe")).toBeInTheDocument();
    expect(api.get).toHaveBeenCalledWith("/loyalty/orders/history", {
      params: { limit: 25, cursor: "order-1" },
    });
  });
});
