import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import CookieConsentBanner from "./CookieConsentBanner";

const i18nMocks = vi.hoisted(() => ({
  // Mirrors real i18next's two calling conventions — see PaymentModal.test.tsx.
  t: (
    key: string,
    fallbackOrOptions?: string | Record<string, unknown>,
    maybeOptions?: Record<string, unknown>,
  ) => {
    const isFallbackString = typeof fallbackOrOptions === "string";
    const template = isFallbackString
      ? fallbackOrOptions
      : ((fallbackOrOptions?.defaultValue as string | undefined) ?? key);
    const vars = (isFallbackString ? maybeOptions : fallbackOrOptions) ?? {};
    return template.replace(/\{\{\s*(\w+)\s*\}\}/g, (_match, varName) =>
      vars[varName] !== undefined ? String(vars[varName]) : "",
    );
  },
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: i18nMocks.t, i18n: { language: "en" } }),
}));

vi.mock("./ConsentPreferencesModal", () => ({
  default: () => null,
}));

let mockSettingsData: Record<string, unknown> | undefined;
vi.mock("@tanstack/react-query", () => ({
  useQuery: () => ({ data: mockSettingsData }),
}));

vi.mock("../../lib/api", () => ({
  getPublicLegalSettings: vi.fn(),
}));

const consentMocks = vi.hoisted(() => ({
  categories: [] as string[],
  isBannerVisible: false,
  accept: vi.fn(),
  reject: vi.fn(),
  openPreferences: vi.fn(),
}));

vi.mock("../../context/ConsentContext", () => ({
  useConsent: () => consentMocks,
}));

function renderBanner() {
  return render(
    <MemoryRouter>
      <CookieConsentBanner />
    </MemoryRouter>,
  );
}

describe("CookieConsentBanner", () => {
  beforeEach(() => {
    mockSettingsData = { cookieBannerText: { en: "We use cookies." } };
    consentMocks.categories = [];
    consentMocks.isBannerVisible = false;
    consentMocks.accept.mockClear();
    consentMocks.reject.mockClear();
    consentMocks.openPreferences.mockClear();
  });

  it("renders nothing when there are no optional categories on this page", () => {
    const { container } = renderBanner();
    expect(container).toBeEmptyDOMElement();
  });

  it("does not show the dialog when consent is already fresh, even with categories available", () => {
    consentMocks.categories = ["analytics"];
    consentMocks.isBannerVisible = false;
    renderBanner();
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("shows the banner text and controls when isBannerVisible is true", () => {
    consentMocks.categories = ["analytics"];
    consentMocks.isBannerVisible = true;
    renderBanner();

    expect(screen.getByRole("dialog")).toBeTruthy();
    expect(screen.getByText("We use cookies.")).toBeTruthy();
    expect(screen.getByText("gdpr.cookieBannerAccept")).toBeTruthy();
    expect(screen.getByText("gdpr.rejectAll")).toBeTruthy();
    expect(screen.getByText("gdpr.customize")).toBeTruthy();
  });

  it("calls accept/reject/openPreferences on the matching button click", () => {
    consentMocks.categories = ["analytics"];
    consentMocks.isBannerVisible = true;
    renderBanner();

    fireEvent.click(screen.getByText("gdpr.cookieBannerAccept"));
    expect(consentMocks.accept).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByText("gdpr.rejectAll"));
    expect(consentMocks.reject).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByText("gdpr.customize"));
    expect(consentMocks.openPreferences).toHaveBeenCalledTimes(1);
  });

  it("only shows the Cookie Policy link when cookiePolicyEnabled is true", () => {
    consentMocks.categories = ["analytics"];
    consentMocks.isBannerVisible = true;
    mockSettingsData = {
      cookieBannerText: { en: "We use cookies." },
      cookiePolicyEnabled: true,
    };
    renderBanner();

    expect(screen.getByText("gdpr.cookieBannerSettings")).toBeTruthy();
  });
});
