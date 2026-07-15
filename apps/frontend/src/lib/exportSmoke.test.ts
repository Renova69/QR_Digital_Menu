import type { TFunction } from "i18next";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { downloadAnalyticsExport } from "./analyticsExport";
import { downloadMenuExport } from "./menuExport";
import { downloadPaymentsExport } from "./paymentsExport";
import type { AnalyticsData } from "../hooks/useAnalytics";
import type { PaymentRecord } from "../pages/Dashboard/paymentsShared";

const xlsxMocks = vi.hoisted(() => ({
  writeXlsxFile: vi.fn(),
  toFile: vi.fn(),
}));

vi.mock("write-excel-file/browser", () => ({
  default: xlsxMocks.writeXlsxFile,
}));

const t = ((
  key: string,
  fallbackOrOptions?: string | { defaultValue?: string },
) =>
  typeof fallbackOrOptions === "string"
    ? fallbackOrOptions
    : (fallbackOrOptions?.defaultValue ?? key)) as TFunction;

const analyticsData: AnalyticsData = {
  period: 7,
  revenueTrend: [{ date: "2026-06-12", revenue: 42, orders: 3 }],
  topItems: [{ name: "Soup", quantity: 3, revenue: 42 }],
  peakHours: [{ hour: 12, label: "12:00", orders: 3, revenue: 42 }],
  totalRevenue: 42,
  collectedRevenue: 40,
  refundedAmount: 0,
  paymentsByMethod: [{ method: "STRIPE", amount: 40 }],
  totalOrders: 3,
  activeCustomers: 2,
  avgOrderValue: 14,
  completionRate: 100,
  repeatCustomerRate: 50,
  ordersByStatus: [{ status: "COMPLETED", count: 3 }],
  categoryBreakdown: [{ category: "Lunch", revenue: 42 }],
  ordersByTable: [{ table: "A1", orders: 3, revenue: 42 }],
  comparison: {
    revenueChange: 0,
    ordersChange: 0,
    activeCustomersChange: 0,
    avgOrderValueChange: 0,
  },
};

const paymentRecord: PaymentRecord = {
  id: "pay-1",
  amount: 20,
  tipAmount: 2,
  platformFeeAmount: 1,
  currency: "EUR",
  status: "SUCCEEDED",
  provider: "EPAY",
  createdAt: "2026-06-12T10:00:00.000Z",
  tableSessionId: "session-1",
  tableNumber: "A1",
  customerName: "Maria",
  providerReference: "epay-ref",
};

describe("XLSX export smoke coverage", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-12T10:00:00.000Z"));
    xlsxMocks.toFile.mockResolvedValue(undefined);
    xlsxMocks.writeXlsxFile.mockReturnValue({ toFile: xlsxMocks.toFile });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it("downloads analytics exports through the browser toFile API", async () => {
    await downloadAnalyticsExport(
      analyticsData,
      {
        restaurantName: "Demo Restaurant",
        startDate: "2026-06-01",
        endDate: "2026-06-12",
        period: 7,
      },
      t,
    );

    expect(xlsxMocks.writeXlsxFile).toHaveBeenCalledWith(
      expect.arrayContaining([expect.objectContaining({ sheet: "Summary" })]),
    );
    expect(xlsxMocks.toFile).toHaveBeenCalledWith(
      "analytics-demo-restaurant-2026-06-01_to_2026-06-12.xlsx",
    );
  });

  it("downloads payments exports through the browser toFile API", async () => {
    await downloadPaymentsExport(
      [paymentRecord],
      { restaurantName: "Demo Restaurant" },
      t,
    );

    expect(xlsxMocks.writeXlsxFile).toHaveBeenCalledWith(
      expect.arrayContaining([expect.objectContaining({ sheet: "Summary" })]),
    );
    expect(xlsxMocks.toFile).toHaveBeenCalledWith(
      "payments-demo-restaurant-2026-06-12.xlsx",
    );
  });

  it("downloads menu exports through the browser toFile API", async () => {
    await downloadMenuExport(
      {
        restaurantId: "restaurant-12345678",
        categories: [
          {
            id: "cat-1",
            name: "Lunch",
            items: [
              {
                name: "Soup",
                price: 5,
                options: [
                  {
                    name: "Size",
                    choices: [{ name: "Large", priceModifier: 1 }],
                  },
                ],
              },
            ],
          },
        ],
      },
      t,
      "Demo Restaurant",
    );

    expect(xlsxMocks.writeXlsxFile).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({ sheet: "Categories" }),
      ]),
    );
    expect(xlsxMocks.toFile).toHaveBeenCalledWith(
      "menu-export-demo-restaurant-2026-06-12.xlsx",
    );
  });

  it("escapes formula-injection in menu names/items (#29)", async () => {
    await downloadMenuExport(
      {
        restaurantId: "restaurant-12345678",
        categories: [
          {
            id: "cat-1",
            name: "=SUM(A1)",
            items: [{ name: "=cmd|' /C calc'!A0", price: 5 }],
          },
        ],
      },
      t,
      "Demo Restaurant",
    );

    const sheets = xlsxMocks.writeXlsxFile.mock.calls[0][0] as Array<{
      sheet: string;
      data: Array<Array<{ value: unknown }>>;
    }>;
    const items = sheets.find((s) => s.sheet === "Items")!;
    const categories = sheets.find((s) => s.sheet === "Categories")!;
    // Row 0 is the header; the name lives in column index 1 of each sheet.
    expect(String(items.data[1][1].value)).toMatch(/^'=cmd/);
    expect(String(categories.data[1][1].value)).toMatch(/^'=SUM/);
  });
});
