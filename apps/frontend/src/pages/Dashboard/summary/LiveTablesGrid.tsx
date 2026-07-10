import { useTranslation } from "react-i18next";
import { MapPin } from "lucide-react";
import React from "react";
import { zoneLabel } from "../../../lib/zoneCatalog";

interface TableData {
  id: string;
  name: string;
  zoneId?: string | null;
  zoneName?: string | null;
  zoneKey?: string | null;
  status: "empty" | "occupied" | "paid";
  orderCount: number;
  customerNames: string[];
}

interface LiveTablesGridProps {
  tables: TableData[];
}

const LiveTablesGrid = ({ tables }: LiveTablesGridProps) => {
  const { t } = useTranslation();

  const sorted = [...tables].sort((a, b) => {
    if (a.zoneName && !b.zoneName) return -1;
    if (!a.zoneName && b.zoneName) return 1;
    if (a.zoneName && b.zoneName && a.zoneName !== b.zoneName)
      return a.zoneName.localeCompare(b.zoneName);
    return a.name.localeCompare(b.name, undefined, { numeric: true });
  });

  let lastZone = "";

  const statusConfig: Record<
    string,
    { bg: string; text: string; label: string }
  > = {
    empty: {
      bg: "bg-emerald-500/10",
      text: "text-emerald-500",
      label: t("dashboard.available"),
    },
    occupied: {
      bg: "bg-primary/10",
      text: "text-primary",
      label: t("tables.occupied"),
    },
    paid: {
      bg: "bg-amber-500/10",
      text: "text-amber-500",
      label: t("tables.paid"),
    },
  };

  return (
    <div className="glass-panel rounded-[1.5rem] p-5">
      <h3 className="text-sm font-display font-bold text-foreground mb-4">
        {t("dashboard.liveTables")}
      </h3>
      {tables.length === 0 ? (
        <p className="text-xs text-muted-foreground text-center py-8">
          {t("dashboard.noTablesConfigured")}
        </p>
      ) : (
        <div className="max-h-[420px] overflow-y-auto pr-1">
          <div className="grid grid-cols-5 gap-2">
            {sorted.map((table) => {
              const cfg = statusConfig[table.status] || statusConfig.empty;
              const showZone = table.zoneName && table.zoneName !== lastZone;
              if (showZone) lastZone = table.zoneName!;
              return (
                <React.Fragment key={table.id}>
                  {showZone && (
                    <div className="col-span-5 flex items-center gap-1.5 pt-2 first:pt-0">
                      <MapPin className="w-3 h-3 text-muted-foreground" />
                      <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
                        {zoneLabel(t, {
                          name: table.zoneName || "",
                          zoneKey: table.zoneKey || undefined,
                        })}
                      </span>
                    </div>
                  )}
                  <div
                    className={`rounded-lg p-2 border transition-all ${cfg.bg} border-transparent hover:border-border`}
                  >
                    <p className="text-[10px] font-bold text-foreground leading-tight">
                      {table.name}
                    </p>
                    <p
                      className={`text-[10px] font-bold uppercase mt-0.5 ${cfg.text}`}
                    >
                      {cfg.label}
                    </p>
                    {table.status !== "empty" && (
                      <div className="mt-1.5 flex flex-col gap-0.5">
                        {table.orderCount > 0 && (
                          <span className="text-[10px] text-muted-foreground">
                            {t("dashboard.ordersCount", {
                              count: table.orderCount,
                            })}
                          </span>
                        )}
                        {table.customerNames.length > 0 && (
                          <span className="text-[10px] text-muted-foreground truncate">
                            {table.customerNames.join(", ")}
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                </React.Fragment>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};

export default LiveTablesGrid;
