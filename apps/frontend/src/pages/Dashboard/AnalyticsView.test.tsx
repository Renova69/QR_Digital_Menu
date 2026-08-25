import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const analytics = vi.hoisted(() => ({ useAnalytics: vi.fn() }));
const feature = vi.hoisted(() => ({ useFeature: vi.fn() }));
const api = vi.hoisted(() => ({
  getFeedbackSummary: vi.fn(),
  getDailyCloseout: vi.fn(),
}));
const exportFns = vi.hoisted(() => ({
  downloadAnalyticsExport: vi.fn(),
  exportCloseoutXlsx: vi.fn(),
}));

vi.mock("../../context/RestaurantContext", async () => {
  const React = await import("react");
  return {
    __esModule: true,
    default: React.createContext({ activeRestaurant: undefined }),
  };
});
vi.mock("../../hooks/useAnalytics", () => ({
  useAnalytics: analytics.useAnalytics,
}));
vi.mock("../../hooks/useFeature", () => ({
  useFeature: feature.useFeature,
}));
vi.mock("../../hooks/useSummaryDateRange", () => ({
  useSummaryDateRange: () => ({
    period: "7d",
    startDate: "2026-08-01",
    endDate: "2026-08-07",
    label: "Last 7 days",
    setPeriod: vi.fn(),
    setCustomRange: vi.fn(),
  }),
}));
vi.mock("../../lib/api", () => ({
  getFeedbackSummary: api.getFeedbackSummary,
  getDailyCloseout: api.getDailyCloseout,
}));
vi.mock("../../lib/analyticsExport", () => ({
  downloadAnalyticsExport: exportFns.downloadAnalyticsExport,
  exportCloseoutXlsx: exportFns.exportCloseoutXlsx,
}));
vi.mock("recharts", () => ({
  ResponsiveContainer: ({ children }: any) => (
    <div data-testid="revenue-chart">{children}</div>
  ),
  AreaChart: ({ children }: any) => <div>{children}</div>,
  Area: () => null,
  CartesianGrid: () => null,
  XAxis: () => null,
  YAxis: () => null,
  Tooltip: () => null,
}));
vi.mock("react-datepicker", () => ({
  default: ({ selected, onChange }: any) => (
    <button
      type="button"
      data-testid="closeout-datepicker"
      onClick={() => onChange(new Date("2026-08-20T00:00:00.000Z"))}
    >
      {selected?.toISOString() ?? "no-date"}
    </button>
  ),
  registerLocale: () => {},
}));
vi.mock("./analytics/Panel", () => ({
  Panel: ({ title, children }: any) => (
    <section data-testid={`panel-${title}`}>
      <h3>{title}</h3>
      {children}
    </section>
  ),
}));
vi.mock("./analytics/ReviewInbox", () => ({
  ReviewInbox: (props: any) => (
    <div data-testid="review-inbox" data-restaurant={props.restaurantId} />
  ),
}));
vi.mock("./analytics/MenuProfitabilityPanel", () => ({
  default: () => <div data-testid="menu-profitability" />,
}));
vi.mock("./analytics/AnalyticsSkeleton", () => ({
  default: () => <div data-testid="analytics-skeleton" />,
}));
vi.mock("./analytics/insights", () => ({
  computeInsights: (data: unknown) => (data ? insightsFixture() : null),
}));
vi.mock("./analytics/primitives", () => ({
  CustomTooltip: () => null,
  EmptyState: ({ message }: any) => <p data-testid="empty-state">{message}</p>,
  InsightCard: ({ label, value }: any) => (
    <div data-testid={`insight-${label}`}>
      {label}: {value}
    </div>
  ),
  MetricCard: ({ label, value, detail, comparisonLabel }: any) => (
    <div data-testid={`metric-${label}`} data-comparison={comparisonLabel}>
      {label}: {value} {detail}
    </div>
  ),
  SignalRow: ({ label, value }: any) => (
    <div>
      {label}: {value}
    </div>
  ),
}));
vi.mock("./analytics/panels", () => ({
  CategoryMix: () => <div data-testid="category-mix" />,
  GuestSatisfaction: () => <div data-testid="guest-satisfaction" />,
  HourlyDemand: () => <div data-testid="hourly-demand" />,
  MenuEngineering: () => <div data-testid="menu-engineering" />,
  OrderFlow: () => <div data-testid="order-flow" />,
  PaymentMethods: () => <div data-testid="payment-methods" />,
  RevenueReconciliation: () => <div data-testid="revenue-reconciliation" />,
  TableYield: () => <div data-testid="table-yield" />,
}));
vi.mock("./analytics/advancedPanels", () => ({
  CancelAnalysisPanel: () => <div data-testid="cancel-analysis" />,
  CustomerKitchenPanels: () => <div data-testid="customer-kitchen" />,
  StaffPerformancePanel: () => <div data-testid="staff-performance" />,
  TableTurnoverPanel: () => <div data-testid="table-turnover" />,
}));
vi.mock("./summary/DateRangeFilter", () => ({
  default: ({ title, subtitle, label }: any) => (
    <div data-testid="date-range-filter" data-title={title}>
      {label} - {subtitle}
    </div>
  ),
}));
vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (
      key: string,
      fallback?: unknown,
      options?: Record<string, unknown>,
    ) => {
      if (typeof fallback === "string") {
        return fallback.replace(
          /\{\{(\w+)\}\}/g,
          (_m, name: string) => String(options?.[name] ?? `{{${name}}}`),
        );
      }
      if (
        fallback &&
        typeof fallback === "object" &&
        typeof (fallback as Record<string, unknown>).defaultValue === "string"
      ) {
        return ((fallback as Record<string, unknown>).defaultValue as string)
          .replace(/\{\{(\w+)\}\}/g, (_m, name: string) =>
            String(
              (fallback as Record<string, unknown>)[name] ?? `{{${name}}}`,
            ),
          );
      }
      return key;
    },
    i18n: { language: "en" },
  }),
}));

import RestaurantContext from "../../context/RestaurantContext";
import type { RestaurantContextType } from "../../context/RestaurantContext";
import AnalyticsView from "./AnalyticsView";

function insightsFixture() {
  return {
    completed: 36,
    bestDay: { date: "2026-08-02", revenue: 200, orders: 8 },
    busiestWindow: { label: "12:00-14:00", orders: 10 },
    topThreeShare: 0.55,
    topItemShare: 0.3,
    heroItem: { name: "Burger", share: 0.3 },
    bestTable: { table: "T-1", revenue: 100, orders: 4 },
    averageDailyRevenue: 140,
    peakHour: { label: "13:00" },
    peakHours: [],
    peakRevenueHour: { label: "13:00", revenue: 80 },
    dayPartTotals: [{ id: "lunch", label: "Lunch", orders: 10, share: 50 }],
    topItems: [],
    itemRevenueTotal: 500,
    topItemRevenue: 150,
    tables: [],
    statuses: [],
    cancelRate: 0.05,
    canceled: 2,
    quietDay: { date: "2026-08-06", orders: 2 },
  };
}

function analyticsData(overrides: Record<string, unknown> = {}) {
  return {
    periodStart: "2026-08-01",
    periodEnd: "2026-08-07",
    prevPeriodStart: "2026-07-25",
    prevPeriodEnd: "2026-07-31",
    totalRevenue: 1000,
    totalOrders: 40,
    avgOrderValue: 25,
    activeCustomers: 12,
    completionRate: 0.9,
    repeatCustomerRate: 0.3,
    collectedRevenue: 950,
    refundedAmount: 50,
    paymentsByMethod: [],
    revenueTrend: [{ date: "2026-08-01", revenue: 100 }],
    categoryBreakdown: [],
    comparison: {
      revenueChange: 5,
      ordersChange: 2,
      avgOrderValueChange: 1,
      activeCustomersChange: 0,
    },
    ...overrides,
  };
}

function renderView(options: {
  data?: unknown;
  loading?: boolean;
  placeholder?: boolean;
  error?: boolean;
  fullAnalytics?: boolean;
} = {}) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  analytics.useAnalytics.mockReturnValue({
    data: options.data === undefined ? analyticsData() : options.data,
    isLoading: options.loading ?? false,
    isPlaceholderData: options.placeholder ?? false,
    error: options.error ? new Error("down") : null,
  });
  feature.useFeature.mockReturnValue(options.fullAnalytics ?? true);
  api.getFeedbackSummary.mockResolvedValue({});
  api.getDailyCloseout.mockResolvedValue({});
  const utils = render(
    <QueryClientProvider client={client}>
      <RestaurantContext.Provider
        value={
          {
            activeRestaurant: {
              id: "rest-1",
              name: "Cafe Nova",
              country: "BG",
              ownerId: "owner-1",
            },
          } as RestaurantContextType
        }
      >
        <AnalyticsView />
      </RestaurantContext.Provider>
    </QueryClientProvider>,
  );
  return { client, ...utils };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("AnalyticsView states", () => {
  it("shows the skeleton while loading", () => {
    renderView({ loading: true });

    expect(screen.getByTestId("analytics-skeleton")).toBeTruthy();
  });

  it("shows the error state", () => {
    renderView({ error: true });

    expect(screen.getByText("analytics.loadingFailed")).toBeTruthy();
    expect(screen.getByText("analytics.checkConnection")).toBeTruthy();
  });

  it("renders nothing without data", () => {
    const { container } = renderView({ data: null });

    expect(container).toBeEmptyDOMElement();
  });
});

describe("AnalyticsView header & metrics", () => {
  it("renders the date range filter and the five metric cards", async () => {
    renderView();

    expect(await screen.findByTestId("date-range-filter")).toBeTruthy();
    expect(
      screen.getByTestId("date-range-filter").getAttribute("data-title"),
    ).toBe("Performance Analytics");
    expect(screen.getByTestId("metric-Revenue")).toHaveTextContent("1000.00 €");
    expect(screen.getByTestId("metric-Orders")).toHaveTextContent("40");
    expect(screen.getByTestId("metric-Avg. order")).toHaveTextContent("25.00 €");
    expect(screen.getByTestId("metric-Active customers")).toHaveTextContent("12");
    expect(screen.getByTestId("metric-Completion rate")).toHaveTextContent("0.9%");
  });

  it("shows the locked banner and hides the export for lower tiers", async () => {
    renderView({ fullAnalytics: false });

    expect(await screen.findByText("Full Analytics locked")).toBeTruthy();
    expect(
      screen.getByText(
        "Deep menu, table, demand, and guest analytics require Professional plan.",
      ),
    ).toBeTruthy();
    expect(
      screen.getByRole("link", { name: "Upgrade" }).getAttribute("href"),
    ).toBe("/pricing");
    expect(screen.queryByRole("button", { name: "Export" })).toBeNull();
    expect(screen.queryByTestId("insight-Revenue leader")).toBeNull();
  });

  it("disables the export while placeholder data is shown", async () => {
    renderView({ placeholder: true });

    expect(
      (screen.getByRole("button", { name: "Export" }) as HTMLButtonElement)
        .disabled,
    ).toBe(true);
  });

  it("exports the analytics workbook", async () => {
    exportFns.downloadAnalyticsExport.mockResolvedValue(undefined);
    renderView();

    await userEvent.click(
      await screen.findByRole("button", { name: "Export" }),
    );

    await waitFor(() =>
      expect(exportFns.downloadAnalyticsExport).toHaveBeenCalledWith(
        expect.objectContaining({ totalRevenue: 1000 }),
        expect.objectContaining({ restaurantName: "Cafe Nova" }),
        expect.any(Function),
        expect.anything(),
      ),
    );
  });
});

describe("AnalyticsView panels & gating", () => {
  it("renders the revenue chart when a trend exists", async () => {
    renderView();

    expect(await screen.findByTestId("revenue-chart")).toBeTruthy();
  });

  it("shows the empty revenue state without trend data", async () => {
    renderView({ data: analyticsData({ revenueTrend: [] }) });

    expect(
      await screen.findByText("No revenue data for this period"),
    ).toBeTruthy();
    expect(screen.queryByTestId("revenue-chart")).toBeNull();
  });

  it("renders insight cards with deterministic values", async () => {
    renderView();

    expect(await screen.findByTestId("insight-Revenue leader")).toHaveTextContent(
      "Revenue leader",
    );
    expect(screen.getByTestId("insight-Peak window")).toHaveTextContent(
      "12:00-14:00",
    );
    expect(screen.getByTestId("insight-Best table")).toHaveTextContent("T-1");
  });

  it("gates the advanced panels by their data presence", async () => {
    renderView({
      data: analyticsData({
        staffPerformance: [{ id: "s1" }],
        customerMetrics: { returning: 2 },
        cancelAnalytics: { totalCanceledOrders: 3 },
        tableTurnover: [{ id: "tt1" }],
      }),
    });

    expect(await screen.findByTestId("staff-performance")).toBeTruthy();
    expect(screen.getByTestId("customer-kitchen")).toBeTruthy();
    expect(screen.getByTestId("cancel-analysis")).toBeTruthy();
    expect(screen.getByTestId("table-turnover")).toBeTruthy();
  });

  it("hides the advanced panels without their data", async () => {
    renderView({
      data: analyticsData({
        cancelAnalytics: { totalCanceledOrders: 0 },
      }),
    });

    await screen.findByTestId("date-range-filter");
    expect(screen.queryByTestId("staff-performance")).toBeNull();
    expect(screen.queryByTestId("customer-kitchen")).toBeNull();
    expect(screen.queryByTestId("cancel-analysis")).toBeNull();
    expect(screen.queryByTestId("table-turnover")).toBeNull();
  });

  it("gates the menu profitability panel by items and missing costs", async () => {
    renderView({
      data: analyticsData({
        menuProfitability: {
          items: [],
          summary: { missingCostItems: 0 },
        },
      }),
    });

    await screen.findByTestId("date-range-filter");
    expect(screen.queryByTestId("menu-profitability")).toBeNull();
  });

  it("shows the menu profitability panel when costs are missing", async () => {
    renderView({
      data: analyticsData({
        menuProfitability: {
          items: [],
          summary: { missingCostItems: 2 },
        },
      }),
    });

    expect(await screen.findByTestId("menu-profitability")).toBeTruthy();
  });

  it("renders the gross profit tiles with the cost warning", async () => {
    renderView({
      data: analyticsData({
        grossProfit: {
          grossProfit: 600,
          grossMargin: 60,
          netSales: 900,
          estimatedCOGS: 300,
          missingCostItems: 2,
        },
      }),
    });

    expect(await screen.findByText("Gross Profit")).toBeTruthy();
    expect(screen.getByText("600.00 €")).toBeTruthy();
    expect(screen.getByText("60%")).toBeTruthy();
    expect(screen.getByText("900.00 €")).toBeTruthy();
    expect(screen.getByText("300.00 €")).toBeTruthy();
    expect(
      screen.getByText(
        "2 sold item(s) have no usable cost. Profit excludes those costs.",
      ),
    ).toBeTruthy();
  });
});

describe("AnalyticsView feedback & closeout", () => {
  it("fetches the feedback summary only with full analytics and a period", async () => {
    renderView();

    await waitFor(() =>
      expect(api.getFeedbackSummary).toHaveBeenCalledWith(
        "rest-1",
        "2026-08-01",
        "2026-08-07",
      ),
    );
  });

  it("skips the feedback query for locked tiers", async () => {
    renderView({ fullAnalytics: false });

    await screen.findByText("Full Analytics locked");
    expect(api.getFeedbackSummary).not.toHaveBeenCalled();
  });

  it("generates the daily closeout report", async () => {
    exportFns.exportCloseoutXlsx.mockResolvedValue(undefined);
    renderView();

    await userEvent.click(await screen.findByTestId("closeout-datepicker"));
    await userEvent.click(
      screen.getByRole("button", { name: "Generate Closeout" }),
    );

    await waitFor(() =>
      expect(api.getDailyCloseout).toHaveBeenCalledWith("rest-1", "2026-08-20"),
    );
    await waitFor(() => expect(exportFns.exportCloseoutXlsx).toHaveBeenCalled());
  });
});
