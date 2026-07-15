import { MapPin } from "lucide-react";
import { useTranslation } from "react-i18next";
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
    if (a.zoneName && b.zoneName && a.zoneName !== b.zoneName) {
      return a.zoneName.localeCompare(b.zoneName);
    }
    return a.name.localeCompare(b.name, undefined, { numeric: true });
  });

  const statusConfig: Record<
    TableData["status"],
    {
      surface: string;
      border: string;
      dot: string;
      text: string;
      label: string;
    }
  > = {
    empty: {
      surface: "bg-emerald-500/5",
      border: "border-l-emerald-500/70",
      dot: "bg-emerald-500",
      text: "text-emerald-600 dark:text-emerald-400",
      label: t("dashboard.available"),
    },
    occupied: {
      surface: "bg-primary/5",
      border: "border-l-primary/70",
      dot: "bg-primary",
      text: "text-primary",
      label: t("tables.occupied"),
    },
    paid: {
      surface: "bg-amber-500/5",
      border: "border-l-amber-500/70",
      dot: "bg-amber-500",
      text: "text-amber-600 dark:text-amber-400",
      label: t("tables.paid"),
    },
  };

  const groups = sorted.reduce<
    Array<{
      key: string;
      name: string | null;
      zoneKey: string | null;
      tables: TableData[];
    }>
  >((result, table) => {
    const key = table.zoneId ?? table.zoneName ?? "unassigned";
    const current = result[result.length - 1];
    if (!current || current.key !== key) {
      result.push({
        key,
        name: table.zoneName ?? null,
        zoneKey: table.zoneKey ?? null,
        tables: [table],
      });
    } else {
      current.tables.push(table);
    }
    return result;
  }, []);

  return (
    <div className="glass-panel rounded-[1.5rem] p-5">
      <h3 className="mb-4 text-sm font-display font-bold text-foreground">
        {t("dashboard.liveTables")}
      </h3>
      {tables.length === 0 ? (
        <p className="py-8 text-center text-xs text-muted-foreground">
          {t("dashboard.noTablesConfigured")}
        </p>
      ) : (
        <div className="max-h-[460px] space-y-5 overflow-y-auto pr-1">
          {groups.map((group) => (
            <section key={group.key} className="min-w-0">
              {group.name && (
                <div className="mb-2.5 flex min-w-0 items-center gap-1.5">
                  <MapPin className="h-3 w-3 shrink-0 text-muted-foreground" />
                  <span className="truncate text-[10px] font-semibold uppercase text-muted-foreground">
                    {zoneLabel(t, {
                      name: group.name,
                      zoneKey: group.zoneKey || undefined,
                    })}
                  </span>
                </div>
              )}
              <div className="grid grid-cols-[repeat(auto-fit,minmax(128px,1fr))] gap-2.5">
                {group.tables.map((table) => {
                  const config = statusConfig[table.status];
                  const customerNames = table.customerNames.join(", ");

                  return (
                    <div
                      key={table.id}
                      className={`min-h-[92px] min-w-0 rounded-lg border border-border/60 border-l-2 p-3 transition-colors hover:border-border ${config.surface} ${config.border}`}
                    >
                      <div className="flex min-w-0 items-start justify-between gap-2">
                        <p
                          className="min-w-0 truncate text-xs font-bold text-foreground"
                          title={table.name}
                        >
                          {table.name}
                        </p>
                        <span
                          className={`mt-1 h-2 w-2 shrink-0 rounded-full ${config.dot}`}
                        />
                      </div>
                      <p
                        className={`mt-1 break-words text-[10px] font-bold leading-tight ${config.text}`}
                      >
                        {config.label}
                      </p>
                      {table.status !== "empty" && (
                        <div className="mt-2 min-w-0 space-y-0.5 border-t border-border/40 pt-2">
                          {table.orderCount > 0 && (
                            <p className="text-[10px] leading-tight text-muted-foreground">
                              {t("dashboard.ordersCount", {
                                count: table.orderCount,
                              })}
                            </p>
                          )}
                          {customerNames && (
                            <p
                              className="truncate text-[10px] leading-tight text-muted-foreground"
                              title={customerNames}
                            >
                              {customerNames}
                            </p>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  );
};

export default LiveTablesGrid;
