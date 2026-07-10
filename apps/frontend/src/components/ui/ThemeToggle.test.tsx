import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, act } from "@testing-library/react";
import { useState } from "react";
import { ThemeToggle } from "./ThemeToggle";
import { ThemeProvider } from "../../context/ThemeContext";

let store: Record<string, string> = {};
const storageMock = {
  getItem: (k: string) => store[k] ?? null,
  setItem: (k: string, v: string) => {
    store[k] = v;
  },
  removeItem: (k: string) => {
    delete store[k];
  },
  clear: () => {
    store = {};
  },
};

beforeEach(() => {
  store = {};
  Object.defineProperty(window, "localStorage", {
    value: storageMock,
    writable: true,
  });
  Object.defineProperty(window, "matchMedia", {
    value: (q: string) => ({
      matches: false,
      media: q,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }),
    writable: true,
  });
  document.documentElement.classList.remove("dark");
});

// ── GlobalThemeToggle (storageKey='theme') ────────────────────────────────────

describe("GlobalThemeToggle", () => {
  it("renders inside ThemeProvider without throwing", () => {
    expect(() =>
      render(
        <ThemeProvider>
          <ThemeToggle size="sm" />
        </ThemeProvider>,
      ),
    ).not.toThrow();
  });

  it("clicking the button toggles between light and dark via context", () => {
    const { getByRole } = render(
      <ThemeProvider>
        <ThemeToggle size="sm" />
      </ThemeProvider>,
    );
    const btn = getByRole("button");
    expect(btn.getAttribute("aria-label")).toBe("Switch to dark mode");

    act(() => btn.click());

    expect(btn.getAttribute("aria-label")).toBe("Switch to light mode");
    expect(document.documentElement.classList.contains("dark")).toBe(true);
    expect(store["theme"]).toBe("dark");
  });
});

// ── PublicThemeToggle (storageKey='theme-rest1') ──────────────────────────────
// PublicThemeToggle does NOT touch <html> — it calls onThemeChange so the
// parent (PublicMenuPage) can update its CSS custom-property palette.
// The .dark class on <html> is exclusively managed by ThemeProvider.

describe("PublicThemeToggle", () => {
  it("seeds from defaultTheme when no stored preference and calls onThemeChange", () => {
    const onThemeChange = vi.fn();
    render(
      <ThemeProvider>
        <ThemeToggle
          storageKey="theme-rest1"
          defaultTheme="dark"
          size="sm"
          onThemeChange={onThemeChange}
        />
      </ThemeProvider>,
    );
    // onThemeChange must have been called with 'dark' on mount (from the effect)
    expect(onThemeChange).toHaveBeenCalledWith("dark");
    // PublicThemeToggle must NOT touch <html> — ThemeProvider owns it
    // ThemeProvider theme='light' so <html> stays without dark class
    expect(document.documentElement.classList.contains("dark")).toBe(false);
  });

  it("re-seeds from defaultTheme change when no stored preference", () => {
    const onThemeChange = vi.fn();

    function Harness() {
      const [dt, setDt] = useState<"light" | "dark">("light");
      return (
        <>
          <button data-testid="flip" onClick={() => setDt("dark")} />
          <ThemeToggle
            storageKey="theme-rest1"
            defaultTheme={dt}
            size="sm"
            onThemeChange={onThemeChange}
          />
        </>
      );
    }
    render(
      <ThemeProvider>
        <Harness />
      </ThemeProvider>,
    );
    // Initial call with 'light'
    expect(onThemeChange).toHaveBeenLastCalledWith("light");

    // API arrives: defaultTheme flips to dark — toggle must pick it up
    act(() =>
      document
        .querySelector('[data-testid="flip"]')!
        .dispatchEvent(new MouseEvent("click", { bubbles: true })),
    );

    expect(onThemeChange).toHaveBeenLastCalledWith("dark");
    // Button icon should reflect dark (shows "Switch to light mode")
    const btn = document.querySelector(
      'button[aria-label="Switch to light mode"]',
    );
    expect(btn).not.toBeNull();
  });

  it("does NOT re-seed from defaultTheme when a stored preference exists", () => {
    store["theme-rest1"] = "light"; // user prefers light
    const onThemeChange = vi.fn();

    function Harness() {
      const [dt, setDt] = useState<"light" | "dark">("light");
      return (
        <>
          <button data-testid="flip" onClick={() => setDt("dark")} />
          <ThemeToggle
            storageKey="theme-rest1"
            defaultTheme={dt}
            size="sm"
            onThemeChange={onThemeChange}
          />
        </>
      );
    }
    render(
      <ThemeProvider>
        <Harness />
      </ThemeProvider>,
    );
    onThemeChange.mockClear();

    // Restaurant default arrives as dark — stored pref is light, must be ignored
    act(() =>
      document
        .querySelector('[data-testid="flip"]')!
        .dispatchEvent(new MouseEvent("click", { bubbles: true })),
    );

    // Should NOT have been called again (state didn't change, still 'light')
    expect(onThemeChange).not.toHaveBeenCalledWith("dark");
  });

  it("one click calls onThemeChange with toggled value (no double-press)", () => {
    const onThemeChange = vi.fn();
    // Simulate API loaded with dark default — toggle starts 'dark'
    const { getByRole } = render(
      <ThemeProvider>
        <ThemeToggle
          storageKey="theme-rest1"
          defaultTheme="dark"
          size="sm"
          onThemeChange={onThemeChange}
        />
      </ThemeProvider>,
    );
    // Initial call with 'dark'
    expect(onThemeChange).toHaveBeenLastCalledWith("dark");

    // First click should switch to light
    act(() => getByRole("button").click());

    expect(onThemeChange).toHaveBeenLastCalledWith("light");
    expect(store["theme-rest1"]).toBe("light");
  });
});
