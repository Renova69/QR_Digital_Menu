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
  sourceText: "Джин Beefeater",
  locales: [
    {
      locale: "en",
      value: "Джин Beefeater",
      status: "CURRENT",
      sourceChanged: false,
    },
    {
      locale: "de",
      value: "Beefeater Gin",
      status: "MANUAL",
      sourceChanged: true,
    },
  ],
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getItemTranslations).mockResolvedValue(payload as never);
  vi.mocked(updateItemTranslation).mockResolvedValue(payload as never);
});

describe("TranslationOverrideModal", () => {
  it("shows the source text and one input per target language", async () => {
    render(<TranslationOverrideModal itemId="item-1" onClose={() => {}} />);

    expect(await screen.findByDisplayValue("Джин Beefeater")).toBeTruthy();
    expect(screen.getByDisplayValue("Beefeater Gin")).toBeTruthy();
  });

  it("saves an edited value for the right locale", async () => {
    const user = userEvent.setup();
    render(<TranslationOverrideModal itemId="item-1" onClose={() => {}} />);

    const input = await screen.findByLabelText("en");
    await user.clear(input);
    await user.type(input, "Beefeater Gin");
    await user.click(screen.getAllByText("Save")[0]);

    await waitFor(() =>
      expect(updateItemTranslation).toHaveBeenCalledWith(
        "item-1",
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

    const input = await screen.findByLabelText("de");
    await user.clear(input);
    await user.click(screen.getAllByText("Save")[1]);

    await waitFor(() =>
      expect(updateItemTranslation).toHaveBeenCalledWith("item-1", "de", null),
    );
  });
});
