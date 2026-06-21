import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";
import DailyTargetCard from "./DailyTargetCard";
import { getDailyTarget, setDailyTarget } from "../../../lib/api";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, opt?: unknown) => (typeof opt === "string" ? opt : key),
  }),
}));

vi.mock("../../../lib/api", () => ({
  getDailyTarget: vi.fn(),
  setDailyTarget: vi.fn(),
  getAnalytics: vi.fn(),
}));

const mockGet = vi.mocked(getDailyTarget);
const mockSet = vi.mocked(setDailyTarget);

function renderCard() {
  const qc = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });
  return render(
    <QueryClientProvider client={qc}>
      <DailyTargetCard restaurantId="r1" />
    </QueryClientProvider>,
  );
}

describe("DailyTargetCard", () => {
  beforeEach(() => {
    mockGet.mockReset();
    mockSet.mockReset();
  });

  it("renders a progress bar against the target when a goal is set", async () => {
    mockGet.mockResolvedValue({ target: 200, actual: 120 });
    renderCard();

    expect(await screen.findByText("120.00 €")).toBeTruthy();
    const bar = screen.getByRole("progressbar");
    expect(bar.getAttribute("aria-valuenow")).toBe("60"); // 120 / 200
  });

  it("shows a set-goal call to action when no target exists", async () => {
    mockGet.mockResolvedValue({ target: 0, actual: 0 });
    renderCard();

    expect(
      await screen.findByText("dashboard.dailyTarget.setGoal"),
    ).toBeTruthy();
    expect(screen.queryByRole("progressbar")).toBeNull();
  });

  it("saves an edited target via setDailyTarget", async () => {
    mockGet.mockResolvedValue({ target: 200, actual: 120 });
    mockSet.mockResolvedValue({ success: true } as never);
    renderCard();

    await screen.findByRole("progressbar");
    fireEvent.click(screen.getByLabelText("dashboard.dailyTarget.edit"));

    const input = screen.getByRole("spinbutton");
    fireEvent.change(input, { target: { value: "300" } });
    fireEvent.click(screen.getByLabelText("dashboard.dailyTarget.save"));

    await waitFor(() => {
      expect(mockSet).toHaveBeenCalledWith("r1", 300);
    });
  });

  it("surfaces an error when saving fails", async () => {
    mockGet.mockResolvedValue({ target: 200, actual: 120 });
    mockSet.mockRejectedValue(new Error("network"));
    renderCard();

    await screen.findByRole("progressbar");
    fireEvent.click(screen.getByLabelText("dashboard.dailyTarget.edit"));
    fireEvent.change(screen.getByRole("spinbutton"), {
      target: { value: "300" },
    });
    fireEvent.click(screen.getByLabelText("dashboard.dailyTarget.save"));

    expect(
      await screen.findByText("dashboard.dailyTarget.saveError"),
    ).toBeTruthy();
  });
});
