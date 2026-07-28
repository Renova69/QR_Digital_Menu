import React from "react";
import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Item } from "../../types";
import { ManageOptionsModal } from "./ManageOptionsModal";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (_key: string, fallback?: string) => fallback ?? _key,
  }),
}));

vi.mock("../ui/modal", () => ({
  Modal: ({ open, children }: { open?: boolean; children: React.ReactNode }) =>
    open ? <div role="dialog">{children}</div> : null,
}));

vi.mock("../ui/button", () => ({
  Button: ({
    children,
    variant: _variant,
    size: _size,
    ...props
  }: React.ButtonHTMLAttributes<HTMLButtonElement> & {
    variant?: string;
    size?: string;
  }) => <button {...props}>{children}</button>,
}));

vi.mock("../ui/input", () => ({
  Input: (props: React.InputHTMLAttributes<HTMLInputElement>) => (
    <input {...props} />
  ),
}));

vi.mock("../../lib/api", () => ({
  default: {
    get: vi.fn(),
    post: vi.fn(),
    patch: vi.fn(),
    delete: vi.fn(),
  },
}));

describe("ManageOptionsModal mobile browser compatibility", () => {
  const originalCrypto = globalThis.crypto;

  afterEach(() => {
    Object.defineProperty(globalThis, "crypto", {
      configurable: true,
      value: originalCrypto,
    });
  });

  it("opens when crypto exists without randomUUID", () => {
    Object.defineProperty(globalThis, "crypto", {
      configurable: true,
      value: {},
    });

    expect(() =>
      render(
        <ManageOptionsModal
          item={
            {
              id: "item-1",
              name: "Mobile item",
              options: [],
            } as unknown as Item
          }
          open
          onOpenChange={vi.fn()}
        />,
      ),
    ).not.toThrow();

    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });
});
