import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import PosOptionsDrawer from "./PosOptionsDrawer";

const posMocks = vi.hoisted(() => ({
  addItem: vi.fn(),
}));

vi.mock("../../context/PosContext", () => ({
  usePos: () => ({ addItem: posMocks.addItem, activeSeat: 2 }),
}));

vi.mock("../../context/PosThemeContext", () => ({
  usePosTheme: () => ({ theme: "light" }),
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, fallbackOrOptions?: string | Record<string, unknown>) => {
      if (key === "pos.addToCart") {
        return `Add €${String((fallbackOrOptions as { total: string }).total)}`;
      }
      return typeof fallbackOrOptions === "string" ? fallbackOrOptions : key;
    },
  }),
}));

describe("PosOptionsDrawer", () => {
  beforeEach(() => {
    posMocks.addItem.mockReset();
  });

  afterEach(() => cleanup());

  it("adds multiple choices from the same add-on group to one POS item", async () => {
    render(<PosOptionsDrawer />);

    act(() => {
      window.dispatchEvent(
        new CustomEvent("pos:open-options", {
          detail: {
            id: "pizza",
            name: "Pizza",
            price: 10,
            options: [
              {
                id: "toppings",
                name: "Toppings",
                type: "ADDON",
                required: false,
                choices: [
                  { name: "Olives", priceModifier: 1 },
                  { name: "Cheese", priceModifier: 2 },
                ],
              },
            ],
          },
        }),
      );
    });

    fireEvent.click(await screen.findByRole("button", { name: /Olives/ }));
    fireEvent.click(screen.getByRole("button", { name: /Cheese/ }));
    fireEvent.click(screen.getByRole("button", { name: "Add €13.00" }));

    expect(posMocks.addItem).toHaveBeenCalledWith(
      expect.objectContaining({
        menuItemId: "pizza",
        seatNumber: 2,
        selectedOptions: [
          {
            optionId: "toppings",
            optionName: "Toppings",
            choiceName: "Olives",
            priceModifier: 1,
          },
          {
            optionId: "toppings",
            optionName: "Toppings",
            choiceName: "Cheese",
            priceModifier: 2,
          },
        ],
      }),
    );
  });
});
