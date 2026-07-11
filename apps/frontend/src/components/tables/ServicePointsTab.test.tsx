import React from "react";
import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import "@testing-library/jest-dom";
import { vi } from "vitest";
import ServicePointsTab from "./ServicePointsTab";
import { updateTable } from "../../lib/api";

const servicePoint = {
  id: "room-301",
  name: "301",
  restaurantId: "restaurant-1",
  type: "ROOM" as const,
  publicToken: "room-token",
  isActive: true,
  fulfillmentModes: ["ROOM_DELIVERY"] as const,
  paymentMethods: ["PAY_ON_DELIVERY"] as const,
};

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (_key: string, fallback?: string) => fallback ?? _key,
  }),
}));

vi.mock("../../lib/api", () => ({
  createServicePoint: vi.fn(),
  deleteTable: vi.fn(),
  getServicePoints: vi.fn(),
  getTables: vi.fn(),
  rotateServicePointToken: vi.fn(),
  updateTable: vi.fn().mockResolvedValue({}),
}));

vi.mock("@tanstack/react-query", () => ({
  useQueryClient: () => ({ invalidateQueries: vi.fn() }),
  useQuery: ({ queryKey }: { queryKey: string[] }) => ({
    data: queryKey[0] === "servicePoints" ? [servicePoint] : [],
    isLoading: false,
  }),
  useMutation: (config: any) => ({
    isPending: false,
    mutate: (input?: unknown) =>
      Promise.resolve(config.mutationFn(input)).then(() =>
        config.onSuccess?.(),
      ),
  }),
}));

describe("ServicePointsTab editing", () => {
  it("updates fulfillment and payment settings without recreating the QR", async () => {
    render(
      <ServicePointsTab
        restaurantId="restaurant-1"
        paymentsEnabled
        onShowQr={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Edit" }));
    const editor = within(screen.getByTestId("service-point-editor"));
    fireEvent.click(editor.getByRole("button", { name: "Guest pickup" }));
    fireEvent.click(editor.getByRole("button", { name: "Pay online" }));
    fireEvent.click(editor.getByRole("button", { name: "Save" }));

    await waitFor(() =>
      expect(updateTable).toHaveBeenCalledWith("room-301", {
        name: "301",
        fulfillmentModes: ["ROOM_DELIVERY", "PICKUP"],
        paymentMethods: ["PAY_ON_DELIVERY", "ONLINE"],
      }),
    );
  });

  it("does not allow online payment when restaurant payments are disabled", () => {
    render(
      <ServicePointsTab
        restaurantId="restaurant-1"
        paymentsEnabled={false}
        onShowQr={vi.fn()}
      />,
    );

    expect(screen.getByRole("button", { name: "Pay online" })).toBeDisabled();
  });
});
