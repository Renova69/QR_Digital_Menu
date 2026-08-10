import { render, screen, waitFor, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import GeneralSettingsTab from "./GeneralSettingsTab";
import RestaurantContext from "../../../context/RestaurantContext";
import {
  triggerTranslation,
  getTranslationStatus,
  type TranslationStatus,
} from "../../../lib/api";

// t() mirrors real i18next enough to resolve {{count}} interpolation from
// defaultValue, since the badge/queued/failed-notice assertions below depend
// on the rendered count, not just the raw key. Handles both call shapes the
// component uses: t(key, "plain default string") and t(key, { defaultValue, ...vars }).
const mockT = vi.fn((key: string, opts?: unknown) => {
  if (typeof opts === "string") return opts;
  if (opts && typeof opts === "object" && "defaultValue" in opts) {
    const vars = opts as Record<string, unknown>;
    const raw = String(vars.defaultValue);
    return raw.replace(/\{\{(\w+)\}\}/g, (_, name) => String(vars[name] ?? ""));
  }
  return key;
});

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: mockT }),
}));

vi.mock("../../../hooks/useFeature", () => ({
  useFeature: () => true,
}));

const mockSocket = { on: vi.fn(), off: vi.fn() };
const mockSocketState = vi.hoisted(() => ({
  socket: null as unknown,
  isConnected: false,
}));
vi.mock("../../../context/SocketContext", () => ({
  useSocket: () => mockSocketState,
}));

vi.mock("../../../lib/api", () => ({
  updateRestaurant: vi.fn(),
  triggerTranslation: vi.fn(),
  getTranslationStatus: vi.fn(),
}));

const mockRestaurant = {
  id: "rest-1",
  name: "Test Restaurant",
  city: "Sofia",
  country: "Bulgaria",
  address: "1 Test Street",
  targetLanguages: ["en", "bg"],
  dashboardLanguage: "en",
  menuSourceLanguage: "bg",
  timezone: "Europe/Sofia",
};

const fetchRestaurants = vi.fn();

const wrapper = ({ children }: { children: React.ReactNode }) => (
  <RestaurantContext.Provider
    value={
      {
        activeRestaurant: mockRestaurant,
        fetchRestaurants,
      } as unknown as React.ContextType<typeof RestaurantContext>
    }
  >
    {children}
  </RestaurantContext.Provider>
);

const idleStatus: TranslationStatus = {
  pending: 0,
  failed: 0,
  current: 10,
  done: 0,
  total: 0,
  active: false,
  latestRunId: null,
  latestRunStatus: null,
};

beforeEach(() => {
  vi.clearAllMocks();
  mockSocketState.socket = null;
  mockSocketState.isConnected = false;
  vi.mocked(getTranslationStatus).mockResolvedValue(idleStatus);
  vi.mocked(fetchRestaurants).mockResolvedValue(undefined);
});

afterEach(() => {
  vi.useRealTimers();
});

describe("GeneralSettingsTab - translation status badge", () => {
  it("shows the outdated/failed count badge once status resolves", async () => {
    vi.mocked(getTranslationStatus).mockResolvedValue({
      ...idleStatus,
      pending: 3,
      failed: 2,
    });
    render(<GeneralSettingsTab />, { wrapper });

    expect(await screen.findByText("5 outdated")).toBeTruthy();
  });

  it("hides the badge when nothing is outdated or failed", async () => {
    render(<GeneralSettingsTab />, { wrapper });
    await waitFor(() => expect(getTranslationStatus).toHaveBeenCalled());
    expect(screen.queryByText(/outdated/)).toBeNull();
  });

  it("resumes translating=true on mount when a run is already active", async () => {
    vi.mocked(getTranslationStatus).mockResolvedValue({
      ...idleStatus,
      pending: 4,
      active: true,
      done: 3,
      total: 10,
    } as TranslationStatus & { done: number; total: number });
    render(<GeneralSettingsTab />, { wrapper });

    expect(await screen.findByText("3/10 · 7 left")).toBeTruthy();
    expect(screen.getByRole("progressbar")).toHaveAttribute(
      "aria-valuenow",
      "3",
    );
  });
});

describe("GeneralSettingsTab - handleForceTranslate", () => {
  it("enqueues translation and shows the queued state without waiting for completion", async () => {
    const user = userEvent.setup();
    vi.mocked(triggerTranslation).mockResolvedValue({
      success: true,
      message: "queued",
      runId: "run-1",
      done: 0,
      total: 10,
      status: "RUNNING",
    });
    render(<GeneralSettingsTab />, { wrapper });
    await waitFor(() => expect(getTranslationStatus).toHaveBeenCalled());

    await user.click(screen.getByText("settings.translateAllNow"));

    expect(triggerTranslation).toHaveBeenCalledWith("rest-1");
    // 202-contract: the button flips to "translating" immediately, driven by
    // the enqueue call resolving — not by the (nonexistent) full completion.
    expect(await screen.findByText("settings.translating")).toBeTruthy();
    expect(screen.getByText("0/10 · 10 left")).toBeTruthy();
  });

  it("resets translating and surfaces the error when enqueue reports failure", async () => {
    const user = userEvent.setup();
    vi.mocked(triggerTranslation).mockResolvedValue({
      success: false,
      message: "Quota exceeded",
    });
    render(<GeneralSettingsTab />, { wrapper });
    await waitFor(() => expect(getTranslationStatus).toHaveBeenCalled());

    await user.click(screen.getByText("settings.translateAllNow"));

    expect(await screen.findByText("Quota exceeded")).toBeTruthy();
    expect(screen.getByText("settings.translateAllNow")).toBeTruthy();
  });

  it("surfaces the needs-review notice instead of a bare success when nothing could be queued", async () => {
    // The backend completes the run (status COMPLETED, total 0) but reports
    // values parked in NEEDS_REVIEW. Showing "✓ Translation complete!" here
    // contradicts the outdated/failed badge sitting next to it.
    const user = userEvent.setup();
    vi.mocked(triggerTranslation).mockResolvedValue({
      success: true,
      message: "Nothing new to queue. 2 value(s) need manual review.",
      runId: null,
      done: 0,
      total: 0,
      status: "COMPLETED",
      needsReview: 2,
    });
    render(<GeneralSettingsTab />, { wrapper });
    await waitFor(() => expect(getTranslationStatus).toHaveBeenCalled());

    await user.click(screen.getByText("settings.translateAllNow"));

    expect(
      await screen.findByText(
        "Nothing new to queue — 2 value(s) need manual review.",
      ),
    ).toBeTruthy();
    expect(screen.queryByText("✓ Translation complete!")).toBeNull();
  });

  it("still shows the localized success message when nothing needs review", async () => {
    const user = userEvent.setup();
    vi.mocked(triggerTranslation).mockResolvedValue({
      success: true,
      message: "All configured translations are already current.",
      runId: null,
      done: 0,
      total: 0,
      status: "COMPLETED",
      needsReview: 0,
    });
    render(<GeneralSettingsTab />, { wrapper });
    await waitFor(() => expect(getTranslationStatus).toHaveBeenCalled());

    await user.click(screen.getByText("settings.translateAllNow"));

    expect(await screen.findByText("✓ Translation complete!")).toBeTruthy();
  });

  it("resets translating and surfaces a mapped error when the enqueue call throws", async () => {
    const user = userEvent.setup();
    vi.mocked(triggerTranslation).mockRejectedValue(new Error("network down"));
    render(<GeneralSettingsTab />, { wrapper });
    await waitFor(() => expect(getTranslationStatus).toHaveBeenCalled());

    await user.click(screen.getByText("settings.translateAllNow"));

    expect(await screen.findByText("apiErrors.unexpected")).toBeTruthy();
    expect(screen.getByText("settings.translateAllNow")).toBeTruthy();
  });
});

describe("GeneralSettingsTab - poll fallback", () => {
  it("stops polling and clears translating once the status reports no active work", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.mocked(getTranslationStatus)
      .mockResolvedValueOnce({ ...idleStatus, active: true, pending: 1 })
      .mockResolvedValueOnce({ ...idleStatus, active: false, pending: 0 });

    mockSocketState.socket = mockSocket;
    mockSocketState.isConnected = true;
    mockSocket.on.mockClear();

    render(<GeneralSettingsTab />, { wrapper });

    // Initial mount fetch resolves -> translating flips true.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });

    // Simulate the instant QUEUED event from backend so progress is not null
    const onCall = mockSocket.on.mock.calls.find(
      (c) => c[0] === "translate:progress",
    );
    if (onCall) {
      act(() => {
        onCall[1]({ phase: "queued", done: 0, total: 10, status: "QUEUED" });
      });
    }

    expect(screen.getByText("settings.translating")).toBeTruthy();

    // First poll tick picks up the second (inactive) mocked response.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(8_000);
    });

    expect(getTranslationStatus).toHaveBeenCalledTimes(2);
    expect(screen.getByText("settings.translateAllNow")).toBeTruthy();

    // The status bar should remain visible with the success message
    expect(screen.getByText("✓ Translation complete!")).toBeTruthy();
  });

  it("ignores socket batch COMPLETED for terminal UI state but updates numbers", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.mocked(getTranslationStatus).mockResolvedValue({
      ...idleStatus,
      active: true,
      pending: 10,
    });

    mockSocketState.socket = mockSocket;
    mockSocketState.isConnected = true;
    mockSocket.on.mockClear();

    render(<GeneralSettingsTab />, { wrapper });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });

    // Extract the socket handler
    const onCall = mockSocket.on.mock.calls.find(
      (c) => c[0] === "translate:progress",
    );
    expect(onCall).toBeTruthy();
    const handleProgress = onCall![1];

    // Emit a batch COMPLETED event
    act(() => {
      handleProgress({
        phase: "completed",
        done: 5,
        total: 10,
        status: "COMPLETED",
      });
    });

    // The numbers update (5/10 · 5 left)
    expect(screen.getByText("5/10 · 5 left")).toBeTruthy();

    // But the success message does NOT appear, it stays in progress
    expect(screen.queryByText("✓ Translation complete!")).toBeNull();
    expect(screen.getByText("Translating menu…")).toBeTruthy();
  });

  it("surfaces the some-failed notice once polling finds failures at completion", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.mocked(getTranslationStatus)
      .mockResolvedValueOnce({ ...idleStatus, active: true, pending: 1 })
      .mockResolvedValueOnce({ ...idleStatus, active: false, failed: 2 });

    render(<GeneralSettingsTab />, { wrapper });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(8_000);
    });

    expect(
      screen.getByText(
        "Translation finished — 2 item(s) failed or require review.",
      ),
    ).toBeTruthy();
  });
});
