import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, act } from "@testing-library/react";
import { useTheme, ThemeProvider } from "./ThemeContext";

// ── helpers ──────────────────────────────────────────────────────────────────

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
    configurable: true,
  });
  // Ensure matchMedia is defined but reports light-mode so we can confirm it is ignored
  Object.defineProperty(window, "matchMedia", {
    value: (q: string) => ({
      matches: true, // OS is "dark" — but our ThemeContext must still default to light
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

function ThemeConsumer({
  onRender,
}: {
  onRender: (v: ReturnType<typeof useTheme>) => void;
}) {
  const ctx = useTheme();
  onRender(ctx);
  return null;
}

// ── ThemeContext ──────────────────────────────────────────────────────────────

describe("ThemeContext", () => {
  it("defaults to light even when OS reports dark preference", () => {
    // matchMedia.matches = true (dark OS), but no localStorage — must still be light
    let captured: any;
    render(
      <ThemeProvider>
        <ThemeConsumer
          onRender={(v) => {
            captured = v;
          }}
        />
      </ThemeProvider>,
    );
    expect(captured.theme).toBe("light");
    expect(document.documentElement.classList.contains("dark")).toBe(false);
  });

  it("reads stored preference from localStorage on mount", () => {
    store["theme"] = "dark";
    let captured: any;
    render(
      <ThemeProvider>
        <ThemeConsumer
          onRender={(v) => {
            captured = v;
          }}
        />
      </ThemeProvider>,
    );
    expect(captured.theme).toBe("dark");
    expect(document.documentElement.classList.contains("dark")).toBe(true);
  });

  it("ignores an invalid stored theme", () => {
    store["theme"] = "sepia";
    let captured: ReturnType<typeof useTheme> | undefined;

    render(
      <ThemeProvider>
        <ThemeConsumer
          onRender={(value) => {
            captured = value;
          }}
        />
      </ThemeProvider>,
    );

    expect(captured?.theme).toBe("light");
    expect(document.documentElement.classList.contains("dark")).toBe(false);
  });

  it("falls back to light and remains usable when localStorage is blocked", () => {
    Object.defineProperty(window, "localStorage", {
      configurable: true,
      get() {
        throw new DOMException("Storage is blocked", "SecurityError");
      },
    });
    let captured: ReturnType<typeof useTheme> | undefined;

    expect(() =>
      render(
        <ThemeProvider>
          <ThemeConsumer
            onRender={(value) => {
              captured = value;
            }}
          />
        </ThemeProvider>,
      ),
    ).not.toThrow();

    expect(captured?.theme).toBe("light");
    act(() => captured?.toggleTheme());
    expect(captured?.theme).toBe("dark");
    expect(document.documentElement.classList.contains("dark")).toBe(true);
  });

  it("toggleTheme switches from light to dark and adds .dark class", () => {
    let captured: any;
    render(
      <ThemeProvider>
        <ThemeConsumer
          onRender={(v) => {
            captured = v;
          }}
        />
      </ThemeProvider>,
    );
    expect(captured.theme).toBe("light");

    act(() => captured.toggleTheme());

    expect(captured.theme).toBe("dark");
    expect(document.documentElement.classList.contains("dark")).toBe(true);
    expect(store["theme"]).toBe("dark");
  });

  it("toggleTheme switches from dark to light and removes .dark class", () => {
    store["theme"] = "dark";
    let captured: any;
    render(
      <ThemeProvider>
        <ThemeConsumer
          onRender={(v) => {
            captured = v;
          }}
        />
      </ThemeProvider>,
    );

    act(() => captured.toggleTheme());

    expect(captured.theme).toBe("light");
    expect(document.documentElement.classList.contains("dark")).toBe(false);
    expect(store["theme"]).toBe("light");
  });

  it("throws when useTheme is called outside ThemeProvider", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(() => render(<ThemeConsumer onRender={() => {}} />)).toThrow(
      "useTheme must be used inside ThemeProvider",
    );
    spy.mockRestore();
  });
});
