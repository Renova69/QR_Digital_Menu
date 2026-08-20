import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import PrintableQRCodes from "./PrintableQRCodes";

// Task 17 fix round 2 (merge blocker): isolates the fallback-URL logic
// itself from the TanStack Query / TableView wiring already covered by
// PrintableQRCodes.commit.test.tsx. This suite renders the component
// directly with `committed`/`commitError` passed straight in, and mocks
// qrcode.react so the QR's `value` prop is inspectable as plain text —
// the real drawing logic isn't what's under test here.
vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (_key: string, fallback?: string) => fallback ?? _key,
  }),
}));

vi.mock("qrcode.react", () => ({
  QRCodeSVG: ({ value }: { value: string }) => <div>{value}</div>,
}));

const restaurant = { id: "r1", name: "Bistro", accentColor: "#000000" };
const tables = [{ id: "t1", name: "5" }];

describe("PrintableQRCodes commit fallback", () => {
  it("builds every QR from the server-committed slug on success", () => {
    render(
      <PrintableQRCodes
        restaurant={restaurant}
        tables={tables}
        committed={{
          slug: "bistro-oranzh",
          committedAt: "2026-08-15T00:00:00Z",
        }}
      />,
    );

    expect(screen.getByTestId("printable-qr-grid")).toBeInTheDocument();
    expect(
      screen.getByText((content) =>
        content.includes("/m/bistro-oranzh?table=5"),
      ),
    ).toBeInTheDocument();
  });

  // The whole point of the fix: a QR against the permanent legacy URL beats
  // no QR at all when the slug could not be frozen server-side.
  it("falls back to the legacy id URL and still renders the grid when the commit fails", () => {
    render(
      <PrintableQRCodes
        restaurant={restaurant}
        tables={tables}
        committed={null}
        commitError
      />,
    );

    expect(screen.getByTestId("printable-qr-grid")).toBeInTheDocument();
    expect(
      screen.getByText((content) =>
        content.includes("/menu/public/r1?table=5"),
      ),
    ).toBeInTheDocument();
    expect(
      screen.queryByTestId("printable-qr-placeholder"),
    ).not.toBeInTheDocument();
  });

  it("still shows the safe placeholder while the commit is genuinely pending", () => {
    render(
      <PrintableQRCodes
        restaurant={restaurant}
        tables={tables}
        committed={null}
      />,
    );

    expect(screen.getByTestId("printable-qr-placeholder")).toBeInTheDocument();
    expect(screen.queryByTestId("printable-qr-grid")).not.toBeInTheDocument();
  });
});
