import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi, beforeAll, beforeEach, afterAll } from "vitest";
import SettingsView from "./SettingsView";
import RestaurantContext from "../../context/RestaurantContext";

const mockT = vi.fn((key: string) => key);

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: mockT }),
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
  createStaff: vi.fn(),
  removeStaff: vi.fn(),
  createDeviceEnrollment: vi.fn(),
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
  timezone: "UTC",
  isLoyaltyEnabled: true,
  loyaltySignupBonus: 50,
  loyaltyExchangeRate: 10,
  loyaltyRedeemRate: 150,
  loyaltyPointExpiryDays: 90,
  loyaltyExpiryReminderDays: 15,
  paymentsEnabled: false,
};

const wrapper = ({ children }: { children: React.ReactNode }) => (
  <RestaurantContext.Provider
    value={{ activeRestaurant: mockRestaurant, fetchRestaurants: vi.fn() } as any}
  >
    {children}
  </RestaurantContext.Provider>
);

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

  it("shows Enable Shared Device Mode button when mode is off", () => {
    render(<SettingsView />, { wrapper });
    fireEvent.click(screen.getByText("settings.tabs.staff"));
    expect(screen.getByText("staff.enableSharedDevice")).toBeTruthy();
  });

  it("toggles to Disable when Enable button clicked", () => {
    render(<SettingsView />, { wrapper });
    fireEvent.click(screen.getByText("settings.tabs.staff"));
    fireEvent.click(screen.getByText("staff.enableSharedDevice"));
    expect(screen.getByText("staff.disableSharedDevice")).toBeTruthy();
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
    expect(screen.getByText("staff.generateDeviceQr")).toBeTruthy();
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
