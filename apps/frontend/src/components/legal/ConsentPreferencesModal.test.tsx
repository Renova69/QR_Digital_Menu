import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import ConsentPreferencesModal from "./ConsentPreferencesModal";

const i18nMocks = vi.hoisted(() => ({
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
  useTranslation: () => ({ t: i18nMocks.t }),
}));

const consentMocks = vi.hoisted(() => ({
  categories: [] as Array<"analytics" | "marketing">,
  currentState: {} as Record<string, boolean>,
  isPreferencesOpen: false,
  closePreferences: vi.fn(),
  save: vi.fn(),
}));

vi.mock("../../context/ConsentContext", () => ({
  useConsent: () => consentMocks,
}));

describe("ConsentPreferencesModal", () => {
  beforeEach(() => {
    consentMocks.categories = [];
    consentMocks.currentState = {};
    consentMocks.isPreferencesOpen = false;
    consentMocks.closePreferences.mockClear();
    consentMocks.save.mockClear();
  });

  it("renders nothing visible when closed", () => {
    render(<ConsentPreferencesModal />);
    expect(screen.queryByText("gdpr.cookiePreferencesTitle")).toBeNull();
  });

  it("shows the Necessary row always-on, plus one row per available category", () => {
    consentMocks.categories = ["analytics", "marketing"];
    consentMocks.isPreferencesOpen = true;
    render(<ConsentPreferencesModal />);

    expect(screen.getByText("gdpr.categoryNecessary")).toBeTruthy();
    expect(screen.getByText("gdpr.categoryAnalytics")).toBeTruthy();
    expect(screen.getByText("gdpr.categoryMarketing")).toBeTruthy();
  });

  it("never shows a toggle for a category that isn't currently available", () => {
    consentMocks.categories = ["analytics"];
    consentMocks.isPreferencesOpen = true;
    render(<ConsentPreferencesModal />);

    expect(screen.getByText("gdpr.categoryAnalytics")).toBeTruthy();
    expect(screen.queryByText("gdpr.categoryMarketing")).toBeNull();
  });

  it("initializes toggles from currentState and saves the edited draft", () => {
    consentMocks.categories = ["analytics"];
    consentMocks.currentState = { analytics: false };
    consentMocks.isPreferencesOpen = true;
    render(<ConsentPreferencesModal />);

    const toggle = screen.getByRole("switch", {
      name: "gdpr.categoryAnalytics",
    });
    expect(toggle.getAttribute("aria-checked")).toBe("false");

    fireEvent.click(toggle);
    expect(toggle.getAttribute("aria-checked")).toBe("true");

    fireEvent.click(screen.getByText("gdpr.savePreferences"));
    expect(consentMocks.save).toHaveBeenCalledWith({ analytics: true });
  });
});
