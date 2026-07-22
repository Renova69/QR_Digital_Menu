import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  superAdminGetDataRequests,
  superAdminUpdateDataRequest,
} from "../../lib/api";
import DataRequestsPage from "./DataRequestsPage";

vi.mock("../../lib/api", () => ({
  superAdminGetDataRequests: vi.fn(),
  superAdminUpdateDataRequest: vi.fn(),
}));

const mockedGetDataRequests = vi.mocked(superAdminGetDataRequests);
const mockedUpdateDataRequest = vi.mocked(superAdminUpdateDataRequest);

function renderPage() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <DataRequestsPage />
    </QueryClientProvider>,
  );
}

describe("DataRequestsPage terminal status confirmation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedGetDataRequests.mockResolvedValue({
      data: [
        {
          id: "request-1",
          type: "ERASURE",
          status: "IN_PROGRESS",
          requestedAt: "2026-07-18T10:00:00.000Z",
          processedAt: null,
          notes: null,
          downloadUrl: null,
          user: {
            id: "user-1",
            email: "owner@example.com",
            name: "Owner",
          },
        },
      ],
      meta: { total: 1, page: 1, limit: 20, totalPages: 1 },
    });
    mockedUpdateDataRequest.mockResolvedValue({});
  });

  it("sends the required confirmation only after an explicit terminal-action confirmation", async () => {
    const confirm = vi.spyOn(window, "confirm").mockReturnValueOnce(false);
    renderPage();

    fireEvent.click(await screen.findByText("owner@example.com"));
    fireEvent.click(screen.getByRole("button", { name: "Mark as COMPLETED" }));
    expect(mockedUpdateDataRequest).not.toHaveBeenCalled();

    confirm.mockReturnValueOnce(true);
    fireEvent.click(screen.getByRole("button", { name: "Mark as COMPLETED" }));

    await waitFor(() =>
      expect(mockedUpdateDataRequest).toHaveBeenCalledWith("request-1", {
        status: "COMPLETED",
        notes: undefined,
        confirmation: "CONFIRM",
      }),
    );
  });
});
