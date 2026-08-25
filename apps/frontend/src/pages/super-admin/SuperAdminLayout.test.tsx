import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const auth = vi.hoisted(() => ({
  user: { id: "u1", name: "Owner", email: "owner@example.com" },
  logout: vi.fn(),
}));

vi.mock("react-router-dom", () => ({
  NavLink: ({ to, children, className, style, onClick }: any) => {
    const isActive = false;
    const cls =
      typeof className === "function" ? className({ isActive }) : className;
    const st = typeof style === "function" ? style({ isActive }) : style;
    return (
      <a
        href={to}
        data-testid={`nav-${to}`}
        className={cls}
        style={st}
        onClick={onClick}
      >
        {children}
      </a>
    );
  },
  Outlet: () => <div data-testid="outlet" />,
}));
vi.mock("../../context/AuthContext", () => ({
  useAuth: () => ({ user: auth.user, logout: auth.logout }),
}));
vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, fallback?: unknown) =>
      typeof fallback === "string" ? fallback : key,
    i18n: { language: "en" },
  }),
}));

import SuperAdminLayout from "./SuperAdminLayout";

beforeEach(() => {
  vi.clearAllMocks();
  auth.user = { id: "u1", name: "Owner", email: "owner@example.com" };
});

describe("SuperAdminLayout sidebar", () => {
  it("renders all nav items with their routes", () => {
    render(<SuperAdminLayout />);

    expect(screen.getByTestId("nav-/super-admin")).toHaveTextContent("Overview");
    expect(screen.getByTestId("nav-/super-admin/tenants")).toHaveTextContent("Tenants");
    expect(screen.getByTestId("nav-/super-admin/revenue")).toHaveTextContent("Revenue");
    expect(screen.getByTestId("nav-/super-admin/data-requests")).toHaveTextContent("Data Requests");
    expect(screen.getByTestId("nav-/super-admin/legal")).toHaveTextContent("Legal & GDPR");
    expect(screen.getByTestId("nav-/super-admin/help")).toHaveTextContent("Help Center");
  });

  it("renders the user footer with the name initial", () => {
    render(<SuperAdminLayout />);

    expect(screen.getByText("Owner")).toBeTruthy();
    expect(screen.getByText("owner@example.com")).toBeTruthy();
    expect(screen.getByText("O")).toBeTruthy();
  });

  it("falls back to the email initial without a name", () => {
    auth.user = { id: "u1", name: undefined as any, email: "admin@example.com" };
    render(<SuperAdminLayout />);

    expect(screen.getByText("A")).toBeTruthy();
    expect(screen.getByText("admin@example.com")).toBeTruthy();
  });

  it("falls back to A without any user info", () => {
    auth.user = { id: "u1", name: undefined as any, email: undefined as any };
    render(<SuperAdminLayout />);

    expect(screen.getByText("A")).toBeTruthy();
  });

  it("logs out from the footer button", async () => {
    render(<SuperAdminLayout />);

    await userEvent.click(screen.getByRole("button", { name: /Sign out/ }));

    expect(auth.logout).toHaveBeenCalledTimes(1);
  });

  it("renders the routed outlet", () => {
    render(<SuperAdminLayout />);

    expect(screen.getByTestId("outlet")).toBeTruthy();
  });
});

describe("SuperAdminLayout mobile sidebar", () => {
  it("opens and closes the sidebar from the mobile topbar", async () => {
    render(<SuperAdminLayout />);

    const sidebarWrapper = screen
      .getByText("Overview")
      .closest("aside")!.parentElement!;
    expect(sidebarWrapper.className).toContain("-translate-x-full");

    await userEvent.click(
      screen.getByRole("button", { name: "Open sidebar" }),
    );
    expect(sidebarWrapper.className).toContain("translate-x-0");

    await userEvent.click(screen.getByRole("button", { name: "Close sidebar" }));
    expect(sidebarWrapper.className).toContain("-translate-x-full");
  });

  it("closes the sidebar via the overlay", async () => {
    render(<SuperAdminLayout />);

    await userEvent.click(
      screen.getByRole("button", { name: "Open sidebar" }),
    );
    const overlay = document.querySelector(".fixed.inset-0");
    expect(overlay).toBeTruthy();

    fireEvent.click(overlay!);

    const sidebarWrapper = screen
      .getByText("Overview")
      .closest("aside")!.parentElement!;
    expect(sidebarWrapper.className).toContain("-translate-x-full");
  });

  it("closes the sidebar when a nav link is clicked", async () => {
    render(<SuperAdminLayout />);

    await userEvent.click(
      screen.getByRole("button", { name: "Open sidebar" }),
    );
    fireEvent.click(screen.getByTestId("nav-/super-admin/tenants"));

    const sidebarWrapper = screen
      .getByText("Overview")
      .closest("aside")!.parentElement!;
    expect(sidebarWrapper.className).toContain("-translate-x-full");
  });
});
