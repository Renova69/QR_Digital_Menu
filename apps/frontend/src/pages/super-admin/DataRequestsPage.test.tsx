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

describe("DataRequestsPage list and navigation", () => {
  const baseRequest = {
    id: "request-1",
    type: "ERASURE",
    status: "PENDING",
    requestedAt: "2026-07-18T10:00:00.000Z",
    processedAt: null,
    notes: null,
    downloadUrl: null,
    user: { id: "user-1", email: "owner@example.com", name: "Owner" },
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockedUpdateDataRequest.mockResolvedValue({});
  });

  it("renders the header, rows, badges and total count", async () => {
    mockedGetDataRequests.mockResolvedValue({
      data: [baseRequest],
      meta: { total: 1, page: 1, limit: 20, totalPages: 1 },
    });
    renderPage();

    expect(await screen.findByText("owner@example.com")).toBeTruthy();
    expect(screen.getByText("GDPR Data Requests")).toBeTruthy();
    expect(screen.getByText("ERASURE")).toBeTruthy();
    expect(screen.getByText("PENDING")).toBeTruthy();
    expect(screen.getByText("1 total")).toBeTruthy();
  });

  it("shows the loading and empty states", async () => {
    mockedGetDataRequests.mockReturnValue(new Promise(() => {}));
    const first = renderPage();
    expect(screen.getByText("Loading…")).toBeTruthy();
    first.unmount();

    mockedGetDataRequests.mockResolvedValue({
      data: [],
      meta: { total: 0, page: 1, limit: 20, totalPages: 1 },
    });
    renderPage();
    expect(await screen.findByText("No data requests found.")).toBeTruthy();
  });

  it("passes the status and type filters to the query", async () => {
    mockedGetDataRequests.mockResolvedValue({
      data: [],
      meta: { total: 0, page: 1, limit: 20, totalPages: 1 },
    });
    renderPage();
    await screen.findByText("No data requests found.");

    const selects = screen.getAllByRole("combobox");
    fireEvent.change(selects[0], { target: { value: "COMPLETED" } });
    fireEvent.change(selects[1], { target: { value: "EXPORT" } });

    await waitFor(() => {
      const lastCall = mockedGetDataRequests.mock.calls.at(-1);
      expect(lastCall![0]).toMatchObject({
        status: "COMPLETED",
        type: "EXPORT",
        page: 1,
      });
    });
  });

  it("paginates when more than one page exists", async () => {
    mockedGetDataRequests.mockResolvedValue({
      data: [baseRequest],
      meta: { total: 45, page: 1, limit: 20, totalPages: 3 },
    });
    renderPage();
    await screen.findByText("Page 1 of 3");

    fireEvent.click(screen.getByRole("button", { name: "Next" }));

    await waitFor(() => {
      const lastCall = mockedGetDataRequests.mock.calls.at(-1);
      expect(lastCall![0]).toMatchObject({ page: 2 });
    });
  });
});

describe("DataRequestsPage request actions", () => {
  const baseRequest = {
    id: "request-1",
    type: "EXPORT",
    status: "PENDING",
    requestedAt: "2026-07-18T10:00:00.000Z",
    processedAt: "2026-07-19T11:00:00.000Z",
    notes: "working on it",
    downloadUrl: null,
    user: { id: "user-1", email: "owner@example.com", name: "Owner" },
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockedGetDataRequests.mockResolvedValue({
      data: [baseRequest],
      meta: { total: 1, page: 1, limit: 20, totalPages: 1 },
    });
    mockedUpdateDataRequest.mockResolvedValue({});
  });

  it("expands a request and advances PENDING without a confirmation", async () => {
    renderPage();

    fireEvent.click(await screen.findByText("owner@example.com"));
    expect(screen.getByText(/User:/)).toBeTruthy();
    expect(screen.getByText(/Processed:/)).toBeTruthy();
    expect((screen.getByRole("textbox") as HTMLTextAreaElement).value).toBe(
      "working on it",
    );

    fireEvent.click(
      screen.getByRole("button", { name: "Mark as IN PROGRESS" }),
    );

    await waitFor(() =>
      expect(mockedUpdateDataRequest).toHaveBeenCalledWith("request-1", {
        status: "IN_PROGRESS",
        notes: "working on it",
      }),
    );
  });

  it("rejects a request with the terminal confirmation", async () => {
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(true);
    renderPage();

    fireEvent.click(await screen.findByText("owner@example.com"));
    fireEvent.click(screen.getByRole("button", { name: "Reject" }));

    expect(confirm).toHaveBeenCalledWith(
      "Confirm marking this GDPR data request as rejected? This action is recorded in the audit log.",
    );
    await waitFor(() =>
      expect(mockedUpdateDataRequest).toHaveBeenCalledWith("request-1", {
        status: "REJECTED",
        notes: "working on it",
        confirmation: "CONFIRM",
      }),
    );
    confirm.mockRestore();
  });

  it("skips the reject when the confirmation is dismissed", async () => {
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
    renderPage();

    fireEvent.click(await screen.findByText("owner@example.com"));
    fireEvent.click(screen.getByRole("button", { name: "Reject" }));

    expect(mockedUpdateDataRequest).not.toHaveBeenCalled();
    confirm.mockRestore();
  });

  it("saves edited notes", async () => {
    renderPage();

    fireEvent.click(await screen.findByText("owner@example.com"));
    fireEvent.change(screen.getByRole("textbox"), {
      target: { value: "updated notes" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save notes" }));

    await waitFor(() =>
      expect(mockedUpdateDataRequest).toHaveBeenCalledWith("request-1", {
        notes: "updated notes",
      }),
    );
  });

  it("hides the next-step and reject buttons for completed requests", async () => {
    mockedGetDataRequests.mockResolvedValue({
      data: [{ ...baseRequest, status: "COMPLETED" }],
      meta: { total: 1, page: 1, limit: 20, totalPages: 1 },
    });
    renderPage();

    fireEvent.click(await screen.findByText("owner@example.com"));

    expect(screen.queryByText(/Mark as/)).toBeNull();
    expect(screen.queryByRole("button", { name: "Reject" })).toBeNull();
  });
});
