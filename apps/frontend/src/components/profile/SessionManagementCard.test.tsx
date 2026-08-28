import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useAuth } from "../../context/AuthContext";
import {
  getAuthSessions,
  revokeAuthSession,
  signOutEverywhere,
} from "../../lib/api";
import { SessionManagementCard } from "./SessionManagementCard";

vi.mock("../../context/AuthContext", () => ({ useAuth: vi.fn() }));
vi.mock("../../lib/api", () => ({
  getAuthSessions: vi.fn(),
  revokeAuthSession: vi.fn(),
  signOutEverywhere: vi.fn(),
}));
vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) => key,
    i18n: { language: "en" },
  }),
}));

describe("SessionManagementCard", () => {
  const logout = vi.fn().mockResolvedValue(undefined);

  const authFor = (id: string): ReturnType<typeof useAuth> => ({
    user: { id, email: `${id}@example.test`, role: "OWNER" },
    logout,
    isAuthenticated: true,
    isLoading: false,
    isError: false,
    errorMessage: null,
    prefetchedRestaurants: null,
    login: vi.fn(),
    register: vi.fn(),
    verifyRegistration: vi.fn(),
    loginWithToken: vi.fn(),
    updateUser: vi.fn(),
    refreshUser: vi.fn(),
    clearPrefetch: vi.fn(),
  });

  const newClient = () =>
    new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
      },
    });
  const renderCard = (client = newClient()) => {
    return render(
      <QueryClientProvider client={client}>
        <SessionManagementCard />
      </QueryClientProvider>,
    );
  };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(useAuth).mockReturnValue(authFor("user-1"));
    vi.mocked(getAuthSessions).mockResolvedValue({
      sessions: [
        {
          id: "session-current",
          authMethod: "PASSWORD",
          userAgent: "Mozilla/5.0 (Windows NT 10.0) Chrome/120.0",
          ipAddress: "203.0.113.4",
          createdAt: "2026-08-27T10:00:00.000Z",
          expiresAt: "2026-08-28T10:00:00.000Z",
          current: true,
        },
        {
          id: "session-other",
          authMethod: "PIN",
          userAgent: "Android okhttp",
          createdAt: "2026-08-27T11:00:00.000Z",
          expiresAt: "2026-08-27T23:00:00.000Z",
          current: false,
        },
      ],
      nextCursor: null,
      legacyCurrentSession: false,
    });
  });

  it("identifies the current device and revokes only the selected other session", async () => {
    vi.mocked(revokeAuthSession).mockResolvedValue({
      success: true,
      current: false,
    });
    renderCard();

    expect(await screen.findByText("sessions.current")).toBeTruthy();
    expect(screen.getByText("Chrome · Windows")).toBeTruthy();

    fireEvent.click(
      screen.getAllByRole("button", { name: "sessions.signOut" })[1],
    );

    await waitFor(() =>
      expect(revokeAuthSession).toHaveBeenCalledWith(
        "session-other",
        expect.any(Object),
      ),
    );
    expect(logout).not.toHaveBeenCalled();
  });

  it("signs out locally after global revocation succeeds", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(true);
    vi.mocked(signOutEverywhere).mockResolvedValue({ success: true });
    renderCard();

    fireEvent.click(
      await screen.findByRole("button", { name: "sessions.signOutAll" }),
    );

    await waitFor(() => expect(signOutEverywhere).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(logout).toHaveBeenCalledTimes(1));
  });

  it("does not expose a cached session inventory after switching accounts", async () => {
    const client = newClient();
    const view = renderCard(client);
    await screen.findByText("Chrome · Windows");
    vi.mocked(useAuth).mockReturnValue(authFor("user-2"));
    vi.mocked(getAuthSessions).mockImplementationOnce(
      () => new Promise(() => {}),
    );
    view.rerender(
      <QueryClientProvider client={client}>
        <SessionManagementCard />
      </QueryClientProvider>,
    );
    expect(screen.queryByText("Chrome · Windows")).toBeNull();
  });

  it("allows global revocation even for a legacy login with no recorded sessions", async () => {
    vi.mocked(getAuthSessions).mockResolvedValueOnce({
      sessions: [],
      nextCursor: null,
      legacyCurrentSession: true,
    });
    vi.spyOn(window, "confirm").mockReturnValue(true);
    vi.mocked(signOutEverywhere).mockResolvedValue({ success: true });
    renderCard();
    await screen.findByText("sessions.legacy");
    fireEvent.click(
      screen.getByRole("button", { name: "sessions.signOutAll" }),
    );
    await waitFor(() => expect(signOutEverywhere).toHaveBeenCalledTimes(1));
  });

  it("keeps the user signed in and shows an error when revocation fails", async () => {
    vi.mocked(revokeAuthSession).mockRejectedValueOnce(
      new Error("network unavailable"),
    );
    renderCard();
    await screen.findByText("sessions.current");
    fireEvent.click(
      screen.getAllByRole("button", { name: "sessions.signOut" })[0],
    );
    await screen.findByText("sessions.actionError");
    expect(logout).not.toHaveBeenCalled();
  });

  it("clears local identity after revoking the current session", async () => {
    vi.mocked(revokeAuthSession).mockResolvedValueOnce({
      success: true,
      current: true,
    });
    renderCard();
    await screen.findByText("sessions.current");
    fireEvent.click(
      screen.getAllByRole("button", { name: "sessions.signOut" })[0],
    );
    await waitFor(() => expect(logout).toHaveBeenCalledTimes(1));
  });

  it("loads later sessions using the server cursor", async () => {
    vi.mocked(getAuthSessions)
      .mockResolvedValueOnce({
        sessions: [],
        nextCursor: "next-page",
        legacyCurrentSession: false,
      })
      .mockResolvedValueOnce({
        sessions: [],
        nextCursor: null,
        legacyCurrentSession: false,
      });
    renderCard();
    fireEvent.click(
      await screen.findByRole("button", { name: "sessions.loadMore" }),
    );
    await waitFor(() =>
      expect(getAuthSessions).toHaveBeenCalledWith("next-page"),
    );
  });

  it("retries a failed session inventory request", async () => {
    vi.mocked(getAuthSessions).mockRejectedValueOnce(
      new Error("network unavailable"),
    );
    renderCard();
    fireEvent.click(
      await screen.findByRole("button", { name: "sessions.retry" }),
    );
    await screen.findByText("sessions.current");
    expect(getAuthSessions).toHaveBeenCalledTimes(2);
  });
});
