import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import i18next from "i18next";
import { act, useState } from "react";
import { I18nextProvider, initReactI18next } from "react-i18next";
import { beforeEach, describe, expect, it, vi } from "vitest";
import bgTranslation from "../../locales/bg/translation.json";
import enTranslation from "../../locales/en/translation.json";
import roTranslation from "../../locales/ro/translation.json";
import { ItemList } from "./ItemList";

const { menuContext } = vi.hoisted(() => ({
  menuContext: {
    items: [
      {
        id: "available-item",
        name: "Available item",
        description: "Description",
        price: 10,
        currency: "BGN",
        categoryId: "category-1",
        isFeatured: false,
        isOutOfStock: false,
      },
      {
        id: "featured-item",
        name: "Featured item",
        description: "Description",
        price: 12,
        currency: "BGN",
        categoryId: "category-1",
        isFeatured: true,
        isOutOfStock: true,
      },
    ],
    isLoadingItems: false,
    selectedCategory: { id: "category-1" },
    deleteItem: vi.fn(),
    updateItem: vi.fn(),
    setItems: vi.fn(),
  },
}));
const initialItems = menuContext.items.map((item) => ({ ...item }));

type MockItem = (typeof menuContext.items)[number];
type ItemsUpdater = (old: MockItem[] | undefined) => MockItem[];

function useMockMenuContext() {
  const [items, setItems] = useState(menuContext.items);

  return {
    ...menuContext,
    items,
    setItems: (updater: ItemsUpdater) => {
      menuContext.setItems(updater);
      setItems((old) => updater(old));
    },
  };
}

vi.mock("../../context/MenuContext", () => ({
  useMenuContext: () => useMockMenuContext(),
}));

vi.mock("@dnd-kit/sortable", () => ({
  SortableContext: ({ children }: { children: unknown }) => children,
  verticalListSortingStrategy: {},
}));

vi.mock("../ui/SortableItem", () => ({
  SortableItem: ({ children }: { children: unknown }) => children,
}));

vi.mock("./ManageOptionsModal", () => ({ ManageOptionsModal: () => null }));
vi.mock("./TranslationOverrideModal", () => ({
  TranslationOverrideModal: () => null,
}));
vi.mock("./EditItemForm", () => ({
  EditItemForm: ({ trigger }: { trigger: unknown }) => trigger,
}));

async function renderItemList(language: "bg" | "en" | "ro") {
  const instance = i18next.createInstance();
  await instance.use(initReactI18next).init({
    lng: language,
    fallbackLng: "en",
    resources: {
      bg: { translation: bgTranslation },
      en: { translation: enTranslation },
      ro: { translation: roTranslation },
    },
    nsSeparator: false,
    interpolation: { escapeValue: false },
    react: { useSuspense: false },
  });

  render(
    <I18nextProvider i18n={instance}>
      <ItemList />
    </I18nextProvider>,
  );

  return instance;
}

function expectActionLabel(label: string, count = 1) {
  const buttons = screen.getAllByTitle(label);
  expect(buttons).toHaveLength(count);
  buttons.forEach((button) =>
    expect(button).toHaveAttribute("aria-label", label),
  );
}

beforeEach(() => {
  menuContext.items.splice(
    0,
    menuContext.items.length,
    ...initialItems.map((item) => ({ ...item })),
  );
  menuContext.updateItem.mockReset();
  menuContext.setItems.mockReset();
});

describe("ItemList action localization", () => {
  it("updates state-aware hover and accessible labels with the dashboard language", async () => {
    const instance = await renderItemList("bg");

    expectActionLabel("Редактиране на преводите", 2);
    expectActionLabel("Добавяне към препоръчани");
    expectActionLabel("Премахване от препоръчани");
    expectActionLabel("Маркиране като изчерпан (86)");
    expectActionLabel("Маркиране като наличен");
    expect(screen.getByText("Изчерпан")).toBeInTheDocument();

    await act(async () => {
      await instance.changeLanguage("ro");
    });

    await waitFor(() =>
      expect(screen.getAllByTitle("Editează traducerile")).toHaveLength(2),
    );
    expectActionLabel("Editează traducerile", 2);
    expectActionLabel("Adaugă la recomandate");
    expectActionLabel("Elimină din recomandate");
    expectActionLabel("Marchează ca indisponibil (86)");
    expectActionLabel("Marchează ca disponibil");
    expect(screen.getByText("Indisponibil")).toBeInTheDocument();
  });

  it("shows the pending stock state immediately and rolls it back on failure", async () => {
    const user = userEvent.setup();
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => {});
    let failUpdate: (() => void) | undefined;
    const pendingUpdate = new Promise<void>((_resolve, reject) => {
      failUpdate = () => reject(new Error("network failure"));
    });
    menuContext.items.splice(1);
    menuContext.updateItem.mockReturnValue(pendingUpdate);
    await renderItemList("en");

    await user.click(
      screen.getByRole("button", { name: "Mark out of stock (86)" }),
    );

    try {
      expect(
        screen.getByRole("button", { name: "Mark as available" }),
      ).toBeInTheDocument();

      failUpdate?.();
      await waitFor(() =>
        expect(
          screen.getByRole("button", { name: "Mark out of stock (86)" }),
        ).toBeInTheDocument(),
      );
    } finally {
      failUpdate?.();
      consoleError.mockRestore();
    }
  });
});
