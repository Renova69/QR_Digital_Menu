import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const api = vi.hoisted(() => ({
  superAdminGetMrr: vi.fn(),
}));

vi.mock("../../lib/api", () => ({
  superAdminGetMrr: api.superAdminGetMrr,
}));
vi.mock("recharts", () => ({
  ResponsiveContainer: ({ children }: any) => (
    <div data-testid="chart-container">{children}</div>
  ),
  BarChart: ({ children }: any) => <div data-testid="bar-chart">{children}</div>,
  Bar: ({ children }: any) => <div>{children}</div>,
  XAxis: () => null,
  YAxis: () => null,
  Tooltip: () => null,
  Cell: () => null,
}));

import RevenuePage from "./RevenuePage";

function mrr() {
  return {
    mrr: 1234,
    arr: 14808,
    byTier: [
      { tier: "FREE", price: 0, billing: 5, effective: 4, contribution: 0 },
      { tier: "STARTER", price: 29, billing: 8, effective: 8, contribution: 232 },
      {
        tier: "PROFESSIONAL",
        price: 99,
        billing: 9,
        effective: 10,
        contribution: 891,
      },
      {
        tier: "ENTERPRISE",
        price: 199,
        billing: 3,
        effective: 3,
        contribution: 111,
      },
    ],
    newLast30d: { FREE: 1, STARTER: 2 },
    recentTierChanges: [
      {
        action: "STARTER -> PROFESSIONAL",
        createdAt: "2026-08-20T10:00:00.000Z",
      },
    ],
  };
}

function renderView(options: { data?: unknown } = {}) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  if (options.data !== undefined) {
    api.superAdminGetMrr.mockResolvedValue(options.data);
  }
  const utils = render(
    <QueryClientProvider client={client}>
      <RevenuePage />
    </QueryClientProvider>,
  );
  return { client, ...utils };
}

beforeEach(() => {
  vi.clearAllMocks();
  api.superAdminGetMrr.mockResolvedValue(mrr());
});

describe("RevenuePage rendering", () => {
  it("shows the loading message while pending", () => {
    api.superAdminGetMrr.mockReturnValue(new Promise(() => {}));
    renderView();

    expect(screen.getByText("Loading revenue data…")).toBeTruthy();
  });

  it("shows the error message when the query fails", async () => {
    api.superAdminGetMrr.mockRejectedValue(new Error("down"));
    renderView();

    expect(
      await screen.findByText("Failed to load revenue data."),
    ).toBeTruthy();
  });

  it("renders the MRR, ARR and new-tenant KPI cards", async () => {
    renderView();

    expect(await screen.findByText("Revenue")).toBeTruthy();
    expect(screen.getAllByText("MRR").length).toBe(2);
    expect(screen.getAllByText("€1,234").length).toBe(2);
    expect(screen.getByText("ARR")).toBeTruthy();
    expect(screen.getByText("€14,808")).toBeTruthy();
    expect(screen.getByText("New tenants (30d)")).toBeTruthy();
    expect(
      screen.getByText("New tenants (30d)").parentElement!.nextElementSibling
        ?.textContent,
    ).toBe("3");
  });

  it("renders the tier table with free pricing and the total MRR row", async () => {
    renderView();

    expect(
      await screen.findByText("Revenue contribution by tier"),
    ).toBeTruthy();
    const table = within(screen.getByRole("table"));
    expect(table.getByText("Free")).toBeTruthy();
    expect(table.getByText("€29")).toBeTruthy();
    expect(table.getByText("€232")).toBeTruthy();
    expect(table.getByText("Total MRR")).toBeTruthy();
    expect(table.getAllByText("€1,234").length).toBeGreaterThanOrEqual(1);
  });

  it("renders the tenants-by-tier chart section", async () => {
    renderView();

    expect(await screen.findByText("Tenants by tier")).toBeTruthy();
    expect(screen.getByTestId("chart-container")).toBeTruthy();
    expect(screen.getByTestId("bar-chart")).toBeTruthy();
  });

  it("renders the new-tenants-30d chips", async () => {
    renderView();

    expect(await screen.findByText("New tenants last 30 days")).toBeTruthy();
    expect(screen.getAllByText("STARTER").length).toBeGreaterThanOrEqual(2);
  });

  it("renders recent tier changes with dates", async () => {
    renderView();

    expect(await screen.findByText("Recent tier changes (30d)")).toBeTruthy();
    expect(screen.getByText("STARTER -> PROFESSIONAL")).toBeTruthy();
  });

  it("hides the conditional sections when there is no data", async () => {
    renderView({
      data: { ...mrr(), newLast30d: {}, recentTierChanges: [] },
    });

    expect(await screen.findByText("Revenue")).toBeTruthy();
    expect(screen.queryByText("New tenants last 30 days")).toBeNull();
    expect(screen.queryByText("Recent tier changes (30d)")).toBeNull();
  });
});
