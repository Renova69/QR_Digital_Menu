import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import PosSplitDrawer from "./PosSplitDrawer";

const apiMock = vi.hoisted(() => ({
  getSessionBill: vi.fn(),
  settlePartial: vi.fn(),
}));

vi.mock("../../lib/api", () => ({
  getSessionBill: apiMock.getSessionBill,
  settlePartial: apiMock.settlePartial,
}));

// Stable `t` reference across renders — mirrors real i18next and avoids any
// effect that depends on `t` refiring on every render.
const stableT = (key: string, a?: any, b?: any) => {
  let s = typeof a === "string" ? a : key;
  const opts = typeof a === "object" ? a : b;
  if (opts && typeof opts === "object") {
    for (const [k, v] of Object.entries(opts)) {
      s = s.replace(new RegExp(`\\{\\{\\s*${k}\\s*\\}\\}`, "g"), String(v));
    }
  }
  return s;
};
const stableTranslation = { t: stableT };
vi.mock("react-i18next", () => ({
  useTranslation: () => stableTranslation,
}));

const bill = {
  orders: [
    {
      id: "o1",
      source: "POS" as const,
      customerName: null,
      customerPhone: null,
      staffName: null,
      staffRole: null,
      totalPrice: 30,
      items: [
        { orderItemId: "oi-drink", name: "Beer", quantity: 1, paidQuantity: 0, unitPrice: 5, unitPriceWithOptions: 5, selectedOptions: [] },
        { orderItemId: "oi-salad", name: "Salad", quantity: 1, paidQuantity: 0, unitPrice: 8, unitPriceWithOptions: 8, selectedOptions: [] },
        { orderItemId: "oi-main", name: "Steak", quantity: 1, paidQuantity: 0, unitPrice: 17, unitPriceWithOptions: 17, selectedOptions: [] },
      ],
    },
  ],
  subtotal: 30,
  paidSubtotal: 0,
  remaining: 30,
  splitItemsAvailable: true,
  restaurantId: "rest1",
  tipsEnabled: false,
  tipOptions: [],
  paymentProviders: [],
};

function renderDrawer(onFullyPaid = vi.fn(), onOpenChange = vi.fn()) {
  render(
    <PosSplitDrawer
      open
      onOpenChange={onOpenChange}
      sessionToken="tok1"
      restaurantId="rest1"
      onFullyPaid={onFullyPaid}
    />,
  );
  return { onFullyPaid, onOpenChange };
}

describe("PosSplitDrawer", () => {
  beforeEach(() => {
    apiMock.getSessionBill.mockReset().mockResolvedValue(structuredClone(bill));
    apiMock.settlePartial.mockReset();
  });
  afterEach(() => cleanup());

  it("settles selected items via Cash and refreshes the running balance", async () => {
    apiMock.settlePartial.mockResolvedValue({ amount: 5, remaining: 25, sessionPaid: false });
    renderDrawer();

    // Bill loads and shows the unpaid units.
    expect(await screen.findByText("Beer")).toBeTruthy();

    // Select 1 × Beer (first "+" belongs to the first unit row).
    fireEvent.click(screen.getAllByRole("button", { name: "+" })[0]);
    fireEvent.click(screen.getByRole("button", { name: "Cash" }));

    await waitFor(() => expect(apiMock.settlePartial).toHaveBeenCalledTimes(1));
    expect(apiMock.settlePartial).toHaveBeenCalledWith("tok1", {
      restaurantId: "rest1",
      mode: "ITEM",
      provider: "CASH",
      allocations: [{ orderItemId: "oi-drink", quantity: 1 }],
      amount: undefined,
      splitCount: undefined,
      tipPercent: undefined,
    });
    // Partial → bill reloaded for the new remaining (initial load + reload).
    await waitFor(() => expect(apiMock.getSessionBill).toHaveBeenCalledTimes(2));
  });

  it("calls onFullyPaid and closes when the last payment clears the balance", async () => {
    apiMock.settlePartial.mockResolvedValue({ amount: 30, remaining: 0, sessionPaid: true });
    const { onFullyPaid, onOpenChange } = renderDrawer();

    await screen.findByText("Beer");

    // Custom mode → enter full remaining → pay.
    fireEvent.click(screen.getByRole("button", { name: "Custom" }));
    fireEvent.change(screen.getByRole("spinbutton"), { target: { value: "30" } });
    fireEvent.click(screen.getByRole("button", { name: "Cash" }));

    await waitFor(() => expect(onFullyPaid).toHaveBeenCalled());
    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(apiMock.settlePartial).toHaveBeenCalledWith(
      "tok1",
      expect.objectContaining({ mode: "CUSTOM", amount: 30, provider: "CASH" }),
    );
  });

  it("even split charges one share of the remaining balance", async () => {
    apiMock.settlePartial.mockResolvedValue({ amount: 10, remaining: 20, sessionPaid: false });
    renderDrawer();
    await screen.findByText("Beer");

    fireEvent.click(screen.getByRole("button", { name: "Even" }));
    // Default split is 2; bump to 3 ways via the "+" stepper.
    fireEvent.click(screen.getByRole("button", { name: "+" }));
    fireEvent.click(screen.getByRole("button", { name: "Card" }));

    await waitFor(() => expect(apiMock.settlePartial).toHaveBeenCalledTimes(1));
    expect(apiMock.settlePartial).toHaveBeenCalledWith(
      "tok1",
      expect.objectContaining({ mode: "EVEN", splitCount: 3, provider: "MYPOS" }),
    );
  });
});
