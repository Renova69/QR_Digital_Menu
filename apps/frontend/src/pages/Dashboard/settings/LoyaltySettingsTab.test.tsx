import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import LoyaltySettingsTab from "./LoyaltySettingsTab";
import { useRestaurantContext } from "../../../context/RestaurantContext";
import { updateRestaurant } from "../../../lib/api";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

vi.mock("../../../context/RestaurantContext", () => ({
  useRestaurantContext: vi.fn(),
}));

vi.mock("../../../hooks/useFeature", () => ({
  useFeature: () => true,
}));

vi.mock("../../../lib/api", () => ({
  updateRestaurant: vi.fn(),
}));

describe("LoyaltySettingsTab", () => {
  const fetchRestaurants = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(useRestaurantContext).mockReturnValue({
      activeRestaurant: {
        id: "restaurant-1",
        isLoyaltyEnabled: true,
        loyaltySignupBonus: 50,
        loyaltyExchangeRate: 10,
        loyaltyRedeemRate: 150,
        loyaltyMaxRedemptionPercent: 60,
        loyaltyPointExpiryDays: 90,
        loyaltyExpiryReminderDays: 15,
        loyaltySilverThreshold: 500,
        loyaltyGoldThreshold: 2000,
        loyaltySilverMultiplier: 1.2,
        loyaltyGoldMultiplier: 1.5,
      },
      fetchRestaurants,
    } as unknown as ReturnType<typeof useRestaurantContext>);
    vi.mocked(updateRestaurant).mockResolvedValue({});
  });

  it("lets the owner save the maximum percentage of an order payable with points", async () => {
    render(<LoyaltySettingsTab />);

    const percentageInput = screen.getByDisplayValue("60");
    fireEvent.change(percentageInput, { target: { value: "100" } });
    fireEvent.click(screen.getByText("settings.saveSettings"));

    await waitFor(() =>
      expect(updateRestaurant).toHaveBeenCalledWith(
        "restaurant-1",
        expect.objectContaining({
          loyaltyMaxRedemptionPercent: 100,
        }),
      ),
    );
  });
});
