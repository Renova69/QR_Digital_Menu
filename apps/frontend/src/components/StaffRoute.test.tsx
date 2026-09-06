import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, it, expect, vi } from "vitest";
import StaffRoute from "./StaffRoute";
const state = vi.hoisted(() => ({ role: "KITCHEN", pos: false, kds: true }));
vi.mock("../context/AuthContext", () => ({
  useAuth: () => ({ user: { role: state.role }, isLoading: false }),
}));
vi.mock("../context/RestaurantContext", () => ({
  useRestaurantContext: () => ({
    activeRestaurant: { id: "r1", isActive: true },
  }),
}));
vi.mock("../hooks/useFeature", () => ({
  useFeature: (feature: "pos" | "kds") => state[feature],
}));
describe("staff workspace entitlements", () => {
  it.each([
    ["KITCHEN", false, true, true],
    ["KITCHEN", true, false, false],
    ["WAITER", true, false, true],
    ["WAITER", false, true, false],
  ] as const)(
    "gates %s independently (pos=%s kds=%s)",
    (role, pos, kds, allowed) => {
      Object.assign(state, { role, pos, kds });
      render(
        <MemoryRouter
          initialEntries={[
            role === "KITCHEN" ? "/staff/kitchen" : "/staff/pos",
          ]}
        >
          <StaffRoute>
            <div>Workspace</div>
          </StaffRoute>
        </MemoryRouter>,
      );
      expect(!!screen.queryByText("Workspace")).toBe(allowed);
    },
  );
});
