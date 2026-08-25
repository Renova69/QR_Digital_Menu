import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, within, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const api = vi.hoisted(() => ({
  getAdminLegalSettings: vi.fn(),
  updateAdminLegalSettings: vi.fn(),
}));

vi.mock("../../lib/api", () => ({
  getAdminLegalSettings: api.getAdminLegalSettings,
  updateAdminLegalSettings: api.updateAdminLegalSettings,
}));
vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, fallback?: unknown) =>
      typeof fallback === "string" ? fallback : key,
    i18n: { language: "en" },
  }),
}));

import LegalSettingsPage from "./LegalSettingsPage";

class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}

beforeEach(() => {
  (globalThis as any).ResizeObserver = ResizeObserverStub;
  (window as any).ResizeObserver = ResizeObserverStub;
});

function legalData() {
  return {
    gdprEnabled: true,
    policyVersion: 2,
    cookieBannerEnabled: true,
    analyticsCookieEnabled: false,
    privacyPolicyEnabled: true,
    termsEnabled: true,
    dpaEnabled: false,
    refundPolicyEnabled: false,
    msaEnabled: false,
    cookiePolicyEnabled: true,
    erasureEndpointEnabled: true,
    dataExportEndpointEnabled: false,
    retentionCronEnabled: true,
    orderPiiRetentionYears: 7,
    verificationTokenTtlDays: 7,
    cookieBannerText: { en: "We use cookies.", bg: "", ro: "" },
    privacyPolicyContent: { en: "Privacy", bg: "", ro: "" },
    termsContent: { en: "Terms", bg: "", ro: "" },
    dpaContent: { en: "", bg: "", ro: "" },
    refundPolicyContent: { en: "", bg: "", ro: "" },
    msaContent: { en: "", bg: "", ro: "" },
    cookiePolicyContent: { en: "Cookie policy", bg: "", ro: "" },
    dataControllerName: "QR Menu Ltd",
    dataControllerEmail: "dpo@example.com",
    dataControllerAddress: "Sofia",
    announcementBannerEnabled: false,
    announcementBannerText: "",
    announcementBannerType: "info",
  };
}

function renderView(options: { data?: Record<string, unknown> } = {}) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  if (options.data !== undefined) {
    api.getAdminLegalSettings.mockResolvedValue(options.data);
  }
  const utils = render(
    <QueryClientProvider client={client}>
      <LegalSettingsPage />
    </QueryClientProvider>,
  );
  return { client, ...utils };
}

function switchFor(label: string): HTMLButtonElement {
  const row = screen.getByText(label).closest<HTMLElement>("div[class*='justify-between']")!;
  return within(row).getByRole("switch") as HTMLButtonElement;
}

beforeEach(() => {
  vi.clearAllMocks();
  api.getAdminLegalSettings.mockResolvedValue(legalData());
  api.updateAdminLegalSettings.mockResolvedValue({});
});

describe("LegalSettingsPage rendering", () => {
  it("shows the loading skeleton while the query is pending", () => {
    api.getAdminLegalSettings.mockReturnValue(new Promise(() => {}));
    const { container } = renderView();

    expect(container.querySelectorAll(".animate-pulse").length).toBeGreaterThanOrEqual(4);
  });

  it("renders the header, active master switch and policy version", async () => {
    renderView();

    expect(await screen.findByText("Legal & GDPR")).toBeTruthy();
    expect(screen.getByText("Master Switch")).toBeTruthy();
    expect(screen.getByText("Active")).toBeTruthy();
    expect(screen.getByText("Policy version: 2")).toBeTruthy();
    expect(screen.getByText("GDPR Enabled")).toBeTruthy();
  });

  it("defaults to disabled switches and no changes when settings are missing", async () => {
    renderView({ data: {} });

    expect(await screen.findByText("Master Switch")).toBeTruthy();
    expect(screen.queryByText("Active")).toBeNull();
    expect(screen.getByText("Policy version: 1")).toBeTruthy();
    expect(switchFor("Cookie Banner").disabled).toBe(true);
    expect(screen.getByText("No unsaved changes")).toBeTruthy();
    expect(
      (screen.getByRole("button", { name: "Save Settings" }) as HTMLButtonElement)
        .disabled,
    ).toBe(true);
  });

  it("renders all feature toggle labels", async () => {
    renderView();

    expect(await screen.findByText("Cookie Banner")).toBeTruthy();
    expect(screen.getByText("Platform Analytics Cookie")).toBeTruthy();
    expect(screen.getByText("Privacy Policy page (/privacy)")).toBeTruthy();
    expect(screen.getByText("Terms of Service page (/terms)")).toBeTruthy();
    expect(screen.getByText("Account Deletion endpoint (Art. 17)")).toBeTruthy();
    expect(screen.getByText("Data Export endpoint (Art. 20)")).toBeTruthy();
    expect(screen.getByText("Automated Retention Cleanup")).toBeTruthy();
  });
});

describe("LegalSettingsPage save flow", () => {
  it("submits only the changed keys and shows the success message", async () => {
    const { client } = renderView();
    const invalidateSpy = vi.spyOn(client, "invalidateQueries");
    await screen.findByText("Master Switch");

    const saveButton = screen.getByRole("button", {
      name: "Save Settings",
    }) as HTMLButtonElement;
    expect(saveButton.disabled).toBe(true);
    expect(screen.getByText("No unsaved changes")).toBeTruthy();

    fireEvent.click(switchFor("GDPR Enabled"));
    expect(saveButton.disabled).toBe(false);

    await userEvent.click(saveButton);

    await waitFor(() =>
      expect(api.updateAdminLegalSettings).toHaveBeenCalledWith(
        { gdprEnabled: false },
        expect.anything(),
      ),
    );
    expect(await screen.findByText("Settings saved successfully.")).toBeTruthy();
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: ["super-admin", "platform-settings"],
    });
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: ["public-legal-settings"],
    });
  });

  it("shows the failure message when saving fails", async () => {
    api.updateAdminLegalSettings.mockRejectedValue(new Error("boom"));
    renderView();
    await screen.findByText("Master Switch");

    fireEvent.click(switchFor("GDPR Enabled"));
    await userEvent.click(
      screen.getByRole("button", { name: "Save Settings" }),
    );

    expect(
      await screen.findByText("Failed to save settings. Please try again."),
    ).toBeTruthy();
  });

  it("sends a changed retention window as a number", async () => {
    renderView();
    await screen.findByText("Retention Windows");

    const yearsInput = screen.getByText(
      /Order PII retention/,
    ).nextElementSibling as HTMLInputElement;
    fireEvent.change(yearsInput, { target: { value: "5" } });
    await userEvent.click(
      screen.getByRole("button", { name: "Save Settings" }),
    );

    await waitFor(() =>
      expect(api.updateAdminLegalSettings).toHaveBeenCalledWith(
        { orderPiiRetentionYears: 5 },
        expect.anything(),
      ),
    );
  });

  it("edits a localized content editor for the BG locale", async () => {
    renderView();
    await screen.findByText("Cookie Banner Text");

    const editor = screen
      .getByText("Cookie Banner Text")
      .closest<HTMLElement>("div.space-y-2")!;
    fireEvent.click(within(editor).getByRole("button", { name: "BG" }));
    fireEvent.change(within(editor).getByRole("textbox"), {
      target: { value: "Използваме бисквитки." },
    });
    await userEvent.click(
      screen.getByRole("button", { name: "Save Settings" }),
    );

    await waitFor(() =>
      expect(api.updateAdminLegalSettings).toHaveBeenCalledWith(
        {
          cookieBannerText: {
            en: "We use cookies.",
            bg: "Използваме бисквитки.",
            ro: "",
          },
        },
        expect.anything(),
      ),
    );
  });

  it("updates the data controller email", async () => {
    renderView();
    await screen.findByText("Data Controller");

    fireEvent.change(
      screen.getByText("Controller Email").nextElementSibling as HTMLInputElement,
      { target: { value: "new-dpo@example.com" } },
    );
    await userEvent.click(
      screen.getByRole("button", { name: "Save Settings" }),
    );

    await waitFor(() =>
      expect(api.updateAdminLegalSettings).toHaveBeenCalledWith(
        { dataControllerEmail: "new-dpo@example.com" },
        expect.anything(),
      ),
    );
  });

  it("configures the announcement banner", async () => {
    renderView();
    await screen.findByText("Announcement Banner");

    fireEvent.click(switchFor("Enable Banner"));
    fireEvent.change(
      screen.getByPlaceholderText(
        "e.g. Scheduled maintenance tonight at 23:00 UTC",
      ),
      { target: { value: "Maintenance at 23:00" } },
    );
    fireEvent.change(screen.getByRole("combobox"), {
      target: { value: "maintenance" },
    });
    await userEvent.click(
      screen.getByRole("button", { name: "Save Settings" }),
    );

    await waitFor(() =>
      expect(api.updateAdminLegalSettings).toHaveBeenCalledWith(
        {
          announcementBannerEnabled: true,
          announcementBannerText: "Maintenance at 23:00",
          announcementBannerType: "maintenance",
        },
        expect.anything(),
      ),
    );
  });

  it("toggles an individual feature flag", async () => {
    renderView();
    await screen.findByText("Platform Analytics Cookie");

    fireEvent.click(switchFor("Platform Analytics Cookie"));
    await userEvent.click(
      screen.getByRole("button", { name: "Save Settings" }),
    );

    await waitFor(() =>
      expect(api.updateAdminLegalSettings).toHaveBeenCalledWith(
        { analyticsCookieEnabled: true },
        expect.anything(),
      ),
    );
  });

  it("disables feature switches when the master GDPR switch is off", async () => {
    renderView({ data: { ...legalData(), gdprEnabled: false } });

    expect(await screen.findByText("Master Switch")).toBeTruthy();
    expect(screen.queryByText("Active")).toBeNull();
    expect(switchFor("Cookie Banner").disabled).toBe(true);
    expect(switchFor("Account Deletion endpoint (Art. 17)").disabled).toBe(true);
  });
});
