import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { TranslationOverrideModal } from "./TranslationOverrideModal";
import { getItemTranslations, updateItemTranslation } from "../../lib/api";

const i18nMock = vi.hoisted(() => ({
  translations: {} as Record<string, string>,
}));

vi.mock("react-i18next", () => {
  const t = (key: string, fallbackOrOptions?: unknown) => {
    const options =
      fallbackOrOptions && typeof fallbackOrOptions === "object"
        ? (fallbackOrOptions as Record<string, unknown>)
        : undefined;
    const fallback =
      typeof fallbackOrOptions === "string"
        ? fallbackOrOptions
        : typeof options?.defaultValue === "string"
          ? options.defaultValue
          : key;
    const template = i18nMock.translations[key] ?? fallback;

    return template.replace(/{{(\w+)}}/g, (_match, name: string) =>
      String(options?.[name] ?? `{{${name}}}`),
    );
  };

  return { useTranslation: () => ({ t }) };
});

vi.mock("../../lib/api", () => ({
  getItemTranslations: vi.fn(),
  updateItemTranslation: vi.fn(),
}));

const payload = {
  itemId: "item-1",
  sourceLang: "bg",
  source: {
    name: "\u0414\u0436\u0438\u043d Beefeater",
    description:
      "\u041b\u043e\u043d\u0434\u043e\u043d\u0441\u043a\u0438 \u0441\u0443\u0445 \u0434\u0436\u0438\u043d",
  },
  locales: [
    {
      locale: "en",
      name: {
        value: "\u0414\u0436\u0438\u043d Beefeater",
        status: "CURRENT",
        sourceChanged: false,
      },
      description: {
        value: "London dry gin",
        status: "CURRENT",
        sourceChanged: false,
      },
    },
    {
      locale: "de",
      name: {
        value: "Beefeater Gin",
        status: "MANUAL",
        sourceChanged: true,
      },
      description: {
        value: "Londoner Dry Gin",
        status: "CURRENT",
        sourceChanged: false,
      },
    },
  ],
};

beforeEach(() => {
  vi.clearAllMocks();
  i18nMock.translations = {};
  vi.mocked(getItemTranslations).mockResolvedValue(payload as never);
  vi.mocked(updateItemTranslation).mockResolvedValue(payload as never);
});

describe("TranslationOverrideModal", () => {
  it("shows the source name and one name input per target language", async () => {
    render(<TranslationOverrideModal itemId="item-1" onClose={() => {}} />);

    expect(await screen.findByDisplayValue("Джин Beefeater")).toBeTruthy();
    expect(screen.getByDisplayValue("Beefeater Gin")).toBeTruthy();
  });

  it("saves an edited value for the right locale", async () => {
    const user = userEvent.setup();
    render(<TranslationOverrideModal itemId="item-1" onClose={() => {}} />);

    const input = await screen.findByLabelText("en name");
    await user.clear(input);
    await user.type(input, "Beefeater Gin");
    await user.click(screen.getAllByText("Save")[0]);

    await waitFor(() =>
      expect(updateItemTranslation).toHaveBeenCalledWith(
        "item-1",
        "NAME",
        "en",
        "Beefeater Gin",
      ),
    );
  });

  it("warns when the Bulgarian text changed after an override was written", async () => {
    render(<TranslationOverrideModal itemId="item-1" onClose={() => {}} />);

    expect(
      await screen.findByText(/source text changed since you edited this/i),
    ).toBeTruthy();
  });

  it("clears an override by saving an empty value", async () => {
    const user = userEvent.setup();
    render(<TranslationOverrideModal itemId="item-1" onClose={() => {}} />);

    const input = await screen.findByLabelText("de name");
    await user.clear(input);
    await user.click(screen.getAllByText("Save")[1]);

    await waitFor(() =>
      expect(updateItemTranslation).toHaveBeenCalledWith(
        "item-1",
        "NAME",
        "de",
        null,
      ),
    );
  });

  it("keeps descriptions compact until the description editor is toggled on", async () => {
    const user = userEvent.setup();
    render(<TranslationOverrideModal itemId="item-1" onClose={() => {}} />);

    expect(
      await screen.findByDisplayValue("\u0414\u0436\u0438\u043d Beefeater"),
    ).toBeTruthy();
    expect(screen.queryByLabelText("en description")).toBeNull();

    await user.click(
      screen.getByRole("button", { name: /edit descriptions/i }),
    );

    const description = await screen.findByLabelText("en description");
    expect(description.tagName).toBe("TEXTAREA");
    await user.clear(description);
    await user.type(description, "Classic London dry gin");
    await user.click(screen.getAllByText("Save")[0]);

    await waitFor(() =>
      expect(updateItemTranslation).toHaveBeenCalledWith(
        "item-1",
        "DESCRIPTION",
        "en",
        "Classic London dry gin",
      ),
    );

    await user.click(screen.getByRole("button", { name: /edit names/i }));
    expect(screen.queryByLabelText("en description")).toBeNull();
    expect(await screen.findByLabelText("en name")).toBeTruthy();
  });

  it("localizes the description editor labels and actions", async () => {
    i18nMock.translations = {
      "menuAdmin.editTranslations": "Редактиране на преводите",
      "menuAdmin.editDescriptions": "Редактирай описанията",
      "menuAdmin.editNames": "Редактирай имената",
      "menuAdmin.save": "Запази",
      "menuAdmin.sourceName": "{{locale}} име:",
      "menuAdmin.sourceDescription": "{{locale}} описание:",
      "menuAdmin.translationNameInput": "{{locale}} име",
      "menuAdmin.translationDescriptionInput": "{{locale}} описание",
      "menuAdmin.manualOverride":
        "Вашият текст — няма да бъде заменен от автоматичния превод.",
      "menuAdmin.sourceChangedSinceOverride":
        "Изходният текст е променен след вашата редакция.",
      "common.close": "Затвори",
    };

    const user = userEvent.setup();
    render(<TranslationOverrideModal itemId="item-1" onClose={() => {}} />);

    expect(
      await screen.findByRole("heading", {
        name: "Редактиране на преводите",
      }),
    ).toBeTruthy();
    expect(
      screen.getByText(
        (_content, element) =>
          element?.tagName === "P" &&
          element.textContent === "BG име: Джин Beefeater",
      ),
    ).toBeTruthy();
    expect(screen.getByRole("button", { name: "Затвори" })).toBeTruthy();
    expect(
      screen.getByText(
        "Вашият текст — няма да бъде заменен от автоматичния превод.",
      ),
    ).toBeTruthy();
    expect(
      screen.getByText("Изходният текст е променен след вашата редакция."),
    ).toBeTruthy();

    await user.click(
      screen.getByRole("button", { name: "Редактирай описанията" }),
    );

    expect(
      screen.getByText(
        (_content, element) =>
          element?.tagName === "P" &&
          element.textContent === "BG описание: Лондонски сух джин",
      ),
    ).toBeTruthy();
    expect(screen.getByLabelText("en описание")).toBeTruthy();
    expect(
      screen.getByRole("button", { name: "Редактирай имената" }),
    ).toBeTruthy();
    expect(
      screen.getAllByRole("button", { name: "Запази" }).length,
    ).toBeGreaterThan(0);
  });

  it("portals the fixed dialog outside a scrolling menu container", async () => {
    const { container } = render(
      <div data-testid="menu-scroll-container">
        <TranslationOverrideModal itemId="item-1" onClose={() => {}} />
      </div>,
    );

    const input = await screen.findByLabelText("en name");
    const overlay = input.closest(".fixed");

    expect(overlay).not.toBeNull();
    expect(container.contains(overlay)).toBe(false);
  });
});
