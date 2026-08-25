import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const api = vi.hoisted(() => ({
  getPrintStations: vi.fn(),
  getPrintStationHealth: vi.fn(),
  reactivateAgentToken: vi.fn(),
  revokeAgentToken: vi.fn(),
  createPrintStation: vi.fn(),
  updatePrintStation: vi.fn(),
  deletePrintStation: vi.fn(),
  generateAgentToken: vi.fn(),
  updateReceiptTemplate: vi.fn(),
}));

vi.mock("../../lib/api", () => api);
vi.mock("../../context/RestaurantContext", () => ({
  useRestaurantContext: () => ({ activeRestaurant: { id: "rest-1" } }),
}));
vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, opts?: Record<string, unknown>) =>
      opts && "days" in opts ? `${key}:${opts.days}` : key,
  }),
}));
vi.mock("../../components/ui/toast", () => ({
  useToast: () => ({ showToast: vi.fn(), ToastComponent: null }),
}));
vi.mock("qrcode.react", () => ({ QRCodeSVG: () => <div /> }));

import PrintStationsView from "./PrintStationsView";

const token = (over: Record<string, unknown> = {}) => ({
  id: "tok-1",
  label: "Kitchen agent",
  lastSeenAt: "2026-08-01T00:00:00.000Z",
  createdAt: "2026-01-01T00:00:00.000Z",
  staleWarnedAt: null,
  quarantinedAt: null,
  stalenessEnforcedAt: null,
  quarantineEligibleAt: null,
  ...over,
});

const station = (tokens: unknown[]) => ({
  id: "st-1",
  name: "Kitchen",
  ipAddress: "10.0.0.5",
  port: 9100,
  isActive: true,
  agentTokens: tokens,
  _count: { printJobs: 0 },
});

function renderView() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <PrintStationsView />
    </QueryClientProvider>,
  );
}

describe("PrintStationsView credential states", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    api.getPrintStationHealth.mockResolvedValue([]);
  });

  it("shows no retirement state for a healthy agent", async () => {
    api.getPrintStations.mockResolvedValue([station([token()])]);

    renderView();

    await screen.findByText("Kitchen agent");
    expect(screen.queryByTestId("token-stale-tok-1")).toBeNull();
    expect(screen.queryByTestId("token-quarantined-tok-1")).toBeNull();
    expect(screen.queryByTestId("token-reactivate-tok-1")).toBeNull();
  });

  // Advisory only. A stale agent is still printing, so it must not be shown as
  // blocked and must not offer a recovery action it does not need.
  it("shows a stale agent as a warning with no Reactivate action", async () => {
    api.getPrintStations.mockResolvedValue([
      station([token({ staleWarnedAt: "2026-08-10T00:00:00.000Z" })]),
    ]);

    renderView();

    expect(await screen.findByTestId("token-stale-tok-1")).toBeTruthy();
    expect(screen.queryByTestId("token-reactivate-tok-1")).toBeNull();
  });

  // The countdown must come from the backend's combined rollout + inactivity
  // boundary, never from only one of those gates.
  it("counts down to the backend's quarantine eligibility date", async () => {
    const inTenDays = new Date(
      Date.now() + 10 * 24 * 60 * 60 * 1000,
    ).toISOString();
    api.getPrintStations.mockResolvedValue([
      station([
        token({
          staleWarnedAt: "2026-08-10T00:00:00.000Z",
          stalenessEnforcedAt: new Date(
            Date.now() - 24 * 60 * 60 * 1000,
          ).toISOString(),
          quarantineEligibleAt: inTenDays,
        }),
      ]),
    ]);

    renderView();

    const badge = await screen.findByTestId("token-stale-tok-1");
    expect(badge.textContent).toContain("printStations.staleWarningCountdown");
    expect(badge.textContent).toContain("10");
  });

  it("falls back to a plain warning when no enforcement date is recorded", async () => {
    api.getPrintStations.mockResolvedValue([
      station([
        token({
          staleWarnedAt: "2026-08-10T00:00:00.000Z",
          stalenessEnforcedAt: null,
        }),
      ]),
    ]);

    renderView();

    const badge = await screen.findByTestId("token-stale-tok-1");
    expect(badge.textContent).toBe("printStations.staleWarning");
  });

  it("shows a quarantined agent as blocked, with a Reactivate action", async () => {
    api.getPrintStations.mockResolvedValue([
      station([token({ quarantinedAt: "2026-08-20T00:00:00.000Z" })]),
    ]);

    renderView();

    expect(await screen.findByTestId("token-quarantined-tok-1")).toBeTruthy();
    expect(screen.getByTestId("token-reactivate-tok-1")).toBeTruthy();
  });

  it("reactivates and refetches on success", async () => {
    api.getPrintStations.mockResolvedValue([
      station([token({ quarantinedAt: "2026-08-20T00:00:00.000Z" })]),
    ]);
    api.reactivateAgentToken.mockResolvedValue({ success: true });

    renderView();

    fireEvent.click(await screen.findByTestId("token-reactivate-tok-1"));

    await waitFor(() =>
      expect(api.reactivateAgentToken).toHaveBeenCalledWith("rest-1", "tok-1"),
    );
    // Two calls: the initial load and the refetch triggered by invalidation.
    await waitFor(() =>
      expect(api.getPrintStations.mock.calls.length).toBeGreaterThan(1),
    );
  });

  // 409 TOKEN_NOT_QUARANTINED means this view was stale and the token is
  // already active -- the outcome the owner wanted. Refetch and let the row
  // correct itself rather than reporting a failure for a working printer.
  it("treats a 409 as a stale view and refetches instead of erroring", async () => {
    api.getPrintStations.mockResolvedValue([
      station([token({ quarantinedAt: "2026-08-20T00:00:00.000Z" })]),
    ]);
    api.reactivateAgentToken.mockRejectedValue({
      response: { status: 409, data: { message: "TOKEN_NOT_QUARANTINED" } },
    });

    renderView();

    fireEvent.click(await screen.findByTestId("token-reactivate-tok-1"));

    await waitFor(() =>
      expect(api.getPrintStations.mock.calls.length).toBeGreaterThan(1),
    );
  });
});
