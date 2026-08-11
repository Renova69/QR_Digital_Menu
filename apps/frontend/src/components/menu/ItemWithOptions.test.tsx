import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Item } from "../../types";
import { ItemWithOptions } from "./ItemWithOptions";

const { addItem } = vi.hoisted(() => ({ addItem: vi.fn() }));

vi.mock("../../context/CartContext", () => ({
  useCart: () => ({ addItem }),
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, fallback?: string) => fallback ?? key,
    i18n: { language: "en" },
  }),
}));

const pizza: Item = {
  id: "make-your-own",
  name: "Make your own",
  description: null,
  price: 10,
  currency: "EUR",
  categoryId: "pizza",
  options: [
    {
      id: "toppings",
      name: "Toppings",
      type: "ADDON",
      menuItemId: "make-your-own",
      choices: [
        { name: "Olives", priceModifier: 1 },
        { name: "Cheese", priceModifier: 2 },
      ],
    },
  ],
};

describe("ItemWithOptions", () => {
  beforeEach(() => {
    addItem.mockReset();
    vi.spyOn(window, "scrollTo").mockImplementation(() => {});
    vi.spyOn(window, "requestAnimationFrame").mockImplementation((callback) => {
      callback(0);
      return 0;
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("keeps multiple choices selected for one add-on option", async () => {
    const user = userEvent.setup();
    render(<ItemWithOptions item={pizza} />);

    await user.click(screen.getByRole("button", { name: "+ Add" }));
    await user.click(screen.getByRole("button", { name: /^Olives/ }));
    await user.click(screen.getByRole("button", { name: /^Cheese/ }));
    await user.click(screen.getByRole("button", { name: /Add to Cart/ }));

    expect(addItem).toHaveBeenCalledOnce();
    const cartItem = addItem.mock.calls[0][0];
    expect(cartItem.selectedOptions).toHaveLength(2);
    expect(cartItem.selectedOptions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          optionId: "toppings",
          choiceName: "Olives",
        }),
        expect.objectContaining({
          optionId: "toppings",
          choiceName: "Cheese",
        }),
      ]),
    );
  });

  it("keeps a variation limited to one selected choice", async () => {
    const user = userEvent.setup();
    const pizzaWithSize: Item = {
      ...pizza,
      id: "sized-pizza",
      options: [
        {
          id: "size",
          name: "Size",
          type: "VARIATION",
          menuItemId: "sized-pizza",
          choices: [
            { name: "Small", priceModifier: 0 },
            { name: "Large", priceModifier: 4 },
          ],
        },
      ],
    };
    render(<ItemWithOptions item={pizzaWithSize} />);

    await user.click(screen.getByRole("button", { name: "+ Add" }));
    await user.click(screen.getByRole("button", { name: /^Large/ }));
    await user.click(screen.getByRole("button", { name: /Add to Cart/ }));

    const cartItem = addItem.mock.calls[0][0];
    expect(cartItem.selectedOptions).toEqual([
      expect.objectContaining({ optionId: "size", choiceName: "Large" }),
    ]);
  });
});
