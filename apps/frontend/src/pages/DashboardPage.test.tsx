import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Restaurant } from "../services/restaurantService";
import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const router = vi.hoisted(() => ({
  searchParams: new URLSearchParams(),
  setSearchParams: vi.fn(),
}));
const auth = vi.hoisted(() => ({
  user: { id: "u1", name: "Owner Name", role: "OWNER", email: "owner@cafe.bg" },
  logout: vi.fn(),
  updateUser: vi.fn(),
}));
const orderCtx = vi.hoisted(() => ({ orders: [] as any[] }));
const assistanceCtx = vi.hoisted(() => ({ requests: [] as any[] }));
const feature = vi.hoisted(() => ({ useFeature: vi.fn() }));
const i18nState = vi.hoisted(() => ({
  language: "en",
  resolvedLanguage: "en",
  changeLanguage: vi.fn(),
}));
const libApi = vi.hoisted(() => ({ updateRestaurant: vi.fn() }));
const libMenu = vi.hoisted(() => ({
  buildMenuReturnUrl: vi.fn(),
  normalizeRestaurantId: vi.fn(),
}));
const langLib = vi.hoisted(() => ({ persistDashboardLanguage: vi.fn() }));
const toast = vi.hoisted(() => ({ showToast: vi.fn() }));

vi.mock("react-router-dom", () => ({
  useSearchParams: () => [router.searchParams, router.setSearchParams],
  Link: ({ to, children, ...rest }: any) => (
    <a href={to} {...rest}>
      {children}
    </a>
  ),
}));
vi.mock("../context/AuthContext", () => ({
  useAuth: () => ({
    user: auth.user,
    logout: auth.logout,
    updateUser: auth.updateUser,
  }),
}));
vi.mock("../context/OrderContext", () => ({
  useOrders: () => ({ orders: orderCtx.orders }),
}));
vi.mock("../context/AssistanceContext", () => ({
  useAssistance: () => ({ requests: assistanceCtx.requests }),
}));
vi.mock("../context/RestaurantContext", async () => {
  const React = await import("react");
  return {
    __esModule: true,
    default: React.createContext({}),
  };
});
vi.mock("../hooks/useFeature", () => ({
  useFeature: feature.useFeature,
}));
vi.mock("../lib/api", () => ({
  updateRestaurant: libApi.updateRestaurant,
}));
vi.mock("../lib/menuUrl", () => ({
  buildMenuReturnUrl: libMenu.buildMenuReturnUrl,
  normalizeRestaurantId: libMenu.normalizeRestaurantId,
}));
vi.mock("../lib/dashboardLanguage", () => ({
  persistDashboardLanguage: langLib.persistDashboardLanguage,
}));
vi.mock("../components/ui/toast", () => ({
  useToast: () => ({ showToast: toast.showToast, ToastComponent: null }),
}));
vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, fallback?: unknown, options?: Record<string, unknown>) => {
      if (typeof fallback === "string") {
        return fallback.replace(
          /\{\{(\w+)\}\}/g,
          (_m, name: string) => String(options?.[name] ?? `{{${name}}}`),
        );
      }
      if (
        fallback &&
        typeof fallback === "object" &&
        typeof (fallback as Record<string, unknown>).defaultValue === "string"
      ) {
        return ((fallback as Record<string, unknown>).defaultValue as string)
          .replace(/\{\{(\w+)\}\}/g, (_m, name: string) =>
            String((fallback as Record<string, unknown>)[name] ?? `{{${name}}}`),
          );
      }
      return key;
    },
    i18n: {
      language: i18nState.language,
      resolvedLanguage: i18nState.resolvedLanguage,
      changeLanguage: i18nState.changeLanguage,
    },
  }),
}));
vi.mock("./Dashboard/OrdersView", () => ({
  default: () => <div data-testid="view-orders" />,
}));
vi.mock("./Dashboard/AssistanceView", () => ({
  default: () => <div data-testid="view-assistance" />,
}));
vi.mock("../components/tables/TableView", () => ({
  default: () => <div data-testid="view-tables" />,
}));
vi.mock("../components/CreateRestaurantForm", () => ({
  default: () => <div data-testid="create-restaurant-form" />,
}));
vi.mock("./Dashboard/SummaryView", () => ({
  default: () => <div data-testid="view-summary" />,
}));
vi.mock("./Dashboard/AnalyticsView", () => ({
  default: () => <div data-testid="view-analytics" />,
}));
vi.mock("./Dashboard/SettingsView", () => ({
  default: () => <div data-testid="view-settings" />,
}));
vi.mock("./Dashboard/PaymentsView", () => ({
  default: () => <div data-testid="view-payments" />,
}));
vi.mock("./Dashboard/ReservationsView", () => ({
  default: () => <div data-testid="view-reservations" />,
}));
vi.mock("./Dashboard/HelpView", () => ({
  default: () => <div data-testid="view-help" />,
}));
vi.mock("../components/NotificationBell", () => ({
  default: () => <div data-testid="notification-bell" />,
}));
vi.mock("../components/PaymentToast", () => ({
  default: () => <div data-testid="payment-toast" />,
}));
vi.mock("../components/subscription/SubscriptionBanner", () => ({
  default: () => <div data-testid="subscription-banner" />,
}));
vi.mock("../components/subscription/UpgradeModal", () => ({
  default: ({ feature, onClose }: any) => (
    <div data-testid="upgrade-modal" data-feature={feature ?? ""}>
      <button type="button" data-testid="upgrade-close" onClick={onClose} />
    </div>
  ),
}));
vi.mock("../components/ui/ThemeToggle", () => ({
  ThemeToggle: () => <div data-testid="theme-toggle" />,
}));
vi.mock("../components/ErrorBoundary", () => ({
  default: ({ children }: any) => <>{children}</>,
}));
vi.mock("../components/dashboard/DashboardProfileModal", () => ({
  DashboardProfileModal: ({ open, user }: any) => (
    <div data-testid="profile-modal" data-open={String(!!open)} data-user={user?.id ?? ""} />
  ),
}));
vi.mock("../components/brand/RenovaBrand", () => ({
  RenovaBrand: () => <div data-testid="renova-brand" />,
}));

import RestaurantContext from "../context/RestaurantContext";
import DashboardPage from "./DashboardPage";

const DEFAULT_FLAGS: Record<string, boolean> = {
  "analytics:full": true,
  "orders:receive": true,
  "payments:stripe": true,
  "orders:call-waiter": true,
  pos: true,
  kds: true,
  "reservations:enabled": true,
};

function makeRestaurant(overrides: Record<string, unknown> = {}): Restaurant {
  return {
    id: "r1",
    name: "Cafe Nova",
    country: "BG",
    ownerId: "owner-1",
    slug: "cafe-nova",
    tier: "STARTER",
    paymentsEnabled: true,
    dashboardLanguage: undefined,
    ...overrides,
  };
}

function renderView(options: {
  loading?: boolean;
  error?: boolean;
  noRestaurants?: boolean;
  user?: unknown;
  activeRestaurant?: Restaurant | null;
  flags?: Record<string, boolean>;
  orders?: any[];
  requests?: any[];
  initialTab?: string;
} = {}) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const restaurant = options.activeRestaurant ?? makeRestaurant();
  const flags = { ...DEFAULT_FLAGS, ...(options.flags ?? {}) };
  feature.useFeature.mockImplementation((f: string) => flags[f] ?? false);
  const defaultUser = {
    id: "u1",
    name: "Owner Name",
    role: "OWNER",
    email: "owner@cafe.bg",
  };
  auth.user = (options.user !== undefined ? options.user : defaultUser) as any;
  orderCtx.orders = options.orders ?? [];
  assistanceCtx.requests = options.requests ?? [];
  router.searchParams = new URLSearchParams();
  if (options.initialTab) router.searchParams.set("tab", options.initialTab);
  router.setSearchParams.mockImplementation((updater: any) => {
    if (typeof updater === "function") updater(router.searchParams);
    else if (updater && typeof updater === "object") {
      for (const [k, v] of Object.entries(updater)) {
        if (v) router.searchParams.set(k, String(v));
        else router.searchParams.delete(k);
      }
    }
  });
  i18nState.language = "en";
  i18nState.resolvedLanguage = "en";
  libMenu.buildMenuReturnUrl.mockReturnValue("/menu/cafe-nova");
  libMenu.normalizeRestaurantId.mockReturnValue("r1");
  const utils = render(
    <QueryClientProvider client={client}>
      <RestaurantContext.Provider
        value={
          {
            activeRestaurant: options.noRestaurants ? null : restaurant,
            restaurants: options.noRestaurants ? [] : [restaurant],
            fetchRestaurants: vi.fn(),
            loading: options.loading ?? false,
            error: options.error ? new Error("down") : null,
            // Not exercised here, but supplied so the value is a real
            // RestaurantContextType rather than a cast that would hide a
            // genuine mismatch if the context gains a member.
            createRestaurant: vi.fn(),
            selectRestaurant: vi.fn(),
          }
        }
      >
        <DashboardPage />
      </RestaurantContext.Provider>
    </QueryClientProvider>,
  );
  return { client, ...utils };
}

beforeEach(() => {
  vi.clearAllMocks();
  i18nState.changeLanguage.mockResolvedValue(undefined);
  langLib.persistDashboardLanguage.mockResolvedValue(undefined);
  libApi.updateRestaurant.mockResolvedValue({});
});

describe("DashboardPage early states", () => {
  it("shows the skeleton while restaurants load", () => {
    const { container } = renderView({ loading: true });

    expect(container.querySelectorAll(".animate-pulse").length).toBeGreaterThanOrEqual(4);
  });

  it("shows the restaurants error", () => {
    renderView({ error: true });

    expect(screen.getByText("Error loading restaurants.")).toBeTruthy();
  });

  it("shows the create-restaurant form without restaurants", () => {
    renderView({ noRestaurants: true });

    expect(screen.getByTestId("create-restaurant-form")).toBeTruthy();
  });

  it("shows the login prompt without a user", () => {
    renderView({ user: null });

    expect(screen.getByText("common.pleaseLogin")).toBeTruthy();
  });
});

describe("DashboardPage navigation & header", () => {
  it("renders the sidebar, header greeting and view-menu link", async () => {
    renderView();

    expect(await screen.findByTestId("view-summary")).toBeTruthy();
    expect(screen.getByText(/Welcome back/)).toBeTruthy();
    expect(screen.getByText("Owner Name")).toBeTruthy();
    expect(
      screen.getByText(/Here's what's happening at/),
    ).toBeTruthy();
    const menuLinks = screen.getAllByRole("link", {
      name: /Preview Public Menu/,
    });
    expect(menuLinks[0].getAttribute("href")).toBe("/menu/cafe-nova");
    expect(libMenu.buildMenuReturnUrl).toHaveBeenCalledWith(
      "r1",
      null,
      null,
      "cafe-nova",
    );
    expect(
      screen.getAllByTestId("notification-bell").length,
    ).toBeGreaterThan(0);
  });

  it("selects a tab and writes it to the URL", async () => {
    renderView();

    await screen.findByTestId("view-summary");
    fireEvent.click(
      screen.getAllByRole("button", { name: /dashboard\.tabs\.tables/ })[0],
    );

    expect(router.searchParams.get("tab")).toBe("tables");
    expect(await screen.findByTestId("view-tables")).toBeTruthy();
  });

  it("restores the tab from the URL on mount", async () => {
    renderView({ initialTab: "orders" });

    expect(await screen.findByTestId("view-orders")).toBeTruthy();
    expect(screen.queryByTestId("view-summary")).toBeNull();
  });

  it("forces staff users onto an allowed tab", async () => {
    renderView({
      user: { id: "s1", name: "Staff", role: "STAFF", email: "s@c.bg" },
      initialTab: "settings",
    });

    expect(await screen.findByTestId("view-orders")).toBeTruthy();
    expect(screen.queryByTestId("view-settings")).toBeNull();
  });

  it("redirects an unentitled analytics URL to the summary", async () => {
    renderView({ initialTab: "analytics", flags: { "analytics:full": false } });

    expect(await screen.findByTestId("view-summary")).toBeTruthy();
    expect(screen.queryByTestId("view-analytics")).toBeNull();
  });
});

describe("DashboardPage locking & badges", () => {
  it("opens the upgrade modal for a locked payments tab", async () => {
    renderView({ flags: { "payments:stripe": false } });

    await screen.findByTestId("view-summary");
    fireEvent.click(
      screen.getByRole("button", { name: /dashboard\.tabs\.payments/ }),
    );

    expect(await screen.findByTestId("upgrade-modal")).toHaveAttribute(
      "data-feature",
      "payments:stripe",
    );
  });

  it("hides the payments tab when payments are disabled", async () => {
    renderView({
      activeRestaurant: makeRestaurant({ paymentsEnabled: false }),
    });

    await screen.findByTestId("view-summary");
    expect(
      screen.queryByRole("button", { name: /dashboard\.tabs\.payments/ }),
    ).toBeNull();
  });

  it("shows the orders badge capped at 9+", async () => {
    const orders = Array.from({ length: 12 }, (_, i) => ({
      id: `o${i}`,
      status: "NEW",
    }));
    renderView({ orders });

    await screen.findByTestId("view-summary");
    expect(screen.getAllByText("9+").length).toBeGreaterThan(0);
  });

  it("shows the assistance badge for unresolved requests", async () => {
    renderView({
      requests: [
        { id: "a1", isResolved: false },
        { id: "a2", isResolved: true },
      ],
    });

    await screen.findByTestId("view-summary");
    const assistanceButton = screen.getAllByRole("button", {
      name: /dashboard\.tabs\.assistance/,
    })[0];
    expect(assistanceButton.textContent).toContain("1");
  });
});

describe("DashboardPage plan card & language", () => {
  it("shows the Pro Plan card for non-enterprise tiers", async () => {
    renderView();

    expect(await screen.findByText("Pro Plan")).toBeTruthy();
    expect(screen.getByText("Unlock analytics, loyalty & more")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Upgrade Plan" })).toBeTruthy();
  });

  it("shows the Enterprise card for professional tenants", async () => {
    renderView({ activeRestaurant: makeRestaurant({ tier: "PROFESSIONAL" }) });

    expect(await screen.findByText("Enterprise Plan")).toBeTruthy();
  });

  it("hides the plan card for enterprise tenants", async () => {
    renderView({ activeRestaurant: makeRestaurant({ tier: "ENTERPRISE" }) });

    await screen.findByTestId("view-summary");
    expect(screen.queryByText("Pro Plan")).toBeNull();
    expect(screen.queryByText("Enterprise Plan")).toBeNull();
  });

  it("persists the dashboard language for owners", async () => {
    renderView({ activeRestaurant: makeRestaurant({ dashboardLanguage: "en" }) });

    fireEvent.change(await screen.findByRole("combobox"), {
      target: { value: "bg" },
    });

    await waitFor(() =>
      expect(langLib.persistDashboardLanguage).toHaveBeenCalledWith(
        expect.objectContaining({
          restaurantId: "r1",
          nextLanguage: "bg",
        }),
      ),
    );
  });

  it("only changes i18n for staff language switches", async () => {
    renderView({
      user: { id: "s1", name: "Staff", role: "STAFF", email: "s@c.bg" },
    });

    fireEvent.change(await screen.findByRole("combobox"), {
      target: { value: "ro" },
    });

    await waitFor(() =>
      expect(i18nState.changeLanguage).toHaveBeenCalledWith("ro"),
    );
    expect(langLib.persistDashboardLanguage).not.toHaveBeenCalled();
  });
});

describe("DashboardPage mobile more sheet", () => {
  it("opens the sheet and logs out", async () => {
    renderView();

    await screen.findByTestId("view-summary");
    await userEvent.click(screen.getByRole("button", { name: "More" }));

    const dialog = screen.getByRole("dialog");
    expect(dialog).toBeTruthy();
    expect(
      within(dialog).getByRole("button", { name: /dashboard\.tabs\.settings/ }),
    ).toBeTruthy();
    await userEvent.click(
      within(dialog).getByRole("button", { name: /Log out/i }),
    );

    expect(auth.logout).toHaveBeenCalledTimes(1);
  });

  it("opens the profile modal from the sheet", async () => {
    renderView();

    await screen.findByTestId("view-summary");
    await userEvent.click(screen.getByRole("button", { name: "More" }));
    const dialog = screen.getByRole("dialog");
    await userEvent.click(
      within(dialog).getByRole("button", { name: /Open profile/i }),
    );

    expect(
      screen.getByTestId("profile-modal").getAttribute("data-open"),
    ).toBe("true");
  });
});
