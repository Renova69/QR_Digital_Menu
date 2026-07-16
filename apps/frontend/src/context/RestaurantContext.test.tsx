import { act, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { RestaurantProvider, useRestaurantContext } from "./RestaurantContext";

const mocks = vi.hoisted(() => ({
  auth: {
    user: {
      id: "owner-1",
      email: "owner@example.com",
      role: "OWNER",
    },
    prefetchedRestaurants: null as unknown[] | null,
    clearPrefetch: vi.fn(),
  },
  getRestaurants: vi.fn(),
  getRestaurantById: vi.fn(),
  createRestaurant: vi.fn(),
  loadOfflineRestaurant: vi.fn(),
  saveOfflineRestaurant: vi.fn(),
}));

vi.mock("./AuthContext", () => ({
  useAuth: () => mocks.auth,
}));

vi.mock("./SocketContext", () => ({
  useSocket: () => ({ socket: null, isConnected: false }),
}));

vi.mock("../services/restaurantService", () => ({
  getRestaurants: mocks.getRestaurants,
  getRestaurantById: mocks.getRestaurantById,
  createRestaurant: mocks.createRestaurant,
}));

vi.mock("../lib/posOfflineShift", () => ({
  loadOfflineRestaurant: mocks.loadOfflineRestaurant,
  saveOfflineRestaurant: mocks.saveOfflineRestaurant,
}));

describe("RestaurantProvider", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.auth.prefetchedRestaurants = null;
  });

  it("prefers a later successful login prefetch over a stale offline fallback", async () => {
    let rejectRestaurantRequest: (reason: unknown) => void = () => undefined;
    mocks.getRestaurants.mockReturnValue(
      new Promise((_, reject) => {
        rejectRestaurantRequest = reject;
      }),
    );
    mocks.loadOfflineRestaurant.mockReturnValue({
      id: "stale-free-restaurant",
      name: "Stale restaurant",
      country: "BG",
      ownerId: "owner-1",
      tier: "FREE",
    });

    const daffi = {
      id: "daffi",
      name: "Daffi",
      country: "BG",
      ownerId: "owner-1",
      tier: "ENTERPRISE" as const,
    };
    const wrapper = ({ children }: { children: ReactNode }) => (
      <RestaurantProvider>{children}</RestaurantProvider>
    );
    const { result, rerender } = renderHook(() => useRestaurantContext(), {
      wrapper,
    });

    await waitFor(() => expect(mocks.getRestaurants).toHaveBeenCalledTimes(1));

    mocks.auth.prefetchedRestaurants = [daffi];
    rerender();

    await act(async () => {
      rejectRestaurantRequest({ code: "ERR_NETWORK" });
      await Promise.resolve();
    });

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.activeRestaurant).toMatchObject({
      id: "daffi",
      tier: "ENTERPRISE",
    });
  });
});
