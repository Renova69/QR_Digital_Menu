import { beforeEach, describe, it, expect, vi } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import { AssistanceProvider, useAssistance } from "./AssistanceContext";
import type { ReactNode } from "react";

// Mock dependencies
const mockGetAssistanceRequests = vi.fn();
const mockApiUpdateAssistanceRequest = vi.fn();

vi.mock("../lib/api", () => ({
  getAssistanceRequests: (...args: any[]) => mockGetAssistanceRequests(...args),
  updateAssistanceRequest: (...args: any[]) => mockApiUpdateAssistanceRequest(...args),
}));

let mockSocket: any = null;
let mockIsConnected = true;

vi.mock("./SocketContext", () => ({
  useSocket: () => ({
    socket: mockSocket,
    isConnected: mockIsConnected,
  }),
}));

let mockUser: any = { id: "user-1", role: "WAITER" };
let mockIsAuthenticated = true;

vi.mock("./AuthContext", () => ({
  useAuth: () => ({
    user: mockUser,
    isAuthenticated: mockIsAuthenticated,
  }),
}));

let mockActiveRestaurant: any = { id: "rest-1", name: "Test Restaurant" };

vi.mock("./RestaurantContext", () => ({
  useRestaurantContext: () => ({
    activeRestaurant: mockActiveRestaurant,
  }),
}));

const wrapper = ({ children }: { children: ReactNode }) => (
  <AssistanceProvider>{children}</AssistanceProvider>
);

describe("AssistanceContext", () => {
  type SocketHandler = (...args: unknown[]) => void;
  let socketCallbacks: Record<string, SocketHandler> = {};

  beforeEach(() => {
    vi.clearAllMocks();
    mockIsConnected = true;
    mockIsAuthenticated = true;
    mockUser = { id: "user-1", role: "WAITER" };
    mockActiveRestaurant = { id: "rest-1", name: "Test Restaurant" };

    socketCallbacks = {};
    mockSocket = {
      on: vi.fn((event: string, cb: SocketHandler) => {
        socketCallbacks[event] = cb;
      }),
      off: vi.fn((event: string) => {
        delete socketCallbacks[event];
      }),
    };

    // Default API responses
    mockGetAssistanceRequests.mockImplementation(async ({ isResolved, page }: any) => {
      if (!isResolved) {
        return {
          data: [
            { id: "req-1", tableId: "t-1", isResolved: false, createdAt: "2026-08-01", updatedAt: "2026-08-01" },
          ],
          total: 1,
          page: 1,
          totalPages: 1,
        };
      }
      return {
        data: [
          { id: "req-2", tableId: "t-2", isResolved: true, createdAt: "2026-08-01", updatedAt: "2026-08-01" },
        ],
        total: 1,
        page: page || 1,
        totalPages: 1,
      };
    });

    // Mock HTMLMediaElement.prototype.play
    vi.spyOn(window.HTMLMediaElement.prototype, "play").mockImplementation(() => Promise.resolve());
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  it("throws an error when useAssistance is used outside AssistanceProvider", () => {
    expect(() => renderHook(() => useAssistance())).toThrow(
      "useAssistance must be used within an AssistanceProvider",
    );
  });

  it("fetches active and resolved assistance requests on mount for staff", async () => {
    const { result } = renderHook(() => useAssistance(), { wrapper });

    await waitFor(() => {
      expect(result.current.requests).toHaveLength(2);
      expect(result.current.requests.map((r) => r.id)).toEqual(["req-1", "req-2"]);
    });

    expect(mockGetAssistanceRequests).toHaveBeenCalledWith({
      restaurantId: "rest-1",
      isResolved: false,
      page: 1,
      limit: 100,
    });
    expect(mockGetAssistanceRequests).toHaveBeenCalledWith({
      restaurantId: "rest-1",
      isResolved: true,
      page: 1,
      limit: 50,
    });
  });

  it("does not fetch assistance requests for customer role or unauthenticated user", async () => {
    mockUser = { id: "cust-1", role: "CUSTOMER" };

    const { result } = renderHook(() => useAssistance(), { wrapper });

    await waitFor(() => {
      expect(result.current.requests).toEqual([]);
    });

    expect(mockGetAssistanceRequests).not.toHaveBeenCalled();
  });

  it("marks a request as resolved and refreshes", async () => {
    mockApiUpdateAssistanceRequest.mockResolvedValue({});
    const { result } = renderHook(() => useAssistance(), { wrapper });

    await waitFor(() => {
      expect(result.current.requests).toHaveLength(2);
    });

    await act(async () => {
      await result.current.markAsResolved("req-1");
    });

    expect(mockApiUpdateAssistanceRequest).toHaveBeenCalledWith("req-1", { isResolved: true });
    expect(mockGetAssistanceRequests).toHaveBeenCalledTimes(4); // 2 on mount + 2 on refresh
  });

  it("marks a request as unresolved and refreshes", async () => {
    mockApiUpdateAssistanceRequest.mockResolvedValue({});
    const { result } = renderHook(() => useAssistance(), { wrapper });

    await waitFor(() => {
      expect(result.current.requests).toHaveLength(2);
    });

    await act(async () => {
      await result.current.markAsUnresolved("req-2");
    });

    expect(mockApiUpdateAssistanceRequest).toHaveBeenCalledWith("req-2", { isResolved: false });
  });

  it("supports pagination of resolved requests with loadMoreResolved and deduplication", async () => {
    mockGetAssistanceRequests.mockImplementation(async ({ isResolved, page }: any) => {
      if (!isResolved) {
        return { data: [], total: 0, page: 1, totalPages: 1 };
      }
      if (page === 1) {
        return {
          data: [{ id: "req-res-1", tableId: "t-1", isResolved: true, createdAt: "2026-08-01", updatedAt: "2026-08-01" }],
          total: 2,
          page: 1,
          totalPages: 2,
        };
      }
      return {
        data: [
          { id: "req-res-1", tableId: "t-1", isResolved: true, createdAt: "2026-08-01", updatedAt: "2026-08-01" }, // duplicate
          { id: "req-res-2", tableId: "t-2", isResolved: true, createdAt: "2026-08-01", updatedAt: "2026-08-01" },
        ],
        total: 2,
        page: 2,
        totalPages: 2,
      };
    });

    const { result } = renderHook(() => useAssistance(), { wrapper });

    await waitFor(() => {
      expect(result.current.requests).toHaveLength(1);
      expect(result.current.hasMoreResolved).toBe(true);
    });

    await act(async () => {
      await result.current.loadMoreResolved();
    });

    expect(result.current.requests).toHaveLength(2);
    expect(result.current.requests.map((r) => r.id)).toEqual(["req-res-1", "req-res-2"]);
    expect(result.current.hasMoreResolved).toBe(false);
  });

  it("refreshes on socket events", async () => {
    const { result } = renderHook(() => useAssistance(), { wrapper });

    await waitFor(() => {
      expect(result.current.requests).toHaveLength(2);
    });

    expect(socketCallbacks["newAssistanceRequest"]).toBeDefined();
    expect(socketCallbacks["assistanceStatusChanged"]).toBeDefined();
    expect(socketCallbacks["cashPaymentRequest:created"]).toBeDefined();
    expect(socketCallbacks["cashPaymentRequest:updated"]).toBeDefined();

    await act(async () => {
      socketCallbacks["newAssistanceRequest"]();
    });

    expect(mockGetAssistanceRequests).toHaveBeenCalledTimes(4);
  });

  it("handles fetch errors gracefully and sets error state", async () => {
    mockGetAssistanceRequests.mockRejectedValue(new Error("Network failure"));

    const { result } = renderHook(() => useAssistance(), { wrapper });

    await waitFor(() => {
      expect(result.current.error).toBe("assistance.fetchFailed");
      expect(result.current.isLoading).toBe(false);
    });
  });
});
