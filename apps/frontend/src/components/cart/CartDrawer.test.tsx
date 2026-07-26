import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { vi } from "vitest";
import bgTranslation from "../../locales/bg/translation.json";
import CartDrawer from "./CartDrawer";

const cartMocks = vi.hoisted(() => ({
  items: [
    {
      id: "item-1",
      cartId: "cart-item-1",
      name: "Супа",
      quantity: 1,
      price: 10,
      selectedOptions: [],
    },
  ],
  getTotal: vi.fn(() => 10),
  clearCart: vi.fn(),
  removeItem: vi.fn(),
  addItem: vi.fn(),
}));

vi.mock("../../context/CartContext", () => ({
  useCart: () => cartMocks,
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) =>
      key
        .split(".")
        .reduce<unknown>(
          (value, part) =>
            value &&
            typeof value === "object" &&
            part in (value as Record<string, unknown>)
              ? (value as Record<string, unknown>)[part]
              : undefined,
          bgTranslation,
        ) ?? key,
    i18n: {
      resolvedLanguage: "bg",
      dir: () => "ltr",
    },
  }),
}));

describe("CartDrawer", () => {
  it("describes the first cart action as ordering rather than payment", () => {
    render(
      <MemoryRouter>
        <CartDrawer
          isOpen
          onClose={vi.fn()}
          restaurantId="restaurant-1"
          selectedLang="bg"
        />
      </MemoryRouter>,
    );

    expect(
      screen.getByRole("button", { name: "Продължи към поръчката" }),
    ).toBeTruthy();
    expect(
      screen.queryByRole("button", { name: "Продължи към плащане" }),
    ).toBeNull();
  });
});
