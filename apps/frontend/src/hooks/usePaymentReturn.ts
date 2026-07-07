import { useEffect } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { abandonCheckout } from "../lib/api";
import { clearOwnedOrderIds } from "../lib/publicOrderOwnership";
import {
  findHostedCheckoutToken,
  hostedCheckoutStorageKey,
} from "../lib/tableSessionCredential";

export interface PaymentBanner {
  ok: boolean;
  text: string;
}

function hasHostedCheckoutMarker(token: string | null | undefined) {
  if (!token) return false;
  try {
    return !!sessionStorage.getItem(hostedCheckoutStorageKey(token));
  } catch {
    return false;
  }
}

function clearHostedCheckoutMarker(token: string | null | undefined) {
  if (!token) return;
  try {
    sessionStorage.removeItem(hostedCheckoutStorageKey(token));
  } catch {}
}

interface UsePaymentReturnArgs {
  restaurantId: string | undefined;
  sessionToken: string | null;
  setSessionToken: (token: string | null) => void;
  setIsPaymentModalOpen: (open: boolean) => void;
  setPaymentBanner: (banner: PaymentBanner | null) => void;
}

/**
 * Owns the hosted-checkout (ePay / BORICA / myPOS) return handling on the public
 * menu:
 *  - reads the `?payment=<provider>-ok|-cancel` param a provider redirects back
 *    with, shows the success/cancel banner, clears the session on success,
 *    abandons the PENDING payment on cancel, then strips the param;
 *  - on `pageshow` (incl. bfcache restore) with no payment param but a live
 *    hosted-checkout marker, abandons the stranded PENDING payment.
 *
 * POS Payment QR opens /checkout#session=<token>; that token is never written to
 * localStorage (only normal table ordering does that). On a hosted-checkout
 * return we may therefore have no table-based token — recover it from the marker
 * so cancel can still abandon the PENDING payment and the marker is cleaned up.
 */
export function usePaymentReturn({
  restaurantId,
  sessionToken,
  setSessionToken,
  setIsPaymentModalOpen,
  setPaymentBanner,
}: UsePaymentReturnArgs) {
  const location = useLocation();
  const navigate = useNavigate();
  const { t } = useTranslation();

  // Handle hosted-checkout return params. Runs once on mount and on URL change.
  // Strips the param to keep the URL clean.
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const paymentOutcome = params.get("payment");
    if (!paymentOutcome) return;

    const tableParam = params.get("table");
    const sessionKey =
      restaurantId && tableParam
        ? `session-${restaurantId}-${tableParam}`
        : null;
    // Fall back to the marker token so the POS Payment QR flow (token only in the
    // /checkout URL, never in localStorage) is cleaned up correctly too.
    const storedToken =
      (sessionKey ? localStorage.getItem(sessionKey) : null) ??
      findHostedCheckoutToken(sessionStorage);

    if (
      paymentOutcome === "borica-ok" ||
      paymentOutcome === "epay-ok" ||
      paymentOutcome === "mypos-ok"
    ) {
      // Clear the stored session token so a new one is created on the next order.
      clearHostedCheckoutMarker(storedToken);
      if (restaurantId && tableParam && storedToken) {
        clearOwnedOrderIds(restaurantId, tableParam, storedToken);
      }
      if (sessionKey) localStorage.removeItem(sessionKey);
      setSessionToken(null);
      setIsPaymentModalOpen(false);
      setPaymentBanner({
        ok: true,
        text: t("payment.paymentReceived", "Payment received successfully"),
      });
      // Strip the outcome param from the URL without triggering a navigation.
      params.delete("payment");
      const next = params.toString()
        ? `?${params.toString()}`
        : location.pathname;
      navigate(next, { replace: true });
    } else if (
      paymentOutcome === "borica-cancel" ||
      paymentOutcome === "epay-cancel" ||
      paymentOutcome === "mypos-cancel"
    ) {
      // Payment was cancelled — abandon any PENDING payment row so the customer
      // can choose a different provider without hitting the "already processing" guard.
      if (storedToken) {
        abandonCheckout(storedToken).catch(() => {});
      }
      clearHostedCheckoutMarker(storedToken);
      setIsPaymentModalOpen(false);
      setPaymentBanner({
        ok: false,
        text: t(
          "payment.paymentCancelled",
          "Payment cancelled — you can try again.",
        ),
      });
      params.delete("payment");
      const next = params.toString()
        ? `?${params.toString()}`
        : location.pathname;
      navigate(next, { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.search]);

  useEffect(() => {
    const abandonHostedCheckoutIfReturned = () => {
      const params = new URLSearchParams(window.location.search);
      if (params.get("payment")) return;

      const tableParam = params.get("table");
      const storedToken =
        (restaurantId && tableParam
          ? localStorage.getItem(`session-${restaurantId}-${tableParam}`)
          : sessionToken) ?? findHostedCheckoutToken(sessionStorage);

      if (!storedToken || !hasHostedCheckoutMarker(storedToken)) return;

      clearHostedCheckoutMarker(storedToken);
      setIsPaymentModalOpen(false);
      abandonCheckout(storedToken).catch(() => {});
    };

    abandonHostedCheckoutIfReturned();
    window.addEventListener("pageshow", abandonHostedCheckoutIfReturned);
    return () =>
      window.removeEventListener("pageshow", abandonHostedCheckoutIfReturned);
  }, [restaurantId, sessionToken, location.search]);
}
