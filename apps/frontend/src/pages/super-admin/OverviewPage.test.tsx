import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const api = vi.hoisted(() => ({
  getSuperAdminStats: vi.fn(),
}));

vi.mock("../../lib/api", () => ({
  getSuperAdminStats: api.getSuperAdminStats,
}));
vi.mock("react-router-dom", () => ({
  Link: ({ to, children }: any) => <a href={to}>{children}</a>,
}));
vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, fallback?: unknown) =>
      typeof fallback === "string" ? fallback : key,
    i18n: { language: "en" },
  }),
}));

import OverviewPage from "./OverviewPage";

function stats() {
  return {
    userRoles: {
      OWNER: 3,
      MANAGER: 4,
      WAITER: 5,
      KITCHEN: 2,
      STAFF: 1,
      CUSTOMER: 40,
    },
    totalRestaurants: 25,
    activeRestaurants: 20,
    deletedRestaurants: 5,
    totalUsers: 55,
    paidPlanTenants: 12,
    stripeLinkedSubscriptions: 10,
    suspendedCount: 2,
    forcedOverrideCount: 4,
    forcedUpgrades: 3,
    forcedDowngrades: 1,
    byBillingTier: { FREE: 5, STARTER: 8, PROFESSIONAL: 9, ENTERPRISE: 3 },
    byEffectiveTier: { FREE: 4, STARTER: 8, PROFESSIONAL: 10, ENTERPRISE: 3 },
    recent: {
      restaurants7d: 3,
      users7d: 7,
      orders7d: 120,
      orders24h: 15,
      payments7d: { amount: 12500, count: 40 },
    },
    attentionNeeded: {
      forcedOverrides: {
        count: 1,
        items: [
          {
            id: "t-1",
            name: "Cafe Nova",
            ownerEmail: "o@c.bg",
            billingTier: "FREE",
            effectiveTier: "ENTERPRISE",
          },
        ],
      },
      paymentsNotOnboarded: { count: 0, items: [] },
      emptyMenus: {
        count: 2,
        items: [{ id: "t-2", name: "Pizza Bar", ownerEmail: "p@c.bg" }],
      },
      noTables: { count: 0, items: [] },
      inactiveTenants: { count: 0, items: [] },
    },
  };
}

function renderView(options: { stats?: unknown } = {}) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  if (options.stats !== undefined) {
    api.getSuperAdminStats.mockResolvedValue(options.stats);
  }
  const utils = render(
    <QueryClientProvider client={client}>
      <OverviewPage />
    </QueryClientProvider>,
  );
  return { client, ...utils };
}

beforeEach(() => {
  vi.clearAllMocks();
  api.getSuperAdminStats.mockResolvedValue(stats());
});

describe("OverviewPage rendering", () => {
  it("shows the loading skeleton while the query is pending", () => {
    api.getSuperAdminStats.mockReturnValue(new Promise(() => {}));
    const { container } = renderView();

    expect(container.querySelectorAll(".animate-pulse").length).toBeGreaterThanOrEqual(8);
  });

  it("shows the error state when stats fail to load", async () => {
    api.getSuperAdminStats.mockRejectedValue(new Error("down"));
    renderView();

    expect(
      await screen.findByText("Failed to load platform stats"),
    ).toBeTruthy();
    expect(
      screen.getByText("Check your connection and try again"),
    ).toBeTruthy();
  });

  it("renders the four platform KPI cards with helpers", async () => {
    renderView();

    expect(await screen.findByText("Overview")).toBeTruthy();
    expect(screen.getByText("Restaurants")).toBeTruthy();
    expect(screen.getByText("20 active, 5 deleted")).toBeTruthy();
    expect(screen.getByText("Users")).toBeTruthy();
    expect(screen.getByText("3 owners, 12 staff, 40 customers")).toBeTruthy();
    expect(screen.getByText("Paid Plan Tenants")).toBeTruthy();
    expect(screen.getByText("10 Stripe subscriptions linked")).toBeTruthy();
    expect(screen.getByText("Suspended")).toBeTruthy();
    expect(screen.getByText("4 force tier overrides")).toBeTruthy();
  });

  it("renders the recent-activity cards with formatted money", async () => {
    renderView();

    expect(await screen.findByText("New Restaurants")).toBeTruthy();
    expect(screen.getByText("New Users")).toBeTruthy();
    expect(screen.getByText("Orders")).toBeTruthy();
    expect(screen.getByText("15 in the last 24h")).toBeTruthy();
    expect(screen.getByText("Payment Volume")).toBeTruthy();
    expect(screen.getByText("€12,500")).toBeTruthy();
    expect(screen.getByText("40 successful payments, 7 days")).toBeTruthy();
  });

  it("renders the tier distribution with the override delta", async () => {
    renderView();

    expect(await screen.findByText("Tier Distribution")).toBeTruthy();
    expect(screen.getByText("Subscription (Stripe)")).toBeTruthy();
    expect(screen.getByText("Active (no overrides)")).toBeTruthy();
    expect(screen.getByText("Active (overridden)")).toBeTruthy();
    // PROFESSIONAL: 9 billed vs 10 effective -> 1 net override
    expect(screen.getByText("1 on manual override")).toBeTruthy();
  });

  it("renders the override summary with neutral overrides", async () => {
    renderView({
      stats: {
        ...stats(),
        forcedOverrideCount: 6,
        forcedUpgrades: 2,
        forcedDowngrades: 1,
      },
    });

    expect(await screen.findByText("Force Tier Overrides")).toBeTruthy();
    expect(screen.getByText("3 override keeps the same effective tier.")).toBeTruthy();
  });

  it("renders the attention panel with tenant links and all-clear rows", async () => {
    renderView();

    expect(await screen.findByText("Attention Needed")).toBeTruthy();
    expect(screen.getByText("Forced tier overrides")).toBeTruthy();
    expect(screen.getByText("FREE -> ENTERPRISE")).toBeTruthy();
    expect(
      screen.getByText("Cafe Nova").closest("a")?.getAttribute("href"),
    ).toBe("/super-admin/tenants/t-1");
    expect(screen.getByText("Pizza Bar")).toBeTruthy();
    expect(screen.getAllByText("All clear").length).toBe(3);
  });

  it("refetches when the refresh button is clicked", async () => {
    renderView();
    await screen.findByText("Overview");

    await userEvent.click(screen.getByRole("button", { name: "Refresh" }));

    await waitFor(() =>
      expect(api.getSuperAdminStats).toHaveBeenCalledTimes(2),
    );
  });
});
