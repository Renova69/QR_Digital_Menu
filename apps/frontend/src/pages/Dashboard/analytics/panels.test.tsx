import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { CategoryMix } from "./panels";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

describe("CategoryMix", () => {
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
