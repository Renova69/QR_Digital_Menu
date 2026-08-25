import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const api = vi.hoisted(() => ({
  getHelpContent: vi.fn(),
}));

vi.mock("../../lib/api", () => ({
  getHelpContent: api.getHelpContent,
}));
vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (
      key: string,
      fallback?: unknown,
      options?: Record<string, unknown>,
    ) => {
      if (typeof fallback === "string") {
        return fallback.replace(
          /\{\{(\w+)\}\}/g,
          (_m, name: string) => String(options?.[name] ?? `{{${name}}}`),
        );
      }
      return key;
    },
    i18n: { resolvedLanguage: "en", language: "en" },
  }),
}));

import HelpView from "./HelpView";

function makeItem(overrides: Record<string, unknown> = {}) {
  return {
    id: "id-1",
    section: "dashboard",
    categoryKey: "getting-started",
    itemKey: "faq-1",
    locale: "en",
    title: "",
    body: "",
    sortOrder: 0,
    active: true,
    ...overrides,
  };
}

function itemsFixture() {
  return [
    makeItem({ id: "meta-gs", itemKey: "category-meta", title: "BookOpen", body: "Getting Started" }),
    makeItem({ id: "title-gs", itemKey: "guide-title", title: "First steps" }),
    makeItem({ id: "desc-gs", itemKey: "guide-desc", title: "", body: "Learn the basics" }),
    makeItem({ id: "step0-gs", itemKey: "guide-step-0", title: "", body: "Create a restaurant" }),
    makeItem({ id: "step1-gs", itemKey: "guide-step-1", title: "", body: "Add a table" }),
    makeItem({ id: "tip-gs", itemKey: "guide-tip", title: "", body: "Use QR codes on tables" }),
    makeItem({ id: "warn-gs", itemKey: "guide-warning", title: "", body: "Do not share staff PINs" }),
    makeItem({ id: "faq-gs", itemKey: "faq-refunds", title: "How do refunds work?", body: "Refunds go through Stripe." }),
    makeItem({ id: "meta-pay", categoryKey: "payments", itemKey: "category-meta", title: "CreditCard", body: "Stripe Payments" }),
    makeItem({ id: "faq-pay", categoryKey: "payments", itemKey: "faq-payouts", title: "How do payouts work?", body: "Payouts arrive weekly." }),
    makeItem({ id: "faq-hidden", categoryKey: "payments", itemKey: "faq-hidden", title: "Hidden FAQ", body: "x", active: false }),
  ];
}

function renderView(items: unknown[] = itemsFixture()) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  api.getHelpContent.mockResolvedValue(items);
  const utils = render(
    <QueryClientProvider client={client}>
      <HelpView />
    </QueryClientProvider>,
  );
  return { client, ...utils };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("HelpView rendering", () => {
  it("renders the header and the search input", async () => {
    renderView();

    expect(await screen.findByText("Help Center")).toBeTruthy();
    expect(
      screen.getByPlaceholderText("Search help guides and FAQs..."),
    ).toBeTruthy();
    expect(api.getHelpContent).toHaveBeenCalledWith("dashboard", "en");
  });

  it("renders the category sidebar from the backend order", async () => {
    renderView();

    expect(await screen.findByText("Getting Started")).toBeTruthy();
    expect(screen.getByText("Stripe Payments")).toBeTruthy();
    expect(
      screen.getByRole("button", { name: /Getting Started/ }).getAttribute(
        "aria-pressed",
      ),
    ).toBe("true");
  });

  it("renders the guide title, description, steps, tip and warning", async () => {
    renderView();

    expect(await screen.findByText("First steps")).toBeTruthy();
    expect(screen.getByText("Learn the basics")).toBeTruthy();
    expect(screen.getByText("Create a restaurant")).toBeTruthy();
    expect(screen.getByText("Add a table")).toBeTruthy();
    expect(screen.getByText("Tip")).toBeTruthy();
    expect(screen.getByText("Use QR codes on tables")).toBeTruthy();
    expect(screen.getByText("Important")).toBeTruthy();
    expect(screen.getByText("Do not share staff PINs")).toBeTruthy();
  });

  it("filters out inactive items", async () => {
    renderView();

    await screen.findByText("Getting Started");
    expect(screen.queryByText("Hidden FAQ")).toBeNull();
  });
});

describe("HelpView FAQ interactions", () => {
  it("expands and collapses an FAQ answer", async () => {
    renderView();

    const toggle = (await screen.findByRole("button", {
      name: /How do refunds work?/,
    })) as HTMLButtonElement;
    expect(toggle.getAttribute("aria-expanded")).toBe("false");
    expect(screen.queryByText("Refunds go through Stripe.")).toBeNull();

    fireEvent.click(toggle);
    expect(toggle.getAttribute("aria-expanded")).toBe("true");
    expect(screen.getByText("Refunds go through Stripe.")).toBeTruthy();

    fireEvent.click(toggle);
    expect(toggle.getAttribute("aria-expanded")).toBe("false");
    expect(screen.queryByText("Refunds go through Stripe.")).toBeNull();
  });

  it("switches categories and resets the search", async () => {
    renderView();

    await screen.findByText("First steps");
    fireEvent.click(screen.getByRole("button", { name: /Stripe Payments/ }));

    expect(screen.queryByText("First steps")).toBeNull();
    expect(screen.getByText("How do payouts work?")).toBeTruthy();
    expect(
      screen.getByRole("button", { name: /Stripe Payments/ }).getAttribute(
        "aria-pressed",
      ),
    ).toBe("true");
  });
});

describe("HelpView search", () => {
  it("filters FAQs and shows the result count while hiding the guide", async () => {
    renderView();

    fireEvent.change(
      await screen.findByPlaceholderText("Search help guides and FAQs..."),
      { target: { value: "refunds" } },
    );

    expect(screen.getByText('1 FAQs matching "refunds"')).toBeTruthy();
    expect(screen.getByText("Matching FAQs")).toBeTruthy();
    expect(screen.getByText("How do refunds work?")).toBeTruthy();
    expect(screen.queryByText("How do payouts work?")).toBeNull();
    expect(screen.queryByText("First steps")).toBeNull();
  });

  it("shows the empty message when nothing matches", async () => {
    renderView();

    fireEvent.change(
      await screen.findByPlaceholderText("Search help guides and FAQs..."),
      { target: { value: "zzzz" } },
    );

    expect(
      screen.getByText(
        "No FAQs matching your query. Try searching for other keywords.",
      ),
    ).toBeTruthy();
  });

  it("filters the category sidebar by matching content", async () => {
    renderView();

    fireEvent.change(
      await screen.findByPlaceholderText("Search help guides and FAQs..."),
      { target: { value: "payouts" } },
    );

    expect(screen.queryByText("Getting Started")).toBeNull();
    expect(screen.getByText("Stripe Payments")).toBeTruthy();
  });

  it("renders the no-content state for an empty backend", async () => {
    renderView([]);

    expect(
      await screen.findByText(
        "No FAQs matching your query. Try searching for other keywords.",
      ),
    ).toBeTruthy();
    expect(screen.getByText("Help Center")).toBeTruthy();
  });
});
