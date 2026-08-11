import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { TranslationOverrideModal } from "./TranslationOverrideModal";
import { getItemTranslations, updateItemTranslation } from "../../lib/api";

vi.mock("react-i18next", () => {
  const t = (_key: string, fallback?: unknown) =>
    typeof fallback === "string" ? fallback : _key;

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
});
