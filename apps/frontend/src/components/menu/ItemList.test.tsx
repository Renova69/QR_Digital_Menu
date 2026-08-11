import { render, screen, waitFor } from "@testing-library/react";
import i18next from "i18next";
import { act } from "react";
import { I18nextProvider, initReactI18next } from "react-i18next";
import { describe, expect, it, vi } from "vitest";
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
  },
}));

vi.mock("../../context/MenuContext", () => ({
  useMenuContext: () => menuContext,
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

describe("ItemList action localization", () => {
  it("updates state-aware hover and accessible labels with the dashboard language", async () => {
    const instance = await renderItemList("bg");

    expectActionLabel("Редактиране на преводите", 2);
    expectActionLabel("Добавяне към препоръчани");
    expectActionLabel("Премахване от препоръчани");
    expectActionLabel("Маркиране като изчерпан (86)");
    expectActionLabel("Маркиране като наличен");

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
  });
});
