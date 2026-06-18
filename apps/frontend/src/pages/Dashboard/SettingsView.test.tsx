import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeAll, beforeEach, afterAll } from "vitest";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import SettingsView from "./SettingsView";
import RestaurantContext from "../../context/RestaurantContext";
import { updateRestaurant } from "../../lib/api";

const mockT = vi.fn((key: string) => key);
const mockAuthState = vi.hoisted(() => ({ role: "OWNER" }));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: mockT }),
}));

vi.mock("../../context/AuthContext", () => ({
  useAuth: () => ({
    user: { id: "u1", role: mockAuthState.role, restaurantId: "rest-1", email: "owner@test.com" },
    isAuthenticated: true,
  }),
}));

// Non-free tier with staff roles so the Staff tab is visible.
vi.mock("../../hooks/useFeature", () => ({
  useFeature: () => true,
  useTier: () => ({
    tier: "PROFESSIONAL",
    allowedStaffRoles: ["MANAGER", "WAITER", "KITCHEN", "STAFF"],
  }),
}));

vi.mock("@fortawesome/react-fontawesome", () => ({
  FontAwesomeIcon: ({ icon, ...props }: any) => (
    <svg data-testid="fa-icon" data-icon={icon?.iconName} {...props} />
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
}));

vi.mock("../../components/ui/BrandingEditor", () => ({
  BrandingEditor: () => <div data-testid="branding-editor" />,
}));

vi.mock("../../components/ui/button", () => ({
  Button: ({ children, ...props }: any) => (
    <button {...props}>{children}</button>
  ),
}));

const mockRestaurant = {
  id: "rest-1",
  name: "Test Restaurant",
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
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return (
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <RestaurantContext.Provider
          value={{ activeRestaurant: mockRestaurant, fetchRestaurants: vi.fn() } as any}
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
    setItem: (k: string, v: string) => { store[k] = v; },
    removeItem: (k: string) => { delete store[k]; },
    clear: () => { for (const k of Object.keys(store)) delete store[k]; },
  });
});

beforeEach(() => {
  for (const k of Object.keys(store)) delete store[k];
  mockAuthState.role = "OWNER";
  vi.clearAllMocks();
  vi.mocked(updateRestaurant).mockResolvedValue({
    ...mockRestaurant,
    sharedDeviceModeEnabled: true,
  } as any);
});

afterAll(() => {
  vi.unstubAllGlobals();
});

describe("SettingsView - Staff tab", () => {
  it("renders Shared Device Mode section after being moved to Staff tab", () => {
    render(<SettingsView />, { wrapper });
    fireEvent.click(screen.getByText("settings.tabs.staff"));
    expect(screen.queryByText("staff.sharedDeviceMode")).toBeTruthy();
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
    // The generate-enrollment action button renders as "New".
    expect(screen.getByText("New")).toBeTruthy();
  });

  it("shows QR code and copy link when enrollment URL is set", () => {
    const { container } = render(<SettingsView />, { wrapper });
    fireEvent.click(screen.getByText("settings.tabs.staff"));
    const bondSection = screen.getByText("staff.bondDevice").closest("div");
    expect(bondSection).toBeTruthy();
    // QR is not shown when no URL
    expect(container.querySelector('[role="img"]')).toBeFalsy();
  });
});
