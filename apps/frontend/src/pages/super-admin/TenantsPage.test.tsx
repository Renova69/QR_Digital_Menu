import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const api = vi.hoisted(() => ({
  getSuperAdminTenants: vi.fn(),
}));
const router = vi.hoisted(() => ({ navigate: vi.fn() }));

vi.mock("react-router-dom", () => ({
  useNavigate: () => router.navigate,
}));
vi.mock("../../lib/api", () => ({
  getSuperAdminTenants: api.getSuperAdminTenants,
}));
vi.mock("../../hooks/useDebouncedValue", () => ({
  useDebouncedValue: (value: string) => value,
}));
vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, fallback?: unknown) =>
      typeof fallback === "string" ? fallback : key,
    i18n: { language: "en" },
  }),
}));

import TenantsPage from "./TenantsPage";

function makeTenant(overrides: Record<string, unknown> = {}) {
  return {
    id: "t-1",
    name: "Cafe Nova",
    owner: { email: "o@c.bg" },
    tier: "PROFESSIONAL",
    forceTier: "ENTERPRISE",
    stripeOnboarded: true,
    stripeSubscriptionId: "sub_1",
    paymentsEnabled: true,
    isActive: true,
    deletedAt: null,
    createdAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

function renderView(options: { data?: unknown[]; total?: number } = {}) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  if (options.data !== undefined || options.total !== undefined) {
    api.getSuperAdminTenants.mockResolvedValue({
      data: options.data ?? [makeTenant(), makeTenant({ id: "t-2", name: "Pizza Bar", owner: { email: "p@c.bg" }, forceTier: null, tier: "FREE", stripeOnboarded: false, stripeSubscriptionId: null, paymentsEnabled: false })],
      meta: { total: options.total ?? 2, page: 1, limit: 20 },
    });
  }
  const utils = render(
    <QueryClientProvider client={client}>
      <TenantsPage />
    </QueryClientProvider>,
  );
  return { client, ...utils };
}

beforeEach(() => {
  vi.clearAllMocks();
  api.getSuperAdminTenants.mockResolvedValue({
    data: [makeTenant(), makeTenant({ id: "t-2", name: "Pizza Bar", owner: { email: "p@c.bg" }, forceTier: null, tier: "FREE", stripeOnboarded: false, stripeSubscriptionId: null, paymentsEnabled: false })],
    meta: { total: 2, page: 1, limit: 20 },
  });
  router.navigate.mockReset();
});

describe("TenantsPage rendering", () => {
  it("shows skeleton rows while loading", () => {
    api.getSuperAdminTenants.mockReturnValue(new Promise(() => {}));
    const { container } = renderView();

    expect(container.querySelectorAll(".animate-pulse").length).toBeGreaterThanOrEqual(6);
  });

  it("shows the error state", async () => {
    api.getSuperAdminTenants.mockRejectedValue(new Error("down"));
    renderView();

    expect(await screen.findByText("Failed to load tenants")).toBeTruthy();
  });

  it("renders the tenant table with tier, override, connect and status cells", async () => {
    renderView();

    expect(await screen.findByText("Cafe Nova")).toBeTruthy();
    expect(screen.getByText("Connected")).toBeTruthy();
    expect(screen.getByText("Enabled")).toBeTruthy();
    expect(screen.getByText("Pizza Bar")).toBeTruthy();
    expect(screen.getByText("None")).toBeTruthy();
    expect(screen.getByText("Disabled")).toBeTruthy();
  });

  it("navigates to the tenant detail on row click", async () => {
    renderView();

    fireEvent.click((await screen.findByText("Cafe Nova")).closest("tr")!);

    expect(router.navigate).toHaveBeenCalledWith("/super-admin/tenants/t-1");
  });

  it("shows the empty state and disables the CSV export", async () => {
    renderView({ data: [], total: 0 });

    expect(await screen.findByText("No tenants found")).toBeTruthy();
    expect(screen.getByText("Manage all platform restaurants")).toBeTruthy();
    expect(
      (screen.getByRole("button", { name: "Export CSV" }) as HTMLButtonElement)
        .disabled,
    ).toBe(true);
  });

  it("shows suspended and deleted status badges", async () => {
    renderView({
      data: [
        makeTenant({ id: "t-3", name: "Frozen Cafe", isActive: false }),
        makeTenant({ id: "t-4", name: "Gone Bar", deletedAt: "2026-06-01T00:00:00Z", isActive: false }),
      ],
      total: 2,
    });

    expect(await screen.findByText("Frozen Cafe")).toBeTruthy();
    expect(screen.getAllByText("Suspended").length).toBe(2);
    expect(screen.getAllByText("Deleted").length).toBe(2);
  });

  it("passes the tier filter to the query", async () => {
    renderView();
    await screen.findByText("Cafe Nova");

    const selects = screen.getAllByRole("combobox");
    fireEvent.change(selects[0], { target: { value: "STARTER" } });

    await waitFor(() => {
      const lastCall = api.getSuperAdminTenants.mock.calls.at(-1)!;
      expect(lastCall[0]).toMatchObject({ tier: "STARTER", page: 1 });
    });
  });

  it("passes the status and subscription filters to the query", async () => {
    renderView();
    await screen.findByText("Cafe Nova");

    const selects = screen.getAllByRole("combobox");
    fireEvent.change(selects[1], { target: { value: "suspended" } });
    fireEvent.change(selects[2], { target: { value: "active" } });

    await waitFor(() => {
      const lastCall = api.getSuperAdminTenants.mock.calls.at(-1)!;
      expect(lastCall[0]).toMatchObject({
        status: "suspended",
        subscription: "active",
      });
    });
  });

  it("passes the debounced search term to the query", async () => {
    renderView();
    await screen.findByText("Cafe Nova");

    fireEvent.change(
      screen.getByPlaceholderText("Search by name or email…"),
      { target: { value: "cafe" } },
    );

    await waitFor(() => {
      const lastCall = api.getSuperAdminTenants.mock.calls.at(-1)!;
      expect(lastCall[0]).toMatchObject({ search: "cafe", page: 1 });
    });
  });

  it("paginates and fetches the next page", async () => {
    renderView({ total: 45 });

    const prev = (await screen.findByRole("button", {
      name: "Previous",
    })) as HTMLButtonElement;
    expect(prev.disabled).toBe(true);
    expect(screen.getByText(/Page/)).toBeTruthy();

    await userEvent.click(screen.getByRole("button", { name: "Next" }));

    await waitFor(() => {
      const lastCall = api.getSuperAdminTenants.mock.calls.at(-1)!;
      expect(lastCall[0]).toMatchObject({ page: 2 });
    });
  });

  it("exports the visible tenants as CSV", async () => {
    const createObjectUrl = vi.fn(() => "blob:test");
    const revokeObjectUrl = vi.fn();
    Object.assign(URL, {
      createObjectURL: createObjectUrl,
      revokeObjectURL: revokeObjectUrl,
    });
    const clickSpy = vi
      .spyOn(HTMLAnchorElement.prototype, "click")
      .mockImplementation(() => {});
    renderView();
    await screen.findByText("Cafe Nova");

    await userEvent.click(screen.getByRole("button", { name: "Export CSV" }));

    expect(createObjectUrl).toHaveBeenCalledTimes(1);
    expect(clickSpy).toHaveBeenCalledTimes(1);
    expect(revokeObjectUrl).toHaveBeenCalledWith("blob:test");
    clickSpy.mockRestore();
  });
});
