import { useEffect } from "react";
import type { Dispatch, MutableRefObject, SetStateAction } from "react";
import { useTranslation } from "react-i18next";
import { useSocket } from "../context/SocketContext";
import { getCategoryItems } from "../lib/api";
import type { PaymentBanner } from "./usePaymentReturn";

interface UseMenuSocketArgs {
  restaurantId: string | undefined;
  sessionToken: string | null;
  clearPaidSession: (message?: string) => void;
  pendingCashRequestId: string | null;
  setPendingCashRequestId: (id: string | null) => void;
  setIsPaymentModalOpen: (open: boolean) => void;
  setPaymentBanner: (banner: PaymentBanner | null) => void;
  setLoadedItemsMap: Dispatch<SetStateAction<Record<string, any[] | null>>>;
  activeLanguageRef: MutableRefObject<string>;
}

/**
 * Realtime pushes for the public menu:
 *  - the table-session room (when a session token exists): payment confirmed,
 *    bill paid, and cash-request status → clears the paid session / banners;
 *  - the anonymous public-menu room: live "86" — an item going out of stock is
 *    removed immediately; coming back in stock is re-fetched (guarded against a
 *    stale language resolving after a switch).
 */
export function useMenuSocket({
  restaurantId,
  sessionToken,
  clearPaidSession,
  pendingCashRequestId,
  setPendingCashRequestId,
  setIsPaymentModalOpen,
  setPaymentBanner,
  setLoadedItemsMap,
  activeLanguageRef,
}: UseMenuSocketArgs) {
  const { socket, isConnected } = useSocket();
  const { t } = useTranslation();

  useEffect(() => {
    if (!socket || !isConnected || !sessionToken) return;

    socket.emit("joinTableSessionRoom", { token: sessionToken });

    const handlePaymentConfirmed = () => {
      clearPaidSession();
    };

    const handleBillUpdated = (payload: { sessionPaid?: boolean }) => {
      if (payload?.sessionPaid) clearPaidSession();
    };

    const handleCashRequestUpdated = (request: {
      id?: string;
      status?: string;
    }) => {
      if (!pendingCashRequestId || request?.id !== pendingCashRequestId) return;
      if (request.status === "PAID") {
        clearPaidSession();
        return;
      }
      if (request.status === "CANCELLED") {
        setPendingCashRequestId(null);
        setIsPaymentModalOpen(false);
        setPaymentBanner({
          ok: false,
          text: t(
            "payment.cashRequestCancelled",
            "Staff cancelled this cash request. Please ask your waiter or try again.",
          ),
        });
      }
    };

    socket.on("payment:confirmed", handlePaymentConfirmed);
    socket.on("bill:updated", handleBillUpdated);
    socket.on("cashPaymentRequest:updated", handleCashRequestUpdated);

    return () => {
      socket.off("payment:confirmed", handlePaymentConfirmed);
      socket.off("bill:updated", handleBillUpdated);
      socket.off("cashPaymentRequest:updated", handleCashRequestUpdated);
      socket.emit("leaveTableSessionRoom", { token: sessionToken });
    };
  }, [
    clearPaidSession,
    isConnected,
    pendingCashRequestId,
    sessionToken,
    socket,
    t,
  ]);

  // Live "86" push: anonymous room, no auth required (restaurantId is already
  // public in the menu URL). Item going out of stock is removed immediately
  // (mirrors the public API, which never returns out-of-stock items); an item
  // coming back in stock is re-fetched so it arrives with full translated data.
  useEffect(() => {
    if (!socket || !isConnected || !restaurantId) return;

    socket.emit("joinPublicMenuRoom", restaurantId);

    const handleAvailabilityChanged = (payload: {
      itemId?: string;
      categoryId?: string;
      isOutOfStock?: boolean;
    }) => {
      const { itemId, categoryId, isOutOfStock } = payload ?? {};
      if (!itemId || !categoryId) return;

      if (isOutOfStock) {
        setLoadedItemsMap((prev) => {
          const items = prev[categoryId];
          if (!Array.isArray(items)) return prev;
          return {
            ...prev,
            [categoryId]: items.filter((it: any) => it.id !== itemId),
          };
        });
        return;
      }

      // Guard against a language switch resolving after this one — otherwise
      // a slower fetch in the old language can overwrite the faster,
      // already-applied fetch from loadAllCategoryItems in the new language.
      const requestedLang = activeLanguageRef.current;
      void getCategoryItems(
        restaurantId,
        categoryId,
        requestedLang || undefined,
      )
        .then((items) => {
          if (activeLanguageRef.current !== requestedLang) return;
          setLoadedItemsMap((prev) => ({ ...prev, [categoryId]: items }));
        })
        .catch(() => {
          // Transient fetch failure — item will appear on next full menu load.
        });
    };

    socket.on("menu:item-availability-changed", handleAvailabilityChanged);

    return () => {
      socket.off("menu:item-availability-changed", handleAvailabilityChanged);
      socket.emit("leavePublicMenuRoom", restaurantId);
    };
  }, [isConnected, restaurantId, socket]);
}
