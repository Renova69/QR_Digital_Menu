import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const api = vi.hoisted(() => ({
  getSuperAdminTenant: vi.fn(),
  updateTenantTier: vi.fn(),
  updateTenantStatus: vi.fn(),
  deleteTenant: vi.fn(),
  restoreTenant: vi.fn(),
  deleteTenantStaff: vi.fn(),
  importMenuForTenant: vi.fn(),
  resetTenantOwnerPassword: vi.fn(),
  updateTenantPayments: vi.fn(),
  superAdminForceLogout: vi.fn(),
  superAdminRegenerateApiKey: vi.fn(),
  superAdminImpersonate: vi.fn(),
  superAdminGetSessions: vi.fn(),
  superAdminForceCloseSession: vi.fn(),
  superAdminGetLoyalty: vi.fn(),
  superAdminAdjustLoyalty: vi.fn(),
  superAdminClearLoyalty: vi.fn(),
}));
const router = vi.hoisted(() => ({ navigate: vi.fn() }));

vi.mock("react-router-dom", () => ({
  useParams: () => ({ id: "t-1" }),
  useNavigate: () => router.navigate,
}));
vi.mock("../../lib/api", () => ({
  getSuperAdminTenant: api.getSuperAdminTenant,
  updateTenantTier: api.updateTenantTier,
  updateTenantStatus: api.updateTenantStatus,
  deleteTenant: api.deleteTenant,
  restoreTenant: api.restoreTenant,
  deleteTenantStaff: api.deleteTenantStaff,
  importMenuForTenant: api.importMenuForTenant,
  resetTenantOwnerPassword: api.resetTenantOwnerPassword,
  updateTenantPayments: api.updateTenantPayments,
  superAdminForceLogout: api.superAdminForceLogout,
  superAdminRegenerateApiKey: api.superAdminRegenerateApiKey,
  superAdminImpersonate: api.superAdminImpersonate,
  superAdminGetSessions: api.superAdminGetSessions,
  superAdminForceCloseSession: api.superAdminForceCloseSession,
  superAdminGetLoyalty: api.superAdminGetLoyalty,
  superAdminAdjustLoyalty: api.superAdminAdjustLoyalty,
  superAdminClearLoyalty: api.superAdminClearLoyalty,
}));
vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, fallback?: unknown) =>
      typeof fallback === "string" ? fallback : key,
    i18n: { language: "en" },
  }),
}));

import TenantDetailPage from "./TenantDetailPage";

function makeTenant(overrides: Record<string, unknown> = {}) {
  return {
    id: "t-1",
    name: "Cafe Nova",
    owner: { name: "Ivan Petrov", email: "owner@cafe.bg" },
    tier: "PROFESSIONAL",
    forceTier: null,
    forceTierExpiresAt: null,
    isActive: true,
    orderCount: 12,
    paymentSummary: { totalPayments: 5, totalAmount: 123.45 },
    menuCategoryCount: 4,
    tableCount: 8,
    createdAt: "2026-01-01T00:00:00.000Z",
    tierUpdatedAt: "2026-02-01T00:00:00.000Z",
    paymentsEnabled: true,
    deletedAt: null,
    staffMembers: [],
    ...overrides,
  };
}

function renderView(options: { tenant?: unknown } = {}) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  if (options.tenant !== undefined) {
    api.getSuperAdminTenant.mockResolvedValue(options.tenant);
  }
  const utils = render(
    <QueryClientProvider client={client}>
      <TenantDetailPage />
    </QueryClientProvider>,
  );
  return { client, ...utils };
}

beforeEach(() => {
  vi.clearAllMocks();
  api.getSuperAdminTenant.mockResolvedValue(makeTenant());
  api.updateTenantTier.mockResolvedValue({});
  api.updateTenantStatus.mockResolvedValue({});
  api.deleteTenant.mockResolvedValue({});
  api.restoreTenant.mockResolvedValue({});
  api.deleteTenantStaff.mockResolvedValue({});
  api.importMenuForTenant.mockResolvedValue({});
  api.resetTenantOwnerPassword.mockResolvedValue({});
  api.updateTenantPayments.mockResolvedValue({});
  api.superAdminForceLogout.mockResolvedValue({});
  api.superAdminRegenerateApiKey.mockResolvedValue({ apiKey: "sk-live-abc" });
  api.superAdminImpersonate.mockResolvedValue({
    exchangeCode: "code-1",
    targetUser: { email: "owner@cafe.bg" },
  });
  api.superAdminGetSessions.mockResolvedValue({ data: [], meta: { total: 0 } });
  api.superAdminForceCloseSession.mockResolvedValue({});
  api.superAdminGetLoyalty.mockResolvedValue([]);
  api.superAdminAdjustLoyalty.mockResolvedValue({});
  api.superAdminClearLoyalty.mockResolvedValue({});
});

describe("TenantDetailPage rendering", () => {
  it("shows the loading skeleton while the query is pending", () => {
    api.getSuperAdminTenant.mockReturnValue(new Promise(() => {}));
    const { container } = renderView();

    expect(container.querySelectorAll(".animate-pulse").length).toBeGreaterThan(0);
  });

  it("shows the not-found state and navigates back", async () => {
    api.getSuperAdminTenant.mockRejectedValue(new Error("404"));
    renderView();

    expect(await screen.findByText("Tenant not found")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Back to Tenants" }));
    expect(router.navigate).toHaveBeenCalledWith("/super-admin/tenants");
  });

  it("renders the restaurant overview fields", async () => {
    renderView();

    expect(await screen.findByText("Cafe Nova")).toBeTruthy();
    expect(screen.getByText("Owner Name")).toBeTruthy();
    expect(screen.getByText("Ivan Petrov")).toBeTruthy();
    expect(
      screen.getByText("Owner Email").nextElementSibling?.textContent,
    ).toBe("owner@cafe.bg");
    expect(screen.getAllByText("Stripe Tier").length).toBe(2);
    expect(
      screen.getAllByText("Stripe Tier")[0].nextElementSibling?.textContent,
    ).toBe("PROFESSIONAL");
    expect(screen.getByText("Active")).toBeTruthy();
    expect(screen.getByText("Total Orders")).toBeTruthy();
    expect(screen.getByText("€123.45")).toBeTruthy();
    expect(screen.getByText("Menu Categories")).toBeTruthy();
    expect(screen.getByText("Tables")).toBeTruthy();
  });

  it("marks a forced tier as overridden", async () => {
    renderView({ tenant: makeTenant({ forceTier: "ENTERPRISE" }) });

    expect(await screen.findByText("overridden")).toBeTruthy();
    expect(screen.getAllByText("ENTERPRISE").length).toBe(3);
    expect(
      screen.getByRole("button", { name: "Change Override" }),
    ).toBeTruthy();
  });

  it("renders the deleted state with a restore section", async () => {
    renderView({
      tenant: makeTenant({ deletedAt: "2026-06-01T00:00:00.000Z", isActive: false }),
    });

    expect(await screen.findByText("Restore Restaurant")).toBeTruthy();
    expect(screen.getAllByText("Deleted").length).toBe(2);
    expect(screen.queryByText("Tier Management")).toBeNull();
  });
});

describe("TenantDetailPage tier management", () => {
  it("applies a tier override with CONFIRM", async () => {
    renderView();
    await screen.findByText("Cafe Nova");

    fireEvent.click(screen.getByRole("button", { name: "Override Tier" }));
    const applyButton = screen.getByRole("button", {
      name: "Apply Override",
    }) as HTMLButtonElement;
    expect(applyButton.disabled).toBe(true);

    fireEvent.change(screen.getByRole("combobox"), {
      target: { value: "STARTER" },
    });
    fireEvent.change(screen.getByPlaceholderText("CONFIRM"), {
      target: { value: "CONFIRM" },
    });
    await userEvent.click(
      screen.getByRole("button", { name: "Apply Override" }),
    );

    await waitFor(() =>
      expect(api.updateTenantTier).toHaveBeenCalledWith("t-1", "STARTER", null),
    );
  });

  it("passes the expiry days through to the tier mutation", async () => {
    renderView();
    await screen.findByText("Cafe Nova");

    fireEvent.click(screen.getByRole("button", { name: "Override Tier" }));
    fireEvent.change(screen.getByRole("combobox"), {
      target: { value: "FREE" },
    });
    fireEvent.change(screen.getByPlaceholderText("e.g. 30"), {
      target: { value: "30" },
    });
    fireEvent.change(screen.getByPlaceholderText("CONFIRM"), {
      target: { value: "CONFIRM" },
    });
    await userEvent.click(
      screen.getByRole("button", { name: "Apply Override" }),
    );

    await waitFor(() =>
      expect(api.updateTenantTier).toHaveBeenCalledWith("t-1", "FREE", 30),
    );
  });

  it("clears an existing override", async () => {
    renderView({ tenant: makeTenant({ forceTier: "ENTERPRISE" }) });
    await screen.findByText("Cafe Nova");

    fireEvent.click(screen.getByRole("button", { name: "Change Override" }));
    fireEvent.change(screen.getByPlaceholderText("CONFIRM"), {
      target: { value: "CONFIRM" },
    });
    await userEvent.click(
      screen.getByRole("button", {
        name: /Clear Override \(restore Stripe-driven tier\)/,
      }),
    );

    await waitFor(() =>
      expect(api.updateTenantTier).toHaveBeenCalledWith("t-1", null, undefined),
    );
  });
});

describe("TenantDetailPage status & deletion", () => {
  it("suspends an active tenant", async () => {
    renderView();
    await screen.findByText("Cafe Nova");

    fireEvent.click(screen.getByRole("button", { name: "Suspend Restaurant" }));
    fireEvent.change(screen.getByPlaceholderText("CONFIRM"), {
      target: { value: "CONFIRM" },
    });
    await userEvent.click(screen.getByRole("button", { name: "Yes, Suspend" }));

    await waitFor(() =>
      expect(api.updateTenantStatus).toHaveBeenCalledWith("t-1", false),
    );
  });

  it("reactivates a suspended tenant", async () => {
    renderView({ tenant: makeTenant({ isActive: false }) });
    await screen.findByText("Cafe Nova");

    fireEvent.click(
      screen.getByRole("button", { name: "Reactivate Restaurant" }),
    );
    fireEvent.change(screen.getByPlaceholderText("CONFIRM"), {
      target: { value: "CONFIRM" },
    });
    await userEvent.click(
      screen.getByRole("button", { name: "Yes, Reactivate" }),
    );

    await waitFor(() =>
      expect(api.updateTenantStatus).toHaveBeenCalledWith("t-1", true),
    );
  });

  it("soft-deletes the tenant", async () => {
    renderView();
    await screen.findByText("Cafe Nova");

    fireEvent.click(screen.getByRole("button", { name: "Delete Restaurant" }));
    fireEvent.change(screen.getByPlaceholderText("CONFIRM"), {
      target: { value: "CONFIRM" },
    });
    await userEvent.click(screen.getByRole("button", { name: "Yes, Delete" }));

    await waitFor(() => expect(api.deleteTenant).toHaveBeenCalledWith("t-1"));
  });

  it("restores a deleted tenant", async () => {
    renderView({
      tenant: makeTenant({ deletedAt: "2026-06-01T00:00:00.000Z", isActive: false }),
    });
    await screen.findByText("Cafe Nova");

    fireEvent.click(screen.getByRole("button", { name: "Restore Restaurant" }));
    fireEvent.change(screen.getByPlaceholderText("CONFIRM"), {
      target: { value: "CONFIRM" },
    });
    await userEvent.click(screen.getByRole("button", { name: "Yes, Restore" }));

    await waitFor(() => expect(api.restoreTenant).toHaveBeenCalledWith("t-1"));
  });
});

describe("TenantDetailPage payments toggle", () => {
  it("disables payments for a professional tenant", async () => {
    renderView();
    await screen.findByText("Payments enabled");

    fireEvent.click(screen.getByRole("button", { name: "Disable Payments" }));
    fireEvent.change(screen.getByPlaceholderText("CONFIRM"), {
      target: { value: "CONFIRM" },
    });
    await userEvent.click(screen.getByRole("button", { name: "Yes, Disable" }));

    await waitFor(() =>
      expect(api.updateTenantPayments).toHaveBeenCalledWith("t-1", false),
    );
  });

  it("hides the payments section for a free tenant without payments", async () => {
    renderView({ tenant: makeTenant({ tier: "FREE", paymentsEnabled: false }) });

    await screen.findByText("Cafe Nova");
    expect(screen.queryByText("Payments")).toBeNull();
  });
});

describe("TenantDetailPage menu import", () => {
  it("rejects invalid JSON with an inline error", async () => {
    renderView();
    await screen.findByRole("button", { name: "Import Menu" });

    fireEvent.change(screen.getByPlaceholderText(/categories/), {
      target: { value: "{not json" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Import Menu" }));

    expect(
      screen.getByText(
        "We couldn't read this menu file. Make sure it is valid JSON and try again.",
      ),
    ).toBeTruthy();
    expect(api.importMenuForTenant).not.toHaveBeenCalled();
  });

  it("normalizes the same decimal and variant JSON accepted by the owner importer", async () => {
    renderView();
    await screen.findByRole("button", { name: "Import Menu" });

    fireEvent.change(screen.getByPlaceholderText(/categories/), {
      target: {
        value: JSON.stringify({
          currency: "EUR",
          categories: [
            {
              name: "Mains",
              items: [
                {
                  name: "Soup",
                  price: "12,50",
                  variants: [{ name: "Large", price: "1,25" }],
                },
              ],
            },
          ],
        }),
      },
    });
    fireEvent.click(screen.getByRole("button", { name: "Import Menu" }));

    await waitFor(() =>
      expect(api.importMenuForTenant).toHaveBeenCalledWith(
        "t-1",
        expect.objectContaining({
          categories: [
            expect.objectContaining({
              name: "Mains",
              items: [
                expect.objectContaining({
                  name: "Soup",
                  price: 12.5,
                  currency: "EUR",
                  options: [
                    expect.objectContaining({
                      choices: [
                        expect.objectContaining({
                          name: "Large",
                          priceModifier: 1.25,
                        }),
                      ],
                    }),
                  ],
                }),
              ],
            }),
          ],
        }),
      ),
    );
  });

  it("rejects non-EUR JSON locally with a friendly message", async () => {
    renderView();
    await screen.findByRole("button", { name: "Import Menu" });

    fireEvent.change(screen.getByPlaceholderText(/categories/), {
      target: {
        value: JSON.stringify({
          currency: "BGN",
          categories: [{ name: "Mains", items: [] }],
        }),
      },
    });
    fireEvent.click(screen.getByRole("button", { name: "Import Menu" }));

    expect(screen.getByText("Only EUR prices can be imported.")).toBeTruthy();
    expect(api.importMenuForTenant).not.toHaveBeenCalled();
  });

  it("does not expose raw validator arrays when imported data is invalid", async () => {
    api.importMenuForTenant.mockRejectedValue({
      response: {
        data: {
          message: [
            "categories.0.items.0.price must not be less than 0",
            "categories.0.items.0.price must be a number conforming to the specified constraints",
          ],
        },
      },
    });
    renderView();
    await screen.findByRole("button", { name: "Import Menu" });

    fireEvent.change(screen.getByPlaceholderText(/categories/), {
      target: { value: '{"categories":[{"name":"Mains","items":[]}]}' },
    });
    fireEvent.click(screen.getByRole("button", { name: "Import Menu" }));

    expect(
      await screen.findByText(
        "Some menu data is invalid. Check item names, EUR prices, and options, then try again.",
      ),
    ).toBeTruthy();
    expect(screen.queryByText(/categories\.0\.items\.0\.price/)).toBeNull();
  });

  it("imports valid JSON and shows the success summary", async () => {
    api.importMenuForTenant.mockResolvedValue({ created: 2, updated: 1 });
    renderView();
    await screen.findByRole("button", { name: "Import Menu" });

    fireEvent.change(screen.getByPlaceholderText(/categories/), {
      target: { value: '{"categories":[{"name":"Starters","items":[]}]}' },
    });
    fireEvent.click(screen.getByRole("button", { name: "Import Menu" }));

    await waitFor(() =>
      expect(api.importMenuForTenant).toHaveBeenCalledWith("t-1", {
        categories: [{ name: "Starters", order: 1, items: [] }],
      }),
    );
    expect(await screen.findByText(/Import complete/)).toBeTruthy();
  });
});

describe("TenantDetailPage ops actions", () => {
  it("forces a tenant logout after confirmation", async () => {
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(true);
    renderView();
    await screen.findByRole("button", { name: "Force Logout" });

    fireEvent.click(screen.getByRole("button", { name: "Force Logout" }));

    expect(confirmSpy).toHaveBeenCalledWith(
      "Force logout the tenant owner from all active sessions?",
    );
    await waitFor(() =>
      expect(api.superAdminForceLogout).toHaveBeenCalledWith("t-1"),
    );
    expect(await screen.findByText("Sessions invalidated.")).toBeTruthy();
    confirmSpy.mockRestore();
  });

  it("regenerates the import API key and shows it once", async () => {
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(true);
    renderView();
    await screen.findByText("Regenerate Import API Key");

    fireEvent.click(screen.getByRole("button", { name: "Regenerate" }));

    await waitFor(() =>
      expect(api.superAdminRegenerateApiKey).toHaveBeenCalledWith("t-1"),
    );
    expect(await screen.findByText("sk-live-abc")).toBeTruthy();
    confirmSpy.mockRestore();
  });

  it("creates an impersonation link", async () => {
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(true);
    renderView();
    await screen.findByText("Impersonate Owner");

    fireEvent.click(screen.getByRole("button", { name: "Impersonate" }));

    await waitFor(() =>
      expect(api.superAdminImpersonate).toHaveBeenCalledWith("t-1"),
    );
    const link = (await screen.findByText("Open tenant session →")) as HTMLAnchorElement;
    expect(link.getAttribute("href")).toBe("/impersonate/code-1");
    confirmSpy.mockRestore();
  });
});

describe("TenantDetailPage sessions", () => {
  const sessions = () => ({
    data: [
      {
        id: "sess-1",
        tableId: "T-3",
        table: { name: "Table 3" },
        _count: { orders: 2 },
        status: "OPEN",
        createdAt: "2026-08-22T10:00:00.000Z",
      },
      {
        id: "sess-2",
        tableId: "T-4",
        table: null,
        _count: { orders: 1 },
        status: "CLOSED_NO_PAYMENT",
        createdAt: "2026-08-22T09:00:00.000Z",
      },
    ],
    meta: { total: 2 },
  });

  it("lists sessions and closes an open one", async () => {
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(true);
    api.superAdminGetSessions.mockResolvedValue(sessions());
    renderView();
    await screen.findByText("Table: Table 3");

    expect(screen.getByText(/2 orders · OPEN/)).toBeTruthy();
    expect(screen.getAllByRole("button", { name: "Close" }).length).toBe(1);

    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(confirmSpy).toHaveBeenCalledWith(
      "Force close this payment session? This cannot be undone.",
    );
    await waitFor(() =>
      expect(api.superAdminForceCloseSession).toHaveBeenCalledWith(
        "t-1",
        "sess-1",
      ),
    );
    confirmSpy.mockRestore();
  });

  it("shows the empty sessions message", async () => {
    renderView();
    expect(await screen.findByText("No open or paid sessions.")).toBeTruthy();
  });

  it("paginates sessions when more than 20 exist", async () => {
    api.superAdminGetSessions.mockResolvedValue({
      data: [],
      meta: { total: 25 },
    });
    renderView();
    await screen.findByText("Active Sessions (25)");

    const prev = screen.getByRole("button", { name: "← Prev" }) as HTMLButtonElement;
    const next = screen.getByRole("button", { name: "Next →" }) as HTMLButtonElement;
    expect(prev.disabled).toBe(true);
    expect(next.disabled).toBe(false);

    fireEvent.click(next);
    await waitFor(() =>
      expect(api.superAdminGetSessions).toHaveBeenLastCalledWith("t-1", 2),
    );
  });
});

describe("TenantDetailPage staff & loyalty", () => {
  it("deletes a staff member after CONFIRM", async () => {
    renderView({
      tenant: makeTenant({
        staffMembers: [
          { id: "staff-1", email: "waiter@cafe.bg", role: "WAITER" },
        ],
      }),
    });
    await screen.findByText("Staff Members (1)");
    expect(screen.getByText("waiter@cafe.bg")).toBeTruthy();

    fireEvent.click(screen.getByText("waiter@cafe.bg").closest("div.flex")!.querySelectorAll("button")[0]);
    expect(screen.getByText("Delete Staff Member?")).toBeTruthy();
    fireEvent.change(screen.getByPlaceholderText("CONFIRM"), {
      target: { value: "CONFIRM" },
    });
    await userEvent.click(screen.getByRole("button", { name: "Yes, Delete" }));

    await waitFor(() =>
      expect(api.deleteTenantStaff).toHaveBeenCalledWith("t-1", "staff-1"),
    );
  });

  it("adjusts a loyalty account with a note", async () => {
    api.superAdminGetLoyalty.mockResolvedValue([
      { id: "acc-1", points: 120, lifetimePoints: 340, user: { name: "Ivan", email: "ivan@x.bg" } },
    ]);
    renderView();
    await screen.findByText("Loyalty Accounts (1)");
    expect(screen.getByText("120 pts")).toBeTruthy();

    fireEvent.change(screen.getByPlaceholderText("±delta"), {
      target: { value: "50" },
    });
    fireEvent.change(screen.getByPlaceholderText("note (optional)"), {
      target: { value: "bonus" },
    });
    fireEvent.click(screen.getByRole("button", { name: /Adjust/ }));

    await waitFor(() =>
      expect(api.superAdminAdjustLoyalty).toHaveBeenCalledWith(
        "t-1",
        "acc-1",
        50,
        "bonus",
      ),
    );
  });

  it("ignores a non-numeric loyalty delta and clears points", async () => {
    api.superAdminGetLoyalty.mockResolvedValue([
      { id: "acc-1", points: 120, lifetimePoints: 340, user: { name: "Ivan", email: "ivan@x.bg" } },
    ]);
    renderView();
    await screen.findByText("Loyalty Accounts (1)");

    fireEvent.change(screen.getByPlaceholderText("±delta"), {
      target: { value: "abc" },
    });
    fireEvent.click(screen.getByRole("button", { name: /Adjust/ }));
    expect(api.superAdminAdjustLoyalty).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: /Clear/ }));
    await waitFor(() =>
      expect(api.superAdminClearLoyalty).toHaveBeenCalledWith("t-1", "acc-1"),
    );
  });
});

describe("TenantDetailPage reset owner password", () => {
  it("validates password strength and match before resetting", async () => {
    renderView();
    await screen.findByText("Cafe Nova");

    fireEvent.click(
      screen.getByRole("button", { name: "Reset Owner Password" }),
    );
    const newPw = screen.getByPlaceholderText("New password (min 8 characters)");
    const confirmPw = screen.getByPlaceholderText("Confirm new password");

    fireEvent.change(newPw, { target: { value: "weak" } });
    expect(
      screen.getByText("Min 8 chars with uppercase, lowercase, and a number"),
    ).toBeTruthy();

    fireEvent.change(newPw, { target: { value: "Abcd1234" } });
    fireEvent.change(confirmPw, { target: { value: "Abcd9999" } });
    expect(screen.getByText("Passwords do not match")).toBeTruthy();

    fireEvent.change(confirmPw, { target: { value: "Abcd1234" } });
    fireEvent.change(screen.getByPlaceholderText("CONFIRM"), {
      target: { value: "CONFIRM" },
    });
    await userEvent.click(
      screen.getByRole("button", { name: "Reset Password" }),
    );

    await waitFor(() =>
      expect(api.resetTenantOwnerPassword).toHaveBeenCalledWith(
        "t-1",
        "Abcd1234",
      ),
    );
  });
});
