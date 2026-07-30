import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ReviewInbox } from "./ReviewInbox";

const api = vi.hoisted(() => ({
  getFeedbackReviews: vi.fn(),
}));

vi.mock("../../../lib/api", () => ({
  getFeedbackReviews: api.getFeedbackReviews,
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, options?: { defaultValue?: string }) =>
      options?.defaultValue ?? key,
    i18n: { language: "en" },
  }),
}));

function renderInbox() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });

  return render(
    <QueryClientProvider client={client}>
      <ReviewInbox restaurantId="restaurant-1" />
    </QueryClientProvider>,
  );
}

describe("ReviewInbox", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("shows recent local feedback with honest visit context", async () => {
    api.getFeedbackReviews.mockResolvedValue({
      data: [
        {
          id: "review-1",
          source: "LOCAL",
          rating: 5,
          comment: "Excellent service",
          createdAt: "2026-07-30T10:15:00.000Z",
          authorName: null,
          tableName: "Table 4",
          orderTotal: null,
          payment: {
            provider: "STRIPE",
            amount: 24.5,
            currency: "EUR",
          },
          googleReviewClickedAt: "2026-07-30T10:16:00.000Z",
        },
      ],
      total: 1,
      page: 1,
      totalPages: 1,
    });

    renderInbox();

    expect(await screen.findByText("Excellent service")).toBeTruthy();
    expect(screen.getByText("Anonymous guest")).toBeTruthy();
    expect(screen.getByText("Table 4")).toBeTruthy();
    expect(screen.getByText("Stripe · €24.50")).toBeTruthy();
    expect(screen.getByText("Google link opened")).toBeTruthy();
    expect(api.getFeedbackReviews).toHaveBeenCalledWith({
      restaurantId: "restaurant-1",
      page: 1,
      limit: 3,
    });
  });

  it("opens the complete review inbox without leaving analytics", async () => {
    api.getFeedbackReviews.mockResolvedValue({
      data: [
        {
          id: "review-1",
          source: "LOCAL",
          rating: 5,
          comment: "Excellent service",
          createdAt: "2026-07-30T10:15:00.000Z",
          authorName: null,
          tableName: "Table 4",
          orderTotal: null,
          payment: null,
          googleReviewClickedAt: null,
        },
      ],
      total: 1,
      page: 1,
      totalPages: 1,
    });

    renderInbox();

    fireEvent.click(await screen.findByRole("button", { name: "View all" }));

    expect(
      await screen.findByRole("dialog", { name: "All reviews" }),
    ).toBeTruthy();
    await waitFor(() =>
      expect(api.getFeedbackReviews).toHaveBeenCalledWith({
        restaurantId: "restaurant-1",
        page: 1,
        limit: 10,
      }),
    );
  });

  it("shows legacy order context when no payment invitation exists", async () => {
    api.getFeedbackReviews.mockResolvedValue({
      data: [
        {
          id: "review-legacy",
          source: "LOCAL",
          rating: 4,
          comment: null,
          createdAt: "2026-07-29T17:30:00.000Z",
          authorName: "Maria",
          tableName: "Garden 2",
          orderTotal: 38.2,
          payment: null,
          googleReviewClickedAt: null,
        },
      ],
      total: 1,
      page: 1,
      totalPages: 1,
    });

    renderInbox();

    expect(await screen.findByText("Maria")).toBeTruthy();
    expect(screen.getByText("Garden 2")).toBeTruthy();
    expect(screen.getByText("Order · €38.20")).toBeTruthy();
  });

  it("filters the complete inbox by rating and written comments", async () => {
    api.getFeedbackReviews.mockResolvedValue({
      data: [
        {
          id: "review-1",
          source: "LOCAL",
          rating: 4,
          comment: "Very good",
          createdAt: "2026-07-30T10:15:00.000Z",
          authorName: null,
          tableName: "Table 4",
          orderTotal: null,
          payment: null,
          googleReviewClickedAt: null,
        },
      ],
      total: 1,
      page: 1,
      totalPages: 1,
    });

    renderInbox();
    fireEvent.click(await screen.findByRole("button", { name: "View all" }));

    fireEvent.change(await screen.findByLabelText("Rating"), {
      target: { value: "4" },
    });
    fireEvent.click(screen.getByRole("checkbox", { name: "Comments only" }));
    fireEvent.change(screen.getByLabelText("Sort"), {
      target: { value: "OLDEST" },
    });

    await waitFor(() =>
      expect(api.getFeedbackReviews).toHaveBeenCalledWith({
        restaurantId: "restaurant-1",
        page: 1,
        limit: 10,
        rating: 4,
        hasComment: true,
        sort: "OLDEST",
      }),
    );
  });

  it("labels a future imported Google review by its source", async () => {
    api.getFeedbackReviews.mockResolvedValue({
      data: [
        {
          id: "google-review-1",
          source: "GOOGLE",
          rating: 5,
          comment: "Wonderful",
          createdAt: "2026-07-30T10:15:00.000Z",
          authorName: "Alex",
          tableName: null,
          orderTotal: null,
          payment: null,
          googleReviewClickedAt: null,
        },
      ],
      total: 1,
      page: 1,
      totalPages: 1,
    });

    renderInbox();

    expect(await screen.findByText("Google")).toBeTruthy();
    expect(screen.queryByText("Local")).toBeNull();
  });

  it("leaves no empty divider when the restaurant has no reviews", async () => {
    api.getFeedbackReviews.mockResolvedValue({
      data: [],
      total: 0,
      page: 1,
      totalPages: 0,
    });

    const view = renderInbox();

    await waitFor(() =>
      expect(api.getFeedbackReviews).toHaveBeenCalledWith({
        restaurantId: "restaurant-1",
        page: 1,
        limit: 3,
      }),
    );
    await waitFor(() => expect(view.container.innerHTML).toBe(""));
  });
});
