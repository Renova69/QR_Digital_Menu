import { describe, expect, it } from "vitest";
import {
  resolveCartChoiceName,
  resolveCartItemName,
} from "../cartTranslation";

describe("resolveCartItemName", () => {
  it("uses the requested live translation while a language-specific menu response is loading", () => {
    const cartItem = {
      id: "item-1",
      name: "Руска салата",
      itemTranslations: {
        fr: { name: "Salade russe" },
      },
    };
    const categories = [
      {
        items: [
          {
            id: "item-1",
            name: "Salade russe",
            translations: {
              es: { name: "Ensaladilla rusa" },
            },
          },
        ],
      },
    ];

    expect(resolveCartItemName(cartItem, categories, "es")).toBe(
      "Ensaladilla rusa",
    );
  });

  it("prefers the requested stored translation over a stale live name from the previous language", () => {
    const cartItem = {
      id: "item-1",
      name: "Руска салата",
      originalName: "Руска салата",
      itemTranslations: {
        es: { name: "Ensaladilla rusa" },
      },
    };
    const categories = [
      {
        items: [
          {
            id: "item-1",
            name: "Salade russe",
            translations: {
              fr: { name: "Salade russe" },
            },
          },
        ],
      },
    ];

    expect(resolveCartItemName(cartItem, categories, "es")).toBe(
      "Ensaladilla rusa",
    );
  });
});

describe("resolveCartChoiceName", () => {
  it("uses the stored option translation when the item's category has not loaded", () => {
    const selectedOption = {
      optionId: "option-1",
      choiceName: "Голяма",
      translations: {
        es: {
          choices: {
            "Голяма": "Grande",
          },
        },
      },
    };

    expect(
      resolveCartChoiceName("item-1", selectedOption, [{ items: null }], "es"),
    ).toBe("Grande");
  });
});
