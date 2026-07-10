import type { MenuTranslationMap } from "../types";

export interface CartItemTranslationSource {
  id: string;
  name: string;
  originalName?: string;
  itemTranslations?: MenuTranslationMap | null;
}

interface LiveMenuItem {
  id: string;
  name: string;
  translations?: MenuTranslationMap | null;
  options?: LiveMenuOption[];
}

interface LiveMenuOption {
  id: string;
  translations?: MenuTranslationMap | null;
}

export interface CartTranslationCategory {
  items?: LiveMenuItem[] | null;
}

export interface CartChoiceTranslationSource {
  optionId: string;
  choiceName: string;
  translations?: MenuTranslationMap | null;
}

export function resolveCartItemName(
  cartItem: CartItemTranslationSource,
  categories: CartTranslationCategory[] | undefined,
  lang: string,
): string {
  if (lang) {
    for (const category of categories ?? []) {
      const liveItem = category.items?.find((item) => item.id === cartItem.id);
      if (liveItem) {
        const liveTranslation = liveItem.translations?.[lang]?.name;
        if (liveTranslation) return liveTranslation;
        break;
      }
    }

    const storedName = cartItem.itemTranslations?.[lang]?.name;
    if (storedName) return storedName;
  }

  return cartItem.originalName ?? cartItem.name;
}

export function resolveCartChoiceName(
  cartItemId: string,
  selectedOption: CartChoiceTranslationSource,
  categories: CartTranslationCategory[] | undefined,
  lang: string,
): string {
  if (!lang) return selectedOption.choiceName;

  for (const category of categories ?? []) {
    const liveItem = category.items?.find((item) => item.id === cartItemId);
    if (!liveItem) continue;

    const option = liveItem.options?.find(
      (candidate) => candidate.id === selectedOption.optionId,
    );
    const liveName =
      option?.translations?.[lang]?.choices?.[selectedOption.choiceName];
    if (liveName) return liveName;

    // Menu item IDs are globally unique. Once its item is found, no later
    // category can contain a better option match; continue with cart fallback.
    break;
  }

  return (
    selectedOption.translations?.[lang]?.choices?.[selectedOption.choiceName] ??
    selectedOption.choiceName
  );
}
