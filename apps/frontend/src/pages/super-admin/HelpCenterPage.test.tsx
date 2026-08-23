import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, within, waitFor, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const api = vi.hoisted(() => ({
  getAdminHelpContent: vi.fn(),
  createHelpContent: vi.fn(),
  updateHelpContent: vi.fn(),
  deleteHelpContent: vi.fn(),
  reorderHelpContent: vi.fn(),
}));
const dnd = vi.hoisted(() => ({ lastOnDragEnd: null as any }));

vi.mock("../../lib/api", () => ({
  getAdminHelpContent: api.getAdminHelpContent,
  createHelpContent: api.createHelpContent,
  updateHelpContent: api.updateHelpContent,
  deleteHelpContent: api.deleteHelpContent,
  reorderHelpContent: api.reorderHelpContent,
}));
vi.mock("@dnd-kit/core", () => ({
  DndContext: (props: any) => {
    dnd.lastOnDragEnd = props.onDragEnd;
    return props.children;
  },
  closestCenter: () => null,
}));
vi.mock("@dnd-kit/sortable", () => ({
  SortableContext: (props: any) => props.children,
  verticalListSortingStrategy: () => null,
  useSortable: () => ({
    attributes: {},
    listeners: {},
    setNodeRef: () => {},
    setActivatorNodeRef: () => {},
    transform: null,
    transition: undefined,
    isDragging: false,
  }),
  arrayMove: (arr: any[], from: number, to: number) => {
    const copy = arr.slice();
    const [moved] = copy.splice(from, 1);
    copy.splice(to, 0, moved);
    return copy;
  },
}));
vi.mock("@dnd-kit/utilities", () => ({
  CSS: { Transform: { toString: () => "" } },
}));
vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, fallback?: unknown) =>
      typeof fallback === "string" ? fallback : key,
    i18n: { language: "en" },
  }),
}));

import HelpCenterPage from "./HelpCenterPage";

function makeItem(overrides: Record<string, unknown> = {}) {
  return {
    id: "id-1",
    section: "landing",
    categoryKey: "general",
    itemKey: "faq-1",
    locale: "en",
    title: "Question?",
    body: "Answer.",
    sortOrder: 0,
    active: true,
    ...overrides,
  };
}

const landingItems = () => [
  makeItem({ id: "a-en", itemKey: "faq-a", locale: "en", title: "What is QR menu?", body: "Digital menu.", sortOrder: 0 }),
  makeItem({ id: "a-bg", itemKey: "faq-a", locale: "bg", title: "Kakvo e QR menu?", body: "", sortOrder: 0 }),
  makeItem({ id: "b-en", itemKey: "faq-b", locale: "en", title: "How to pay?", body: "Card or cash.", sortOrder: 1 }),
];

const dashboardItems = () => [
  makeItem({ id: "meta-en", section: "dashboard", categoryKey: "privacy", itemKey: "category-meta", locale: "en", title: "BookOpen", body: "Privacy & GDPR", sortOrder: 0 }),
  makeItem({ id: "title-en", section: "dashboard", categoryKey: "privacy", itemKey: "guide-title", locale: "en", title: "GDPR Compliance", body: "", sortOrder: 0 }),
  makeItem({ id: "step0-en", section: "dashboard", categoryKey: "privacy", itemKey: "guide-step-0", locale: "en", title: "", body: "Do step one", sortOrder: 0 }),
  makeItem({ id: "faq-p1-en", section: "dashboard", categoryKey: "privacy", itemKey: "faq-p1", locale: "en", title: "Privacy Q?", body: "Answer", sortOrder: 0 }),
];

function renderView(options: { landing?: unknown[]; dashboard?: unknown[] } = {}) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  api.getAdminHelpContent.mockImplementation((tab: string) => {
    if (tab === "landing") return Promise.resolve(options.landing ?? landingItems());
    return Promise.resolve(options.dashboard ?? dashboardItems());
  });
  const utils = render(
    <QueryClientProvider client={client}>
      <HelpCenterPage />
    </QueryClientProvider>,
  );
  return { client, ...utils };
}

beforeEach(() => {
  vi.clearAllMocks();
  dnd.lastOnDragEnd = null;
  api.getAdminHelpContent.mockResolvedValue([]);
  api.createHelpContent.mockResolvedValue({});
  api.updateHelpContent.mockResolvedValue({});
  api.deleteHelpContent.mockResolvedValue({});
  api.reorderHelpContent.mockResolvedValue({});
});

describe("HelpCenterPage rendering", () => {
  it("shows the loading state while the query is pending", () => {
    api.getAdminHelpContent.mockReturnValue(new Promise(() => {}));
    renderView();

    expect(screen.getByText("Loading...")).toBeTruthy();
  });

  it("renders the landing FAQ list with titles, bodies, locale badges and count", async () => {
    renderView();

    expect(await screen.findByText("What is QR menu?")).toBeTruthy();
    expect(screen.getByText("Digital menu.")).toBeTruthy();
    expect(screen.getByText("2 items")).toBeTruthy();
    expect(screen.getAllByText("EN").length).toBe(2);
    expect(screen.getByText("BG")).toBeTruthy();
    expect(
      screen.getByRole("button", { name: /Add Item/ }),
    ).toBeTruthy();
  });

  it("switches to the dashboard tab and renders categories", async () => {
    renderView();

    fireEvent.click(await screen.findByRole("button", { name: "Dashboard Help" }));

    expect(await screen.findByText("Privacy & GDPR")).toBeTruthy();
    expect(screen.getByText("(privacy)")).toBeTruthy();
    expect(
      screen.getByRole("button", { name: /Add Category/ }),
    ).toBeTruthy();
    expect(api.getAdminHelpContent).toHaveBeenCalledWith("dashboard");
  });

  it("expands a category to show typed items and the add-item row", async () => {
    renderView();
    fireEvent.click(await screen.findByRole("button", { name: "Dashboard Help" }));
    await screen.findByText("Privacy & GDPR");

    fireEvent.click(screen.getByRole("button", { name: /Privacy & GDPR/ }));

    expect(screen.getByText("TITLE")).toBeTruthy();
    expect(screen.getByText("STEP 1")).toBeTruthy();
    expect(screen.getByText("FAQ")).toBeTruthy();
    expect(screen.getByText("+ Add help item")).toBeTruthy();
  });
});

describe("HelpCenterPage landing CRUD", () => {
  it("creates a new FAQ item from the Add Item dialog", async () => {
    renderView();
    await screen.findByText("What is QR menu?");

    fireEvent.click(screen.getByRole("button", { name: /Add Item/ }));
    expect(screen.getByText("Create FAQ Item")).toBeTruthy();

    fireEvent.change(
      screen.getByPlaceholderText("Question or section title"),
      { target: { value: "New question?" } },
    );
    fireEvent.change(screen.getByPlaceholderText("Answer or help content"), {
      target: { value: "New answer." },
    });
    await userEvent.click(
      screen.getByRole("button", { name: "Save All Languages" }),
    );

    await waitFor(() =>
      expect(api.createHelpContent).toHaveBeenCalledWith(
        expect.objectContaining({
          section: "landing",
          categoryKey: "general",
          locale: "en",
          title: "New question?",
          body: "New answer.",
        }),
      ),
    );
    expect(api.createHelpContent).toHaveBeenCalledTimes(1);
  });

  it("updates all existing locales when editing an item", async () => {
    renderView();
    const title = await screen.findByText("What is QR menu?");

    const row = title.closest<HTMLElement>("div[class*='justify-between']")!;
    fireEvent.click(within(row).getAllByRole("button")[1]);
    expect(screen.getByText("Edit Help Item")).toBeTruthy();
    expect(
      (screen.getByPlaceholderText("Question or section title") as HTMLInputElement).value,
    ).toBe("What is QR menu?");

    fireEvent.change(
      screen.getByPlaceholderText("Question or section title"),
      { target: { value: "Edited title" } },
    );
    await userEvent.click(
      screen.getByRole("button", { name: "Save All Languages" }),
    );

    await waitFor(() =>
      expect(api.updateHelpContent).toHaveBeenCalledWith("a-en", {
        title: "Edited title",
        body: "Digital menu.",
      }),
    );
    expect(api.updateHelpContent).toHaveBeenCalledWith("a-bg", {
      title: "Kakvo e QR menu?",
      body: "",
    });
  });

  it("creates a missing locale translation when filled in the edit dialog", async () => {
    renderView({ landing: [makeItem({ id: "only-en", itemKey: "faq-a", locale: "en", title: "What is QR menu?", body: "Digital menu.", sortOrder: 0 })] });
    const title = await screen.findByText("What is QR menu?");
    fireEvent.click(title.closest<HTMLElement>("div[class*='justify-between']")!.querySelectorAll("button")[1]);

    fireEvent.click(screen.getAllByRole("button", { name: "BG" }).at(-1)!);
    fireEvent.change(
      screen.getByPlaceholderText("Question or section title"),
      { target: { value: "BG title" } },
    );
    await userEvent.click(
      screen.getByRole("button", { name: "Save All Languages" }),
    );

    await waitFor(() =>
      expect(api.updateHelpContent).toHaveBeenCalledWith("only-en", {
        title: "What is QR menu?",
        body: "Digital menu.",
      }),
    );
    await waitFor(() =>
      expect(api.createHelpContent).toHaveBeenCalledWith(
        expect.objectContaining({
          itemKey: "faq-a",
          locale: "bg",
          title: "BG title",
        }),
      ),
    );
  });

  it("toggles the active flag for all translations of an item", async () => {
    renderView();
    const title = await screen.findByText("What is QR menu?");
    const row = title.closest<HTMLElement>("div[class*='justify-between']")!;

    fireEvent.click(within(row).getAllByRole("button")[0]);

    await waitFor(() =>
      expect(api.updateHelpContent).toHaveBeenCalledWith("a-en", {
        active: false,
      }),
    );
    expect(api.updateHelpContent).toHaveBeenCalledWith("a-bg", {
      active: false,
    });
  });

  it("skips delete when the confirm is dismissed", async () => {
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(false);
    renderView();
    const title = await screen.findByText("What is QR menu?");
    const row = title.closest<HTMLElement>("div[class*='justify-between']")!;

    fireEvent.click(within(row).getAllByRole("button")[2]);

    expect(confirmSpy).toHaveBeenCalledWith(
      'Delete "faq-a" and all its translations?',
    );
    expect(api.deleteHelpContent).not.toHaveBeenCalled();
    confirmSpy.mockRestore();
  });

  it("deletes every translation when confirmed", async () => {
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(true);
    renderView();
    const title = await screen.findByText("What is QR menu?");
    const row = title.closest<HTMLElement>("div[class*='justify-between']")!;

    fireEvent.click(within(row).getAllByRole("button")[2]);

    await waitFor(() => expect(api.deleteHelpContent).toHaveBeenCalledTimes(2));
    expect(api.deleteHelpContent).toHaveBeenCalledWith("a-en");
    expect(api.deleteHelpContent).toHaveBeenCalledWith("a-bg");
    confirmSpy.mockRestore();
  });

  it("reorders landing items via drag end and updates the cache optimistically", async () => {
    const { client } = renderView();
    await screen.findByText("What is QR menu?");
    const setDataSpy = vi.spyOn(client, "setQueryData");

    await act(async () => {
      dnd.lastOnDragEnd({ active: { id: "faq-a" }, over: { id: "faq-b" } });
    });

    await waitFor(() =>
      expect(api.reorderHelpContent).toHaveBeenCalledWith([
        { id: "b-en", sortOrder: 0 },
        { id: "a-en", sortOrder: 1 },
        { id: "a-bg", sortOrder: 1 },
      ]),
    );
    const call = setDataSpy.mock.calls.find(
      (c) => Array.isArray(c[0]) && c[0][1] === "landing",
    )!;
    const updater = call[1] as (old: any[] | undefined) => any[];
    const updated = updater(landingItems());
    expect(updated.find((i) => i.id === "a-en")?.sortOrder).toBe(1);
    expect(updated.find((i) => i.id === "b-en")?.sortOrder).toBe(0);
  });
});

describe("HelpCenterPage dashboard category CRUD", () => {
  it("creates a category with sanitized id, icon and guide title", async () => {
    renderView();
    fireEvent.click(await screen.findByRole("button", { name: "Dashboard Help" }));
    await screen.findByText("Privacy & GDPR");

    fireEvent.click(screen.getByRole("button", { name: /Add Category/ }));
    expect(screen.getByText("Create Dashboard Category")).toBeTruthy();

    fireEvent.change(screen.getByPlaceholderText("e.g. integrations"), {
      target: { value: "Privacy & GDPR" },
    });
    const createButton = screen.getByRole("button", {
      name: "Create Category",
    }) as HTMLButtonElement;
    expect(createButton.disabled).toBe(true);

    fireEvent.change(screen.getByPlaceholderText("e.g. GDPR Compliance"), {
      target: { value: "GDPR Guide" },
    });
    expect(
      (screen.getByRole("button", {
        name: "Create Category",
      }) as HTMLButtonElement).disabled,
    ).toBe(false);

    await userEvent.click(
      screen.getByRole("button", { name: "Create Category" }),
    );

    await waitFor(() =>
      expect(api.createHelpContent).toHaveBeenCalledWith(
        expect.objectContaining({
          section: "dashboard",
          categoryKey: "privacy---gdpr",
          itemKey: "category-meta",
          locale: "en",
          title: "BookOpen",
        }),
      ),
    );
    expect(api.createHelpContent).toHaveBeenCalledWith(
      expect.objectContaining({
        categoryKey: "privacy---gdpr",
        itemKey: "guide-title",
        title: "GDPR Guide",
      }),
    );
  });

  it("deletes a whole category after confirmation", async () => {
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(true);
    renderView();
    fireEvent.click(await screen.findByRole("button", { name: "Dashboard Help" }));
    await screen.findByText("Privacy & GDPR");

    const header = screen.getByText("Privacy & GDPR").closest<HTMLElement>("div.w-full.flex")!;
    fireEvent.click(within(header).getAllByRole("button")[2]);

    expect(confirmSpy).toHaveBeenCalledWith(
      'Delete category "privacy" and all 4 items?',
    );
    await waitFor(() =>
      expect(api.deleteHelpContent).toHaveBeenCalledTimes(4),
    );
    confirmSpy.mockRestore();
  });

  it("adds a guide step through the Add help item dialog", async () => {
    renderView();
    fireEvent.click(await screen.findByRole("button", { name: "Dashboard Help" }));
    await screen.findByText("Privacy & GDPR");
    fireEvent.click(screen.getByRole("button", { name: /Privacy & GDPR/ }));

    fireEvent.click(screen.getByText("+ Add help item"));
    expect(screen.getByText(/Add Item to/)).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: /Guide Step/ }));
    fireEvent.change(screen.getByPlaceholderText("What the user should do in this step..."), {
      target: { value: "Do the next step" },
    });
    const dialog = screen.getByText(/Add Item to/).closest<HTMLElement>("div.fixed")!;
    await userEvent.click(within(dialog).getByRole("button", { name: "Add Item" }));

    await waitFor(() =>
      expect(api.createHelpContent).toHaveBeenCalledWith(
        expect.objectContaining({
          section: "dashboard",
          categoryKey: "privacy",
          itemKey: "guide-step-1",
          locale: "en",
          body: "Do the next step",
        }),
      ),
    );
  });

  it("disables the Tip option when the category already has one", async () => {
    renderView({
      dashboard: [
        ...dashboardItems(),
        makeItem({ id: "tip-en", section: "dashboard", categoryKey: "privacy", itemKey: "guide-tip", locale: "en", title: "", body: "A tip", sortOrder: 0 }),
      ],
    });
    fireEvent.click(await screen.findByRole("button", { name: "Dashboard Help" }));
    await screen.findByText("Privacy & GDPR");
    fireEvent.click(screen.getByRole("button", { name: /Privacy & GDPR/ }));
    fireEvent.click(screen.getByText("+ Add help item"));

    expect(
      (screen.getByRole("button", { name: /Tip \(exists\)/ }) as HTMLButtonElement)
        .disabled,
    ).toBe(true);
  });

  it("saves category settings when the tab name changes", async () => {
    renderView();
    fireEvent.click(await screen.findByRole("button", { name: "Dashboard Help" }));
    await screen.findByText("Privacy & GDPR");

    fireEvent.click(screen.getByTitle("Category Settings"));
    expect(screen.getByText(/Settings for/)).toBeTruthy();
    expect(
      (screen.getByRole("button", { name: "Save Settings" }) as HTMLButtonElement)
        .disabled,
    ).toBe(true);

    fireEvent.change(screen.getByPlaceholderText("e.g. Privacy & GDPR"), {
      target: { value: "Privacy Policy" },
    });
    await userEvent.click(screen.getByRole("button", { name: "Save Settings" }));

    await waitFor(() =>
      expect(api.updateHelpContent).toHaveBeenCalledWith("meta-en", {
        title: "BookOpen",
        body: "Privacy Policy",
      }),
    );
    expect(api.updateHelpContent).toHaveBeenCalledWith("title-en", {
      title: "GDPR Compliance",
    });
  });

  it("surfaces the settings error message when saving fails", async () => {
    api.updateHelpContent.mockRejectedValue(new Error("boom"));
    renderView();
    fireEvent.click(await screen.findByRole("button", { name: "Dashboard Help" }));
    await screen.findByText("Privacy & GDPR");

    fireEvent.click(screen.getByTitle("Category Settings"));
    fireEvent.change(screen.getByPlaceholderText("e.g. Privacy & GDPR"), {
      target: { value: "Privacy Policy" },
    });
    await userEvent.click(screen.getByRole("button", { name: "Save Settings" }));

    expect(
      await screen.findByText("Failed to save settings. Please try again."),
    ).toBeTruthy();
  });
});
