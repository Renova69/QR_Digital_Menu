import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import MenuProfitabilityPanel from "./MenuProfitabilityPanel";
import type { MenuProfitabilityItem } from "../../../hooks/useAnalytics";

// t(key, opt): return the string fallback when given, else the key. Object opts
// (interpolation) fall through to the key so assertions can target keys.
vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, opt?: unknown) => (typeof opt === "string" ? opt : key),
  }),
}));

const item = (
  over: Partial<MenuProfitabilityItem> & { menuItemId: string },
): MenuProfitabilityItem => ({
  name: "Item",
  quantity: 1,
  revenue: 10,
  cost: 4,
  profit: 6,
  margin: 60,
  quadrant: "Star",
  ...over,
});

describe("MenuProfitabilityPanel", () => {
  it("hides the matrix and shows a cost hint when no item costs are set", () => {
    render(
      <MenuProfitabilityPanel
        data={{
          items: [
            item({ menuItemId: "a", name: "Margherita", margin: 100, cost: 0 }),
          ],
          summary: { totalCost: 0, totalProfit: 0, overallMargin: 100 },
        }}
      />,
    );

    // Hint visible (fallback string)
    expect(screen.getByText(/Add item costs/i)).toBeTruthy();
    // Misleading 100%-margin quadrants must NOT render
    expect(screen.queryByText("Star")).toBeNull();
    expect(screen.queryByText("Margherita")).toBeNull();
  });

  it("renders the engineering matrix and item rows when costs are set", () => {
    render(
      <MenuProfitabilityPanel
        data={{
          items: [
            item({ menuItemId: "a", name: "Margherita", quadrant: "Star" }),
            item({ menuItemId: "b", name: "Tap Water", quadrant: "Dog" }),
          ],
          summary: { totalCost: 8, totalProfit: 12, overallMargin: 60 },
        }}
      />,
    );

    // Quadrant labels (fallback = capitalized quadrant name)
    expect(screen.getByText(/Star/)).toBeTruthy();
    expect(screen.getByText(/Dog/)).toBeTruthy();
    // Item rows render (name appears in quadrant card + bar row)
    expect(screen.getAllByText("Margherita").length).toBeGreaterThan(0);
    // Cost hint absent
    expect(screen.queryByText(/Add item costs/i)).toBeNull();
  });
});
