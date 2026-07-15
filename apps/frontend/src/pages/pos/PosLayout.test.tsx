import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import PosLayout from "./PosLayout";
import { usePosTheme } from "../../context/PosThemeContext";

vi.mock("../../context/AuthContext", () => ({
  useAuth: () => ({ user: null }),
}));

vi.mock("../../context/RestaurantContext", () => ({
  useRestaurantContext: () => ({ activeRestaurant: null }),
}));

function PosThemeProbe() {
  const { theme, toggleTheme } = usePosTheme();
  return (
    <button type="button" onClick={toggleTheme}>
      theme:{theme}
    </button>
  );
}

function renderPosLayout() {
  return render(
    <MemoryRouter initialEntries={["/staff/pos"]}>
      <Routes>
        <Route path="/staff/pos" element={<PosLayout />}>
          <Route index element={<PosThemeProbe />} />
        </Route>
      </Routes>
    </MemoryRouter>,
  );
}

describe("PosLayout", () => {
  afterEach(() => {
    cleanup();
    document.documentElement.classList.remove("dark");
  });

  it("keeps the default light POS theme scoped to the POS shell", () => {
    document.documentElement.classList.remove("dark");

    renderPosLayout();

    const shell = screen.getByTestId("pos-theme-shell");
    expect(shell.getAttribute("data-pos-theme")).toBe("light");
    expect(shell.classList.contains("dark")).toBe(false);
    expect(document.documentElement.classList.contains("dark")).toBe(false);
  });

  it("toggles the POS shell theme without mutating the global html theme", () => {
    document.documentElement.classList.add("dark");

    const { unmount } = renderPosLayout();
    const shell = screen.getByTestId("pos-theme-shell");

    fireEvent.click(screen.getByRole("button", { name: "theme:light" }));

    expect(shell.getAttribute("data-pos-theme")).toBe("dark");
    expect(shell.classList.contains("dark")).toBe(true);
    expect(document.documentElement.classList.contains("dark")).toBe(true);

    unmount();
    expect(document.documentElement.classList.contains("dark")).toBe(true);
  });
});
