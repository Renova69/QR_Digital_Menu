import { useState, useEffect, useContext } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import api from "../../lib/api";
import { usePos } from "../../context/PosContext";
import { useAuth } from "../../context/AuthContext";
import { useSocket } from "../../context/SocketContext";
import { useIdleTimer } from "../../hooks/useIdleTimer";
import RestaurantContext from "../../context/RestaurantContext";
import { useFeature } from "../../hooks/useFeature";
import PosTopBar from "../../components/pos/PosTopBar";
import PosCategoryFilter from "../../components/pos/PosCategoryFilter";
import PosItemGrid from "../../components/pos/PosItemGrid";
import PosTableModal from "../../components/pos/PosTableModal";
import PosOptionsDrawer from "../../components/pos/PosOptionsDrawer";
import PosSeatSelector from "../../components/pos/PosSeatSelector";
import PosCartDrawer from "../../components/pos/PosCartDrawer";

interface MenuItem {
  id: string;
  name: string;
  price: number;
  categoryId: string;
  options?: Array<{
    id: string;
    name: string;
    type: "VARIATION" | "ADDON";
    required: boolean;
    choices: Array<{ name: string; priceModifier: number }>;
  }>;
}

interface Category {
  id: string;
  name: string;
}

export default function PosPage() {
  const restaurantCtx = useContext(RestaurantContext);
  const activeRestaurant = restaurantCtx?.activeRestaurant ?? null;
  const { session, items, getTotal, clearSession } = usePos();
  const { logout } = useAuth();
  const { socket } = useSocket();
  const { t } = useTranslation();
  const navigate = useNavigate();
  const canPos = useFeature("pos");
  const [paidNotice, setPaidNotice] = useState<string | null>(null);

  // When the customer pays via the Payment QR, the backend emits
  // `payment:confirmed`. If it's for the table this waiter currently has open,
  // clear the bill and surface a notice — otherwise the POS hangs on a stale
  // open table (Bug 1).
  useEffect(() => {
    if (!socket) return;
    const onPaid = (data: {
      tableSessionId?: string;
      tableNumber?: string;
    }) => {
      if (
        data?.tableSessionId &&
        session?.sessionId &&
        data.tableSessionId === session.sessionId
      ) {
        setPaidNotice(data.tableNumber ?? session.tableName ?? "");
        clearSession();
      }
    };
    socket.on("payment:confirmed", onPaid);
    return () => {
      socket.off("payment:confirmed", onPaid);
    };
  }, [socket, session?.sessionId, session?.tableName, clearSession]);

  useEffect(() => {
    if (!paidNotice) return;
    const timer = setTimeout(() => setPaidNotice(null), 8000);
    return () => clearTimeout(timer);
  }, [paidNotice]);

  useEffect(() => {
    if (activeRestaurant && !canPos) {
      navigate("/dashboard", { replace: true });
    }
  }, [activeRestaurant, canPos, navigate]);

  useIdleTimer(
    () => {
      // Cart is persisted to sessionStorage — restored on next login
      logout();
      navigate("/device-login", { replace: true });
    },
    10 * 60 * 1000,
  ); // 10 min — longer for POS context

  const [menuItems, setMenuItems] = useState<MenuItem[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [menuLoading, setMenuLoading] = useState(false);
  const [menuError, setMenuError] = useState<string | null>(null);

  useEffect(() => {
    if (!activeRestaurant) return;

    const controller = new AbortController();
    setMenuLoading(true);
    setMenuError(null);

    api
      .get(`/menu/public/${activeRestaurant.id}`, { signal: controller.signal })
      .then((res) => {
        const cats: Category[] =
          res.data.categories?.map((c: any) => ({
            id: c.id,
            name: c.name,
          })) ?? [];
        setCategories(cats);

        const allItems: MenuItem[] = [];
        for (const cat of res.data.categories ?? []) {
          for (const item of cat.items ?? []) {
            allItems.push({ ...item, categoryId: cat.id });
          }
        }
        setMenuItems(allItems);
      })
      .catch((err) => {
        if (err?.name !== "CanceledError" && err?.code !== "ERR_CANCELED") {
          setMenuError("Failed to load menu. Check your connection.");
        }
      })
      .finally(() => setMenuLoading(false));

    return () => controller.abort();
  }, [activeRestaurant]);

  const itemCount = items.reduce((sum, i) => sum + i.quantity, 0);
  const total = getTotal();

  return (
    <>
      {paidNotice && (
        <div className="fixed top-4 left-1/2 z-50 flex max-w-[92vw] -translate-x-1/2 items-center gap-3 rounded-xl bg-success px-4 py-3 text-success-foreground shadow-lg">
          <span className="text-sm font-semibold">
            {t("pos.tablePaid", "Table {{name}} paid — bill cleared", {
              name: paidNotice,
            })}
          </span>
          <button
            type="button"
            onClick={() => setPaidNotice(null)}
            className="text-lg leading-none text-success-foreground/80 hover:text-success-foreground"
            aria-label={t("common.close", "Close")}
          >
            ×
          </button>
        </div>
      )}

      {session && (
        <div className="sticky top-0 z-10 bg-background pt-safe">
          <PosTopBar />
          <PosCategoryFilter categories={categories} menuError={menuError} />
        </div>
      )}

      {session ? (
        <div className="flex-1 overflow-y-auto">
          <PosItemGrid
            items={menuItems}
            loading={menuLoading}
            error={menuError}
          />
        </div>
      ) : (
        <div className="flex-1" />
      )}

      {session && (
        <div className="sticky bottom-0 z-10 bg-background border-t border-border pb-safe">
          <PosSeatSelector />
          <PosCartDrawer itemCount={itemCount} total={total} />
        </div>
      )}

      <PosTableModal />
      <PosOptionsDrawer />
    </>
  );
}
