import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import OnboardingPage from "./OnboardingPage";
import { confirmCheckoutSession } from "../../lib/api";

vi.mock("../../context/AuthContext", () => ({
  useAuth: () => ({
    user: { id: "owner-1", role: "OWNER", onboardingComplete: false },
    isLoading: false,
    updateUser: vi.fn(),
  }),
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, fallback?: string) =>
      typeof fallback === "string" ? fallback : key,
  }),
}));

vi.mock("../../lib/api", () => ({
  confirmCheckoutSession: vi.fn(),
  createCheckoutSession: vi.fn(),
  getStripeStatus: vi.fn(),
  updateOnboardingStep: vi.fn(),
  updateProfile: vi.fn(),
}));

vi.mock("./steps/PlanPickerStep", () => ({
  default: () => <div data-testid="plan-step">Plan step</div>,
}));
vi.mock("./steps/RestaurantBasicsStep", () => ({
  default: () => <div data-testid="basics-step">Basics step</div>,
}));
vi.mock("./steps/PaymentSetupStep", () => ({
  default: () => <div data-testid="payment-step">Payment step</div>,
}));
vi.mock("./steps/FinishStep", () => ({
  default: () => <div data-testid="finish-step">Finish step</div>,
}));

const mockedConfirmCheckoutSession = vi.mocked(confirmCheckoutSession);

function renderOnboarding(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <OnboardingPage />
    </MemoryRouter>,
  );
}

describe("Onboarding checkout confirmation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    sessionStorage.clear();
    sessionStorage.setItem("selectedPlan", "STARTER");
  });

  it("stays blocked after a confirmation error and advances only after retry succeeds", async () => {
    mockedConfirmCheckoutSession
      .mockRejectedValueOnce(new Error("Stripe unavailable"))
      .mockResolvedValueOnce({ tier: "STARTER" });

    renderOnboarding(
      "/onboarding?stripe=success&session_id=checkout-session-1",
    );

    expect(
      await screen.findByText(/could not confirm your payment yet/i),
    ).toBeDefined();
    expect(screen.queryByTestId("finish-step")).toBeNull();

    fireEvent.click(
      screen.getByRole("button", { name: /retry confirmation/i }),
    );

    await waitFor(() =>
      expect(screen.getByTestId("finish-step")).toBeDefined(),
    );
    expect(mockedConfirmCheckoutSession).toHaveBeenCalledTimes(2);
  });

  it("does not call the API when the Stripe return lacks a session id", async () => {
    renderOnboarding("/onboarding?stripe=success");

    expect(
      await screen.findByText(/missing its confirmation reference/i),
    ).toBeDefined();
    expect(mockedConfirmCheckoutSession).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: /choose plan/i }));
    expect(await screen.findByTestId("plan-step")).toBeDefined();
  });
});
