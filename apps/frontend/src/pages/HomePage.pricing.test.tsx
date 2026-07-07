import { render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import HomePage from "./HomePage";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

vi.mock("../components/menu/SocialBar", () => ({ default: () => null }));
vi.mock("../components/menu/TopBar", () => ({ TopBar: () => null }));
vi.mock("../components/menu/CategoryPills", () => ({
  CategoryPills: () => null,
}));
vi.mock("../components/menu/ItemWithOptions", () => ({
  ItemWithOptions: () => null,
}));
vi.mock("../components/menu/Footer", () => ({ default: () => null }));
vi.mock("../context/CartContext", () => ({
  CartProvider: ({ children }: { children: ReactNode }) => children,
}));

describe("HomePage reservation pricing", () => {
  it("lists reservations in the Professional card and comparison table", () => {
    render(
      <MemoryRouter>
        <HomePage />
      </MemoryRouter>,
    );

    expect(
      screen.getByText("landing.pricingSection.plans.professional.b10"),
    ).toBeTruthy();
    expect(
      screen.getByText("landing.comparisonTable.rows.reservations"),
    ).toBeTruthy();
  });
});
