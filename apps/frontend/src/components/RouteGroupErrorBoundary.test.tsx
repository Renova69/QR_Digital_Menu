import { fireEvent, render, screen } from "@testing-library/react";
import type { ReactElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  MemoryRouter,
  Outlet,
  Route,
  Routes,
  useNavigate,
} from "react-router-dom";
import RouteGroupErrorBoundary from "./RouteGroupErrorBoundary";

vi.mock("../lib/clientLogger", () => ({
  logClientError: vi.fn(),
}));

function BrokenRoute(): ReactElement {
  throw new Error("route exploded");
}

function NavigationShell() {
  const navigate = useNavigate();
  return (
    <>
      <button type="button" onClick={() => navigate("/healthy")}>
        Healthy route
      </button>
      <Outlet />
    </>
  );
}

describe("RouteGroupErrorBoundary", () => {
  beforeEach(() => {
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("isolates a route render error and resets after navigation", () => {
    render(
      <MemoryRouter initialEntries={["/broken"]}>
        <Routes>
          <Route element={<NavigationShell />}>
            <Route element={<RouteGroupErrorBoundary />}>
              <Route path="/broken" element={<BrokenRoute />} />
              <Route path="/healthy" element={<div>Healthy content</div>} />
            </Route>
          </Route>
        </Routes>
      </MemoryRouter>,
    );

    expect(screen.getByText("route exploded")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Healthy route" }));

    expect(screen.getByText("Healthy content")).toBeTruthy();
    expect(screen.queryByText("route exploded")).toBeNull();
  });
});
