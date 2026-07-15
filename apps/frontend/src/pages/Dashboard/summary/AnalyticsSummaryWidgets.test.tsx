import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import LiveTablesGrid from "./LiveTablesGrid";
import RecentOrdersTable from "./RecentOrdersTable";
import KpiRow from "./KpiRow";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, options?: Record<string, unknown> | string) => {
      const values = typeof options === "object" ? options : {};
      if (key === "dashboard.liveTables") return "Live tables";
      if (key === "dashboard.available") {
        return "Very long translated available status";
      }
      if (key === "tables.occupied") return "Occupied";
      if (key === "tables.paid") return "Paid";
      if (key === "dashboard.ordersCount") {
        return `${values.count ?? 0} orders`;
      }
      if (key === "auto.last50Orders") return "Last 50 orders";
      if (key === "dashboard.orderNumber") {
        return `Order #${values.id ?? ""}`;
      }
      if (key === "dashboard.orderTable") {
        return `Table ${values.table ?? ""}`;
      }
      if (key === "dashboard.itemsCount") {
        return `${values.count ?? 0} items`;
      }
      if (key === "orders.tabs.completed") {
        return "Very long translated completed status";
      }
      return typeof options === "string" ? options : key;
    },
    i18n: { language: "en-GB" },
  }),
}));

describe("analytics summary widgets", () => {
  it("renders Starter KPIs without reading stripped peak-hour data", () => {
    render(
      <KpiRow
        showTrends={false}
        data={
          {
            totalOrders: 12,
            totalRevenue: 240,
            avgOrderValue: 20,
            activeCustomers: 8,
            comparison: {
              ordersChange: 0,
              revenueChange: 0,
              avgOrderValueChange: 0,
              activeCustomersChange: 0,
            },
          } as any
        }
      />,
    );

    expect(screen.getByText("12")).toBeTruthy();
    expect(screen.queryByText("dashboard.peakHour")).toBeNull();
  });

  it("keeps long live-table statuses inside responsive table tiles", () => {
    const { container } = render(
      <LiveTablesGrid
        tables={[
          {
            id: "table-1",
            name: "1234",
            zoneId: "zone-1",
            zoneName: "Garden",
            status: "empty",
            orderCount: 0,
            customerNames: [],
          },
          {
            id: "table-2",
            name: "1",
            zoneId: "zone-1",
            zoneName: "Garden",
            status: "occupied",
            orderCount: 3,
            customerNames: ["A very long customer name"],
          },
        ]}
      />,
    );

    expect(
      screen.getByText("Very long translated available status"),
    ).toBeTruthy();
    expect(screen.getByText("3 orders")).toBeTruthy();
    expect(container.innerHTML).not.toContain("grid-cols-5");
    expect(container.innerHTML).not.toContain("overflow-x");
  });

  it("stacks recent-order details and sums item quantities", () => {
    const { container } = render(
      <RecentOrdersTable
        orders={[
          {
            id: "order-123456",
            tableName: "87",
            customerPhone: "+359 888 000 000",
            totalPrice: 42.3,
            status: "COMPLETED",
            createdAt: "2026-07-15T08:44:00.000Z",
            items: [{ quantity: 2 }, { quantity: 3 }],
          },
        ]}
      />,
    );

    expect(screen.getByText("Order #123456")).toBeTruthy();
    expect(screen.getByText("Table 87")).toBeTruthy();
    expect(screen.getByText("5 items")).toBeTruthy();
    expect(
      screen.getByText("Very long translated completed status"),
    ).toBeTruthy();
    expect(container.innerHTML).not.toContain("overflow-x");
  });
});
