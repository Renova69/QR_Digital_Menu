import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { getServicePoints, type ServicePoint } from "../../lib/api";

// Minimal shape PosTableModal.handleSelect actually reads — a service-point
// session is adapted into this so the existing settlement flow (bill fetch,
// setSession, resetCart) is reused unchanged, not duplicated.
export interface PosServicePointRow {
  id: string;
  name: string;
  status: "occupied";
  sessionId: string;
  sessionToken: string;
  orderCount: number;
  totalAmount: number;
  customerNames: string[];
  sessionStatus: string;
  updatedAt: string;
}

interface PosServicePointListProps {
  restaurantId: string;
  onSelect: (row: PosServicePointRow) => void;
}

export default function PosServicePointList({
  restaurantId,
  onSelect,
}: PosServicePointListProps) {
  const { t } = useTranslation();
  const [servicePoints, setServicePoints] = useState<ServicePoint[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!restaurantId) return;
    let ignore = false;
    setLoading(true);
    getServicePoints(restaurantId)
      .then((data) => {
        if (!ignore) setServicePoints(data);
      })
      .catch(() => {
        // Service points are an optional/tier-gated add-on to the table grid
        // — a 403 (feature not entitled) or network hiccup here should not
        // block the primary table-picker flow, so fail silently.
        if (!ignore) setServicePoints([]);
      })
      .finally(() => {
        if (!ignore) setLoading(false);
      });
    return () => {
      ignore = true;
    };
  }, [restaurantId]);

  const rows = servicePoints.flatMap((sp) =>
    (sp.activeSessions ?? []).map((session, idx) => ({
      id: sp.id,
      name:
        (sp.activeSessions?.length ?? 0) > 1
          ? `${sp.name} #${idx + 1}`
          : sp.name,
      status: "occupied" as const,
      sessionId: session.sessionId,
      sessionToken: session.sessionToken,
      orderCount: session.orderCount,
      totalAmount: session.totalAmount,
      customerNames: [],
      sessionStatus: "OPEN",
      updatedAt: session.createdAt,
    })),
  );

  if (loading || rows.length === 0) return null;

  return (
    <div className="mb-4">
      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">
        {t("pos.activeServicePoints", "Active Service Points")}
      </p>
      <div className="grid grid-cols-3 gap-3">
        {rows.map((row) => (
          <button
            key={row.sessionId}
            type="button"
            onClick={() => onSelect(row)}
            className="relative flex flex-col items-center justify-center p-4 rounded-lg border-2 min-h-[80px] transition-none bg-destructive/10 border-destructive/40 text-foreground"
          >
            <span className="text-lg font-extrabold">{row.name}</span>
            <span className="text-sm font-semibold">
              {t("pos.tableStatus.occupied", "Occupied")}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}
