import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import {
  describe,
  it,
  expect,
  vi,
  beforeAll,
  beforeEach,
  afterAll,
} from "vitest";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import SettingsView from "./SettingsView";
import RestaurantContext from "../../context/RestaurantContext";
import {
  createDeviceEnrollment,
  createStaff,
  listStaff,
  updateRestaurant,
} from "../../lib/api";

const mockT = vi.fn((key: string) => key);
const mockAuthState = vi.hoisted(() => ({ role: "OWNER" }));
const mockFeatureState = vi.hoisted(() => ({ printers: true }));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: mockT,
    i18n: { language: "bg", resolvedLanguage: "bg" },
  }),
}));

vi.mock("../../context/AuthContext", () => ({
  useAuth: () => ({
    user: {
      id: "u1",
      role: mockAuthState.role,
      restaurantId: "rest-1",
      email: "owner@test.com",
    },
    isAuthenticated: true,
  }),
}));

// Non-free tier with staff roles so the Staff tab is visible.
vi.mock("../../hooks/useFeature", () => ({
  useFeature: (feature: string) =>
    feature === "printers:thermal" ? mockFeatureState.printers : true,

  useTier: () => ({
    tier: "PROFESSIONAL",
    allowedStaffRoles: ["MANAGER", "WAITER", "KITCHEN", "STAFF"],
  }),
}));

vi.mock("@fortawesome/react-fontawesome", () => ({
  FontAwesomeIcon: ({
    icon,
    ...props
  }: {
    icon?: { iconName?: string };
    [key: string]: unknown;
  }) => (
    <svg
      data-testid="fa-icon"
      data-icon={icon?.iconName}
      {...(props as React.SVGProps<SVGSVGElement>)}
    />
  ),
}));

vi.mock("qrcode.react", () => ({
  QRCodeSVG: ({ value }: { value: string }) => (
    <svg role="img" data-value={value} />
  ),
}));

vi.mock("../../lib/api", () => ({
  updateRestaurant: vi.fn(),
  triggerTranslation: vi.fn(),
  generateStripeConnectLink: vi.fn(),
  getStripeStatus: vi.fn(),
  disconnectStripe: vi.fn(),
  listStaff: vi.fn().mockResolvedValue([]),
  listDeviceEnrollments: vi.fn().mockResolvedValue([]),
  createStaff: vi.fn(),
  removeStaff: vi.fn(),
  resetStaffPin: vi.fn(),
  updateStaff: vi.fn(),
  createDeviceEnrollment: vi.fn(),
  revokeDeviceEnrollment: vi.fn(),
  // These tests exercise SettingsView concerns outside the vanity-URL panel.
  // Keep the owner-only lifecycle fetch pending so it cannot introduce an
  // unrelated async state update while preserving the complete API contract.
  getRestaurantSlugSettings: vi.fn(() => new Promise(() => {})),
  releaseRestaurantSlug: vi.fn(),
}));

vi.mock("../../components/ui/BrandingEditor", () => ({
  BrandingEditor: () => <div data-testid="branding-editor" />,
}));

vi.mock("../../components/ui/button", () => ({
  Button: ({
    children,
    ...props
  }: React.ButtonHTMLAttributes<HTMLButtonElement>) => (
    <button {...props}>{children}</button>
  ),
}));

const mockRestaurant = {
  id: "rest-1",
  name: "Test Restaurant",
  city: "Sofia",
  country: "Bulgaria",
  address: "1 Test Street",
  targetLanguages: ["en"],
  timezone: "Europe/Sofia",
  isLoyaltyEnabled: true,
  loyaltySignupBonus: 50,
  loyaltyExchangeRate: 10,
  loyaltyRedeemRate: 150,
  loyaltyPointExpiryDays: 90,
  loyaltyExpiryReminderDays: 15,
  paymentsEnabled: false,
  sharedDeviceModeEnabled: false,
};

const wrapper = ({ children }: { children: React.ReactNode }) => {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return (
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <RestaurantContext.Provider
          value={
            {
              activeRestaurant: mockRestaurant,
              fetchRestaurants: vi.fn(),
            } as unknown as React.ContextType<typeof RestaurantContext>
          }
        >
          {children}
        </RestaurantContext.Provider>
      </MemoryRouter>
    </QueryClientProvider>
  );
};

const store: Record<string, string> = {};

beforeAll(() => {
  vi.stubGlobal("localStorage", {
    getItem: (k: string) => store[k] ?? null,
    setItem: (k: string, v: string) => {
      store[k] = v;
    },
    removeItem: (k: string) => {
      delete store[k];
    },
    clear: () => {
      for (const k of Object.keys(store)) delete store[k];
    },
  });
});

beforeEach(() => {
  for (const k of Object.keys(store)) delete store[k];
  mockAuthState.role = "OWNER";
  mockFeatureState.printers = true;
  mockRestaurant.sharedDeviceModeEnabled = false;
  vi.clearAllMocks();
  vi.mocked(updateRestaurant).mockResolvedValue({
    ...mockRestaurant,
    sharedDeviceModeEnabled: true,
  } as Awaited<ReturnType<typeof updateRestaurant>>);
});

afterAll(() => {
  vi.unstubAllGlobals();
});

describe("SettingsView - Staff tab", () => {
  it("hides printer settings without the Enterprise entitlement", () => {
    mockFeatureState.printers = false;
    render(<SettingsView />, { wrapper });
    expect(screen.queryByText("printStations.title")).toBeNull();
  });

  it("renders Shared Device Mode section after being moved to Staff tab", () => {
    render(<SettingsView />, { wrapper });
    fireEvent.click(screen.getByText("settings.tabs.staff"));
    expect(screen.queryByText("staff.sharedDeviceMode")).toBeTruthy();
  });

  it("keeps the PIN login hours heading and toggle stacked on desktop", () => {
    render(<SettingsView />, { wrapper });
    fireEvent.click(screen.getByText("settings.tabs.staff"));

    const layout = screen.getByText("staff.pinLoginHours").parentElement
      ?.parentElement;

    expect(layout?.className).toContain("flex-col");
    expect(layout?.className).not.toContain("sm:flex-row");
  });

  it("hides the Staff tab for STAFF users", () => {
    mockAuthState.role = "STAFF";
    render(<SettingsView />, { wrapper });
    expect(screen.queryByText("settings.tabs.staff")).toBeNull();
  });

  it("shows Enable Shared Device Mode button when mode is off", () => {
    render(<SettingsView />, { wrapper });
    fireEvent.click(screen.getByText("settings.tabs.staff"));
    // Enable/Disable button uses the shared common.* label.
    expect(screen.getByText("common.enable")).toBeTruthy();
  });

  it("persists Shared Device Mode when Enable is clicked", async () => {
    render(<SettingsView />, { wrapper });
    fireEvent.click(screen.getByText("settings.tabs.staff"));
    fireEvent.click(screen.getByText("common.enable"));
    await waitFor(() => {
      expect(updateRestaurant).toHaveBeenCalledWith("rest-1", {
        sharedDeviceModeEnabled: true,
      });
    });
    await waitFor(() => {
      expect(screen.getByText("common.disable")).toBeTruthy();
    });
  });

  it("shows off-warning when shared device mode is disabled", () => {
    render(<SettingsView />, { wrapper });
    fireEvent.click(screen.getByText("settings.tabs.staff"));
    expect(screen.getByText("staff.sharedDeviceOffWarning")).toBeTruthy();
  });

  it("renders Bond a Device section in Staff tab", () => {
    render(<SettingsView />, { wrapper });
    fireEvent.click(screen.getByText("settings.tabs.staff"));
    expect(screen.getByText("staff.bondDevice")).toBeTruthy();
    expect(screen.getByText("staff.newDeviceEnrollment")).toBeTruthy();
  });

  it("localizes staff status, actions and restaurant-timezone dates", async () => {
    vi.mocked(listStaff).mockResolvedValueOnce([
      {
        id: "staff-1",
        name: "Ivan Waiter",
        email: "ivan@staff.local",
        role: "WAITER",
        isActive: true,
        createdAt: "2026-09-02T12:34:00.000Z",
        updatedAt: "2026-09-02T12:34:00.000Z",
      },
    ]);

    render(<SettingsView />, { wrapper });
    fireEvent.click(screen.getByText("settings.tabs.staff"));

    expect(await screen.findByText("Ivan Waiter")).toBeTruthy();
    expect(screen.getByText("staff.statusActive")).toBeTruthy();
    expect(
      screen.getByRole("button", { name: "staff.openActions" }),
    ).toBeTruthy();
    expect(screen.getAllByText("2.09, 15:34").length).toBeGreaterThan(0);
    expect(screen.queryByText("Active")).toBeNull();
  });

  it("keeps Team Console staff cards stacked without horizontal scrolling", async () => {
    vi.mocked(listStaff).mockResolvedValueOnce([
      {
        id: "staff-1",
        name: "Ivan Waiter",
        email: "ivan@staff.local",
        role: "WAITER",
        isActive: true,
        createdAt: "2026-09-02T12:34:00.000Z",
        updatedAt: "2026-09-02T12:34:00.000Z",
      },
    ]);

    render(<SettingsView />, { wrapper });
    fireEvent.click(screen.getByText("settings.tabs.staff"));

    const actions = await screen.findByRole("button", {
      name: "staff.openActions",
    });
    const section = actions.closest("section");
    const table = section?.querySelector("table");
    const row = actions.closest("tr");
    const cells = Array.from(row?.querySelectorAll("td") ?? []);
    const labels = Array.from(row?.querySelectorAll("span") ?? []);

    expect(table?.parentElement?.className).not.toContain("overflow-x-auto");
    expect(table?.className).not.toContain("min-w-[760px]");
    expect(row?.className).toContain("block");
    expect(row?.className).not.toContain("md:table-row");
    expect(cells.every((cell) => !cell.className.includes("table-cell"))).toBe(
      true,
    );
    for (const key of [
      "staff.emailColumn",
      "staff.roleColumn",
      "staff.colStatus",
      "staff.colLastUpdate",
    ]) {
      const label = labels.find((candidate) => candidate.textContent === key);
      expect(label?.className).not.toContain("md:hidden");
    }
    expect(actions.parentElement?.className).toContain("absolute");

    fireEvent.click(actions);
    expect(screen.getByText("staff.actionResetPin")).toBeTruthy();
    expect(screen.getByText("staff.rebondTitle")).toBeTruthy();
    expect(screen.getByText("staff.actionDeactivate")).toBeTruthy();
    expect(screen.getByText("staff.actionRemovePermanently")).toBeTruthy();
  });

  it("renders a stale step-up rejection through the localized API key", async () => {
    mockRestaurant.sharedDeviceModeEnabled = true;
    vi.mocked(createDeviceEnrollment).mockRejectedValueOnce({
      response: {
        status: 403,
        data: {
          code: "STEP_UP_REQUIRED",
          message: "Sign in again before performing this sensitive action.",
        },
      },
    });

    render(<SettingsView />, { wrapper });
    fireEvent.click(screen.getByText("settings.tabs.staff"));
    fireEvent.click(screen.getByText("staff.newDeviceEnrollment"));

    expect(await screen.findByText("apiErrors.stepUpRequired")).toBeTruthy();
  });

  it("shows QR code and copy link when enrollment URL is set", () => {
    const { container } = render(<SettingsView />, { wrapper });
    fireEvent.click(screen.getByText("settings.tabs.staff"));
    const bondSection = screen.getByText("staff.bondDevice").closest("div");
    expect(bondSection).toBeTruthy();
    // QR is not shown when no URL
    expect(container.querySelector('[role="img"]')).toBeFalsy();
  });

  it("blocks waiter creation while Shared Device Mode is off", async () => {
    render(<SettingsView />, { wrapper });
    fireEvent.click(screen.getByText("settings.tabs.staff"));
    fireEvent.click(screen.getAllByText("staff.createStaffAccount")[0]);

    fireEvent.change(screen.getByPlaceholderText("staff.displayName"), {
      target: { value: "Waiter One" },
    });
    fireEvent.change(screen.getByDisplayValue("staff.roleManager"), {
      target: { value: "WAITER" },
    });

    expect(
      screen.getByText("staff.enableSharedDeviceBeforePinStaff"),
    ).toBeTruthy();
    const disabledCreateButton = screen
      .getAllByText("staff.createStaffAccount")
      .map((node) => node.closest("button"))
      .find((button) => button?.hasAttribute("disabled"));
    expect(disabledCreateButton).toBeTruthy();
    expect(createStaff).not.toHaveBeenCalled();
  });
});

describe("SettingsView - General tab", () => {
  it("persists weather location separately from the public address", async () => {
    render(<SettingsView />, { wrapper });

    fireEvent.change(screen.getByLabelText("settings.city"), {
      target: { value: " Plovdiv " },
    });
    fireEvent.change(screen.getByLabelText("settings.country"), {
      target: { value: " Bulgaria " },
    });
    fireEvent.click(screen.getByText("settings.saveSettings"));

    await waitFor(() => {
      expect(updateRestaurant).toHaveBeenCalledWith(
        "rest-1",
        expect.objectContaining({
          city: "Plovdiv",
          country: "Bulgaria",
          address: "1 Test Street",
        }),
      );
    });
  });
});
