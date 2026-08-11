import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { CategoryMix } from "./panels";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

describe("CategoryMix", () => {
  it("renders a visible color marker for the first category", () => {
    render(
      <CategoryMix
        categories={[
          {
            category: "Salads",
            categoryType: "CATEGORY",
            revenue: 100,
          },
        ]}
      />,
    );

    const marker = screen.getByText("Salads").previousElementSibling as
      | HTMLElement
      | null;

    expect(marker).not.toBeNull();
    expect(marker?.style.backgroundColor).not.toBe("");
    expect(marker?.style.backgroundColor).toBe("var(--color-primary)");
  });

  it("labels deleted-menu revenue separately from uncategorized revenue", () => {
    render(
      <CategoryMix
        categories={[
          {
            category: "",
            categoryType: "HISTORICAL_MENU",
            revenue: 30,
          },
          {
            category: "Salads",
            categoryType: "CATEGORY",
            revenue: 70,
          },
        ]}
      />,
    );

    expect(screen.getByText("analytics.historicalMenu")).toBeTruthy();
    expect(screen.queryByText("analytics.uncategorized")).toBeNull();
    expect(screen.getByText("30%")).toBeTruthy();
  });
});
