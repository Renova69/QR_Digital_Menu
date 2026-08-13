import React from "react";
import { render, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { abandonCheckout } from "../lib/api";
import { sendClientLog } from "../lib/clientLogger";
import { hostedCheckoutStorageKey } from "../lib/tableSessionCredential";
import { usePaymentReturn } from "./usePaymentReturn";

const navigate = vi.hoisted(() => vi.fn());

vi.mock("react-router-dom", () => ({
  useLocation: () => ({
    pathname: window.location.pathname,
    search: window.location.search,
  }),
  useNavigate: () => navigate,
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (_key: string, fallback: string) => fallback,
  }),
}));

vi.mock("../lib/api", () => ({
  abandonCheckout: vi.fn(),
}));

vi.mock("../lib/clientLogger", () => ({
  sendClientLog: vi.fn(),
}));

function Harness({
  setIsPaymentModalOpen,
  setPaymentBanner,
}: {
  setIsPaymentModalOpen: (open: boolean) => void;
  setPaymentBanner: (banner: { ok: boolean; text: string } | null) => void;
}) {
  usePaymentReturn({
    restaurantId: "restaurant-1",
    sessionToken: "session-token",
    setSessionToken: vi.fn(),
    setIsPaymentModalOpen,
    setPaymentBanner,
  });
  return null;
}

describe("usePaymentReturn", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    sessionStorage.clear();
    localStorage.clear();
    window.history.replaceState({}, "", "/menu");
  });

  it("keeps the checkout marker and reports cleanup failure after returning without provider params", async () => {
    const setIsPaymentModalOpen = vi.fn();
    const setPaymentBanner = vi.fn();
    sessionStorage.setItem(
      hostedCheckoutStorageKey("session-token"),
      JSON.stringify({ token: "session-token", startedAt: Date.now() }),
    );
    vi.mocked(abandonCheckout).mockRejectedValueOnce(
      new Error("Network Error"),
    );

    render(
      <Harness
        setIsPaymentModalOpen={setIsPaymentModalOpen}
        setPaymentBanner={setPaymentBanner}
      />,
    );

    await waitFor(() => {
      expect(abandonCheckout).toHaveBeenCalledWith("session-token");
      expect(setPaymentBanner).toHaveBeenCalledWith({
        ok: false,
        text: "Could not release this payment attempt. Check your connection and try again.",
      });
    });
    expect(
      sessionStorage.getItem(hostedCheckoutStorageKey("session-token")),
    ).not.toBeNull();
    expect(setIsPaymentModalOpen).toHaveBeenCalledWith(false);
    expect(sendClientLog).toHaveBeenCalledWith(
      expect.objectContaining({ type: "payment_abandon_failed" }),
    );
  });

  it("does not silently clear a cancelled provider return when abandonment fails", async () => {
    const setIsPaymentModalOpen = vi.fn();
    const setPaymentBanner = vi.fn();
    window.history.replaceState({}, "", "/menu?payment=mypos-cancel");
    sessionStorage.setItem(
      hostedCheckoutStorageKey("session-token"),
      JSON.stringify({ token: "session-token", startedAt: Date.now() }),
    );
    vi.mocked(abandonCheckout).mockRejectedValueOnce(
      new Error("Network Error"),
    );

    render(
      <Harness
        setIsPaymentModalOpen={setIsPaymentModalOpen}
        setPaymentBanner={setPaymentBanner}
      />,
    );

    await waitFor(() => {
      expect(setPaymentBanner).toHaveBeenLastCalledWith({
        ok: false,
        text: "Could not release this payment attempt. Check your connection and try again.",
      });
    });
    expect(abandonCheckout).toHaveBeenCalledTimes(1);
    expect(
      sessionStorage.getItem(hostedCheckoutStorageKey("session-token")),
    ).not.toBeNull();
    expect(navigate).toHaveBeenCalledWith("/menu", { replace: true });
  });
});
