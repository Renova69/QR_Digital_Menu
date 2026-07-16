import { render } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import RecentOrdersTable from "./RecentOrdersTable";

const t = vi.fn((key: string, opt?: unknown) =>
  typeof opt === "string" ? opt : key,
);

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t, i18n: { language: "en" } }),
}));

const baseOrder = {
  id: "order-1",
  tableName: "Table 1",
  totalPrice: 10,
  createdAt: "2026-07-16T10:00:00.000Z",
};

describe("RecentOrdersTable", () => {
  it("resolves PENDING_PAYMENT to its camelCase i18n key, not the broken snake_case guess (Tier 3)", () => {
    render(
      <RecentOrdersTable
        orders={[{ ...baseOrder, status: "PENDING_PAYMENT" }]}
      />,
    );

    expect(t).toHaveBeenCalledWith(
      "orders.tabs.pendingPayment",
      "PENDING_PAYMENT",
    );
    expect(t).not.toHaveBeenCalledWith(
      "orders.tabs.pending_payment",
      expect.anything(),
    );
  });

  it("still resolves a single-word status via the lowercase fallback", () => {
    render(<RecentOrdersTable orders={[{ ...baseOrder, status: "SERVED" }]} />);

    expect(t).toHaveBeenCalledWith("orders.tabs.served", "SERVED");
  });

  it("sums item quantity without producing NaN when an item is missing quantity", () => {
    render(
      <RecentOrdersTable
        orders={[
          {
            ...baseOrder,
            status: "NEW",
            items: [
              { quantity: 2 },
              { quantity: undefined as unknown as number },
            ],
          },
        ]}
      />,
    );

    expect(t).toHaveBeenCalledWith("dashboard.itemsCount", { count: 2 });
  });
});
