import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import Header from "./Header";

vi.mock("../context/AuthContext", () => ({
  useAuth: () => ({ user: null, logout: vi.fn() }),
}));

vi.mock("../context/ThemeContext", () => ({
  useTheme: () => ({ theme: "light", toggleTheme: vi.fn() }),
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, fallback?: string) => fallback ?? key,
    i18n: { language: "en", changeLanguage: vi.fn() },
  }),
}));

function renderHeaderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Header />
    </MemoryRouter>,
  );
}

describe("Header", () => {
  // Every one of these guards hides the app chrome (nav/account UI) because
  // the surface underneath is a different, full-viewport experience —
  // customer-facing menu, dashboard, staff POS, or super-admin. A future
  // edit to this guard block that drops or reorders any one line must fail
  // this suite, not silently restore chrome over that surface.
  it.each([
    "/menu/public/rest-1",
    "/m/bistro-oranzh",
    "/dashboard",
    "/staff/pos",
    "/super-admin",
  ])("renders nothing at %s", (path) => {
    const { container } = renderHeaderAt(path);
    expect(container).toBeEmptyDOMElement();
  });

  it("renders the app chrome on an ordinary page", () => {
    renderHeaderAt("/pricing");
    expect(screen.getByLabelText("Renova home")).toBeInTheDocument();
  });

  // /msa is a real route ("/m" + "sa") that must NOT be swallowed by the
  // vanity-menu guard — regression coverage for VANITY_MENU_PATH requiring
  // a "/" immediately after "/m", not just a "/m" prefix.
  it("renders the app chrome on /msa, which only shares a prefix with the vanity route", () => {
    renderHeaderAt("/msa");
    expect(screen.getByLabelText("Renova home")).toBeInTheDocument();
  });
});
