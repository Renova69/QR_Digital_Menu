import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi, type Mock } from "vitest";
import { useMenuContext } from "../../context/MenuContext";
import type { Item } from "../../types";
import { EditItemForm } from "./EditItemForm";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, fallback?: string | { defaultValue?: string }): string =>
      typeof fallback === "string" ? fallback : (fallback?.defaultValue ?? key),
  }),
}));

vi.mock("../../context/MenuContext", () => ({
  useMenuContext: vi.fn(),
}));

vi.mock("../ui/toast", () => ({
  useToast: () => ({ showToast: vi.fn(), ToastComponent: null }),
}));

vi.mock("../ui/ImageUploadInput", () => ({
  ImageUploadInput: () => null,
}));

vi.mock("../ui/modal", () => ({
  Modal: ({ children }: { children: ReactNode }) => <>{children}</>,
}));

vi.mock("./UpsellContextSelector", () => ({
  UpsellContextSelector: () => null,
}));

vi.mock("./RewardPricingFields", () => ({
  RewardPricingFields: () => null,
}));

vi.mock("./TagPicker", () => ({
  TagPicker: () => null,
}));

describe("EditItemForm", () => {
  const updateItem = vi.fn().mockResolvedValue(undefined);
  const item: Item = {
    id: "item-1",
    name: "Soup",
    description: "Daily soup",
    price: 8,
    weight: "350 g",
    currency: "EUR",
    categoryId: "category-1",
  };

  beforeEach(() => {
    vi.clearAllMocks();
    (useMenuContext as Mock).mockReturnValue({
      updateItem,
      categories: [],
    });
  });

  it("sends null when an existing weight is cleared", async () => {
    render(<EditItemForm item={item} />);

    fireEvent.change(screen.getByPlaceholderText("e.g. 350 g"), {
      target: { value: "" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save Changes" }));

    await waitFor(() => {
      expect(updateItem).toHaveBeenCalledWith(
        item.id,
        expect.objectContaining({ weight: null }),
      );
    });
  });
});
