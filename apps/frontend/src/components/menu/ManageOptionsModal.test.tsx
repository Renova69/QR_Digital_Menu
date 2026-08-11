import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Item } from "../../types";
import { ManageOptionsModal } from "./ManageOptionsModal";

const i18nState = vi.hoisted(() => ({
  language: "bg",
  translations: {
    "auto.noOptionsConfiguredForThisItemYet":
      "Все още няма конфигурирани опции за този артикул.",
    "auto.optionName": "Име на опцията",
    "auto.type": "Тип",
    "auto.variationCustomerChoosesOne": "Вариация (клиентът избира една)",
    "auto.addOnCustomerCanChooseMultiple":
      "Добавка (клиентът може да избере няколко)",
    "auto.choices": "Избори",
    "auto.addChoice": "Добави избор",
    "auto.cancel": "Отказ",
    "menu.quickTemplates": "Бързи шаблони",
    "menu.size": "Размер",
    "menu.doneness": "Степен на изпичане",
    "menu.quantity": "Количество",
    "menu.createCustomOption": "Създай персонализирана опция",
    "menuAdmin.createNewOption": "Създай нова опция",
    "menuAdmin.saveOption": "Запази опцията",
    "menuAdmin.optionPreset.quantityName": "Количество",
    "menuAdmin.optionPreset.halfDozen": "Половин дузина",
    "menuAdmin.optionPreset.fullDozen": "Цяла дузина",
    "menuAdmin.optionPreset.sizeName": "Размер",
    "menuAdmin.optionPreset.sizeSmall": "Малък",
    "menuAdmin.optionPreset.sizeMedium": "Среден",
    "menuAdmin.optionPreset.sizeLarge": "Голям",
    "menuAdmin.optionPreset.donenessName": "Степен на изпичане",
    "menuAdmin.optionPreset.donenessRare": "Недопечено",
    "menuAdmin.optionPreset.donenessMediumRare": "Средно недопечено",
    "menuAdmin.optionPreset.donenessMedium": "Средно",
    "menuAdmin.optionPreset.donenessMediumWell": "Средно добре изпечено",
    "menuAdmin.optionPreset.donenessWellDone": "Добре изпечено",
  } as Record<string, string>,
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, fallback?: string) =>
      i18nState.translations[key] ?? fallback ?? key,
    i18n: {
      language: i18nState.language,
      resolvedLanguage: i18nState.language,
    },
  }),
}));

vi.mock("../ui/modal", () => ({
  Modal: ({
    open,
    children,
    contentClassName,
    dashboardUi,
  }: {
    open?: boolean;
    children: React.ReactNode;
    contentClassName?: string;
    dashboardUi?: boolean;
  }) =>
    open ? (
      <div
        role="dialog"
        className={`${dashboardUi ? "dashboard-ui" : ""} ${contentClassName ?? ""}`}
      >
        {children}
      </div>
    ) : null,
}));

vi.mock("../ui/button", () => ({
  Button: ({
    children,
    variant: _variant,
    size: _size,
    ...props
  }: React.ButtonHTMLAttributes<HTMLButtonElement> & {
    variant?: string;
    size?: string;
  }) => <button {...props}>{children}</button>,
}));

vi.mock("../ui/input", () => ({
  Input: (props: React.InputHTMLAttributes<HTMLInputElement>) => (
    <input {...props} />
  ),
}));

vi.mock("../../lib/api", () => ({
  default: {
    get: vi.fn(),
    post: vi.fn(),
    patch: vi.fn(),
    delete: vi.fn(),
  },
}));

describe("ManageOptionsModal mobile browser compatibility", () => {
  const originalCrypto = globalThis.crypto;

  afterEach(() => {
    i18nState.language = "bg";
    Object.defineProperty(globalThis, "crypto", {
      configurable: true,
      value: originalCrypto,
    });
  });

  it("opens when crypto exists without randomUUID", () => {
    Object.defineProperty(globalThis, "crypto", {
      configurable: true,
      value: {},
    });

    expect(() =>
      render(
        <ManageOptionsModal
          item={
            {
              id: "item-1",
              name: "Mobile item",
              options: [],
            } as unknown as Item
          }
          open
          onOpenChange={vi.fn()}
        />,
      ),
    ).not.toThrow();

    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });

  it("constrains the options shell to the mobile viewport", () => {
    render(
      <ManageOptionsModal
        item={
          {
            id: "item-1",
            name: "A very long mobile item name",
            options: [],
          } as unknown as Item
        }
        open
        onOpenChange={vi.fn()}
      />,
    );

    expect(screen.getByRole("dialog")).toHaveClass(
      "dashboard-ui",
      "max-h-[calc(100dvh-1rem)]",
      "overflow-hidden",
      "p-4",
    );
  });

  it("localizes the options editor chrome and quick-template values", () => {
    render(
      <ManageOptionsModal
        item={
          {
            id: "item-1",
            name: "Артикул",
            options: [],
          } as unknown as Item
        }
        open
        onOpenChange={vi.fn()}
      />,
    );

    expect(
      screen.getByText("Все още няма конфигурирани опции за този артикул."),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Количество" }));

    expect(screen.getByText("Име на опцията")).toBeInTheDocument();
    expect(screen.getByText("Тип")).toBeInTheDocument();
    expect(
      screen.getByRole("option", {
        name: "Вариация (клиентът избира една)",
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("option", {
        name: "Добавка (клиентът може да избере няколко)",
      }),
    ).toBeInTheDocument();
    expect(screen.getByText("Избори")).toBeInTheDocument();
    expect(screen.getByDisplayValue("Количество")).toBeInTheDocument();
    expect(screen.getByDisplayValue("Половин дузина")).toBeInTheDocument();
    expect(screen.getByDisplayValue("Цяла дузина")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /Добави избор/i }),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Отказ" })).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Запази опцията" }),
    ).toBeInTheDocument();
  });

  it.each([
    {
      button: "Размер",
      optionName: "Размер",
      choices: ["Малък", "Среден", "Голям"],
    },
    {
      button: "Степен на изпичане",
      optionName: "Степен на изпичане",
      choices: [
        "Недопечено",
        "Средно недопечено",
        "Средно",
        "Средно добре изпечено",
        "Добре изпечено",
      ],
    },
  ])(
    "localizes the $optionName quick template",
    ({ button, optionName, choices }) => {
      render(
        <ManageOptionsModal
          item={
            {
              id: "item-1",
              name: "Артикул",
              options: [],
            } as unknown as Item
          }
          open
          onOpenChange={vi.fn()}
        />,
      );

      fireEvent.click(screen.getByRole("button", { name: button }));

      expect(screen.getByDisplayValue(optionName)).toBeInTheDocument();
      choices.forEach((choice) =>
        expect(screen.getByDisplayValue(choice)).toBeInTheDocument(),
      );
    },
  );

  it("displays persisted option names and choices in the dashboard language", () => {
    render(
      <ManageOptionsModal
        item={
          {
            id: "item-1",
            name: "Артикул",
            options: [
              {
                id: "option-1",
                menuItemId: "item-1",
                name: "Steak Doneness",
                type: "VARIATION",
                choices: [{ name: "Rare", priceModifier: 0 }],
                translations: {
                  bg: {
                    name: "Степен на изпичане",
                    choices: { Rare: "Недопечено" },
                  },
                },
              },
            ],
          } as unknown as Item
        }
        open
        onOpenChange={vi.fn()}
      />,
    );

    expect(screen.getByText("Степен на изпичане")).toBeInTheDocument();
    expect(screen.getByText("Недопечено")).toBeInTheDocument();
    expect(screen.queryByText("Steak Doneness")).not.toBeInTheDocument();
    expect(screen.queryByText("Rare")).not.toBeInTheDocument();
  });
});
