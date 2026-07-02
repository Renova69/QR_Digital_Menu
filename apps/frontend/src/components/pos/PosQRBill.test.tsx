import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import PosQRBill from "./PosQRBill";

const posState = vi.hoisted(() => ({
  session: {
    sessionToken: "session-token-1",
    tableName: "Table 9",
  },
}));

vi.mock("../../context/PosContext", () => ({
  usePos: () => posState,
}));

vi.mock("qrcode.react", () => ({
  QRCodeSVG: ({ value }: { value: string }) => (
    <span data-testid="payment-qr" data-value={value} />
  ),
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (
      key: string,
      fallbackOrOptions?: string | { defaultValue?: string; table?: string },
    ) => {
      const value =
        typeof fallbackOrOptions === "string"
          ? fallbackOrOptions
          : (fallbackOrOptions?.defaultValue ?? key);
      return value.replace(
        /\{\{\s*table\s*\}\}/g,
        fallbackOrOptions &&
          typeof fallbackOrOptions !== "string" &&
          fallbackOrOptions.table
          ? fallbackOrOptions.table
          : "",
      );
    },
  }),
}));

describe("PosQRBill", () => {
  afterEach(() => {
    cleanup();
  });

  it("shows a request button first and opens the QR without exposing the raw link", () => {
    render(<PosQRBill />);

    expect(
      screen.getByRole("button", { name: "Request QR for payment" }),
    ).toBeTruthy();
    expect(
      screen.queryByText(
        "Ask the customer to scan this QR to review and pay their bill.",
      ),
    ).toBeNull();
    expect(screen.queryByText(/checkout\?session=/)).toBeNull();

    fireEvent.click(
      screen.getByRole("button", { name: "Request QR for payment" }),
    );

    expect(screen.getByText("Payment QR for Table 9")).toBeTruthy();
    expect(
      screen.getByText(
        "Ask the customer to scan this QR to review and pay their bill.",
      ),
    ).toBeTruthy();
    expect(screen.queryByText(/checkout\?session=/)).toBeNull();
    const qrValue = screen.getByTestId("payment-qr").getAttribute("data-value");
    expect(qrValue).toBe(
      `${window.location.origin}/checkout#session=session-token-1`,
    );
    expect(qrValue).not.toContain("?session=");
  });
});
