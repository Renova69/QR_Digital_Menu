import { describe, expect, it } from "vitest";
import { computeInsights } from "./insights";

describe("computeInsights", () => {
  it("uses every observed status as the cancellation denominator", () => {
    const insights = computeInsights({
      totalOrders: 8,
      totalRevenue: 160,
      revenueTrend: [],
      topItems: [],
      peakHours: [],
      ordersByTable: [],
      ordersByStatus: [
        { status: "COMPLETED", count: 8 },
        { status: "CANCELED", count: 2 },
      ],
    });

    expect(insights?.cancelRate).toBe(20);
  });

  it("calculates menu share against item sales rather than discounted order totals", () => {
    const insights = computeInsights({
      totalOrders: 2,
      totalRevenue: 80,
      revenueTrend: [],
      topItems: [
        { name: "Main", quantity: 1, revenue: 50 },
        { name: "Drink", quantity: 1, revenue: 30 },
      ],
      categoryBreakdown: [{ category: "All", revenue: 100 }],
      peakHours: [],
      ordersByTable: [],
      ordersByStatus: [],
    });

    expect(insights?.itemRevenueTotal).toBe(100);
    expect(insights?.topThreeShare).toBe(80);
    expect(insights?.topItemShare).toBe(50);
  });

  it("falls back to totalRevenue for menu share when categoryBreakdown is absent (Bug 2b)", () => {
    const insights = computeInsights({
      totalOrders: 2,
      totalRevenue: 80,
      revenueTrend: [],
      topItems: [
        { name: "Main", quantity: 1, revenue: 40 },
        { name: "Drink", quantity: 1, revenue: 20 },
      ],
      // categoryBreakdown omitted entirely — itemRevenueTotal would be 0
      // and previously produced a false "0.0%" share despite real sales.
      peakHours: [],
      ordersByTable: [],
      ordersByStatus: [],
    });

    expect(insights?.itemRevenueTotal).toBe(0);
    expect(insights?.topThreeShare).toBeGreaterThan(0);
    expect(insights?.topItemShare).toBeGreaterThan(0);
  });
});
