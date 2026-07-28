import React, { useContext, useMemo, useRef, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { getTableOrders, getTableStatuses, closeSession } from "../../lib/api";
import { useTranslation } from "react-i18next";
import RestaurantContext from "../../context/RestaurantContext";
import { useSocket } from "../../context/SocketContext";
import TableCard from "../../components/tables/TableCard";
import TableDetailModal from "../../components/tables/TableDetailModal";
import { cn } from "../../lib/utils";
import {
  CheckCircle2,
  CircleDollarSign,
  Grid3X3,
  Search,
  Timer,
  Users,
} from "lucide-react";

type FilterMode = "active" | "occupied" | "paid" | "all";

const filterConfig: Array<{
  id: FilterMode;
  labelKey: string;
  fallback: string;
  Icon: typeof Grid3X3;
}> = [
  { id: "active", labelKey: "tables.active", fallback: "Active", Icon: Timer },
  {
    id: "occupied",
    labelKey: "tables.occupied",
    fallback: "Occupied",
    Icon: Users,
  },
  {
    id: "paid",
    labelKey: "tables.paid",
    fallback: "Paid",
    Icon: CircleDollarSign,
  },
  { id: "all", labelKey: "tables.allTables", fallback: "All", Icon: Grid3X3 },
];

const LiveTablesView: React.FC = () => {
  const { activeRestaurant: restaurant } = useContext(RestaurantContext) as any;
  const restaurantId = restaurant?.id;
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const { socket, isConnected } = useSocket();
  const [filter, setFilter] = useState<FilterMode>("active");
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedTable, setSelectedTable] = useState<any>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [tableOrders, setTableOrders] = useState<any[]>([]);
  const [ordersLoading, setOrdersLoading] = useState(false);
  const [ordersError, setOrdersError] = useState(false);
  const tableRequestVersion = useRef(0);

  const {
    data: tables,
    isLoading,
    error,
  } = useQuery({
    queryKey: ["tableStatuses", restaurantId],
    queryFn: () => getTableStatuses(restaurantId),
    enabled: !!restaurantId,
  });

  React.useEffect(() => {
    if (!socket || !isConnected || !restaurantId) return;

    const handleTableInvalidation = () => {
      queryClient.invalidateQueries({
        queryKey: ["tableStatuses", restaurantId],
      });
    };

    socket.on("table:status-changed", handleTableInvalidation);
    socket.on("table:updated", handleTableInvalidation);
    void queryClient.invalidateQueries({
      queryKey: ["tableStatuses", restaurantId],
    });
    return () => {
      socket.off("table:status-changed", handleTableInvalidation);
      socket.off("table:updated", handleTableInvalidation);
    };
  }, [socket, isConnected, restaurantId, queryClient]);

  React.useEffect(() => {
    tableRequestVersion.current += 1;
    setSelectedTable(null);
    setTableOrders([]);
    setModalOpen(false);
    setOrdersLoading(false);
    setOrdersError(false);
  }, [restaurantId]);

  const stats = useMemo(() => {
    const source = tables ?? [];
    return {
      total: source.length,
      active: source.filter((table: any) => table.status !== "empty").length,
      occupied: source.filter((table: any) => table.status === "occupied")
        .length,
      paid: source.filter((table: any) => table.status === "paid").length,
      revenue: source.reduce(
        (sum: number, table: any) => sum + Number(table.totalAmount ?? 0),
        0,
      ),
    };
  }, [tables]);

  const filteredTables = useMemo(() => {
    if (!tables) return [];
    const query = searchTerm.trim().toLowerCase();

    return tables
      .filter((table: any) => {
        switch (filter) {
          case "active":
            return table.status !== "empty";
          case "occupied":
            return table.status === "occupied";
          case "paid":
            return table.status === "paid";
          case "all":
            return true;
        }
      })
      .filter((table: any) => {
        if (!query) return true;
        return String(table.name ?? "")
          .toLowerCase()
          .includes(query);
      });
  }, [tables, filter, searchTerm]);

  const counts: Record<FilterMode, number> = {
    active: stats.active,
    occupied: stats.occupied,
    paid: stats.paid,
    all: stats.total,
  };

  const handleTableClick = async (table: any) => {
    const requestVersion = ++tableRequestVersion.current;
    setSelectedTable(table);
    setModalOpen(true);
    setTableOrders([]);
    setOrdersError(false);
    if (!restaurantId || table.status === "empty") return;
    setOrdersLoading(true);
    try {
      const orders = await getTableOrders(table.id, restaurantId);
      if (tableRequestVersion.current !== requestVersion) return;
      setTableOrders(orders);
    } catch {
      if (tableRequestVersion.current !== requestVersion) return;
      setTableOrders([]);
      setOrdersError(true);
    } finally {
      if (tableRequestVersion.current === requestVersion) {
        setOrdersLoading(false);
      }
    }
  };

  const closeSessionMutation = useMutation({
    mutationFn: (token: string) => closeSession(token, restaurantId),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["tableStatuses", restaurantId],
      });
      queryClient.invalidateQueries({
        queryKey: ["tableSessions", restaurantId],
      });
      setModalOpen(false);
    },
  });

  // Force-close an open session (no payment) from the live table detail. Guarded
  // by a confirm that surfaces the table + the open bill being discarded.
  const handleCloseSession = () => {
    if (!selectedTable?.sessionToken) return;
    const confirmed = window.confirm(
      t(
        "auto.closeSessionConfirm",
        "Close the session for table {{table}}? The open bill of €{{amount}} will be discarded with no payment recorded.",
        {
          table: selectedTable.name,
          amount: Number(selectedTable.totalAmount ?? 0).toFixed(2),
        },
      ),
    );
    if (confirmed) closeSessionMutation.mutate(selectedTable.sessionToken);
  };

  if (isLoading) {
    return (
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
        {[...Array(8)].map((_, index) => (
          <div
            key={index}
            className="aspect-[1.08/1] animate-pulse rounded-lg bg-muted/50"
          />
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex min-h-[300px] items-center justify-center rounded-lg border border-dashed border-border bg-card p-8 text-center">
        <div>
          <p className="mb-4 font-bold text-muted-foreground">
            {t("tables.failedLoadTables")}
          </p>
          <button
            onClick={() =>
              queryClient.invalidateQueries({
                queryKey: ["tableStatuses", restaurantId],
              })
            }
            className="rounded-lg bg-primary px-4 py-2 text-sm font-black text-white"
          >
            {t("tables.retry")}
          </button>
        </div>
      </div>
    );
  }

  if (!tables || tables.length === 0) {
    return (
      <div className="flex min-h-[360px] items-center justify-center rounded-lg border border-dashed border-border bg-card p-8 text-center">
        <div>
          <Grid3X3 className="mx-auto mb-4 h-12 w-12 text-muted-foreground/40" />
          <p className="font-bold text-muted-foreground">
            {t("tables.noTablesCreated")}
          </p>
        </div>
      </div>
    );
  }

  return (
    <section>
      <div className="mb-6 grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div className="rounded-lg border border-border bg-card px-4 py-3 shadow-sm">
          <p className="text-[10px] font-black uppercase tracking-[0.16em] text-muted-foreground">
            {t("tables.totalTables")}
          </p>
          <p className="mt-1 text-2xl font-black text-foreground">
            {stats.total}
          </p>
        </div>
        <div className="rounded-lg border border-primary/20 bg-primary/10 px-4 py-3 shadow-sm">
          <p className="text-[10px] font-black uppercase tracking-[0.16em] text-primary">
            {t("tables.active")}
          </p>
          <p className="mt-1 text-2xl font-black text-primary">
            {stats.active}
          </p>
        </div>
        <div className="rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 shadow-sm dark:border-blue-400/20 dark:bg-blue-400/10">
          <p className="text-[10px] font-black uppercase tracking-[0.16em] text-blue-700 dark:text-blue-200">
            {t("tables.openValue")}
          </p>
          <p className="mt-1 text-2xl font-black text-blue-700 dark:text-blue-200">
            {t("auto.Euro", "€")}
            {stats.revenue.toFixed(2)}
          </p>
        </div>
      </div>

      <div className="mb-6 flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
        <div className="grid grid-cols-2 gap-2 sm:block sm:overflow-x-auto sm:hide-scrollbar">
          <div className="contents sm:inline-flex sm:min-w-max sm:items-center sm:gap-1 sm:rounded-lg sm:border sm:border-border sm:bg-card sm:p-1 sm:shadow-sm">
            {filterConfig.map(({ id, labelKey, fallback, Icon }) => {
              const active = filter === id;
              return (
                <button
                  key={id}
                  type="button"
                  onClick={() => setFilter(id)}
                  className={cn(
                    "flex h-11 w-full items-center gap-2 rounded-lg border px-3 text-sm font-bold shadow-sm transition active:scale-[0.98] sm:h-9 sm:w-auto sm:rounded-md sm:border-0 sm:px-4 sm:shadow-none",
                    active
                      ? "border-primary bg-primary text-white shadow-[0_8px_18px_-10px_rgba(110,86,248,0.8)]"
                      : "border-border bg-card text-muted-foreground hover:bg-muted hover:text-foreground sm:bg-transparent",
                  )}
                >
                  <Icon className="h-4 w-4" />
                  <span>{t(labelKey, fallback)}</span>
                  <span
                    className={cn(
                      "flex h-5 min-w-6 items-center justify-center rounded-full px-2 text-[11px] font-black",
                      active
                        ? "bg-white/20 text-white"
                        : "bg-muted text-muted-foreground",
                    )}
                  >
                    {counts[id]}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        <div className="relative xl:w-80">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            value={searchTerm}
            onChange={(event) => setSearchTerm(event.target.value)}
            placeholder={t("tables.searchTable")}
            className="h-10 w-full rounded-lg border border-border bg-card pl-10 pr-3 text-sm font-medium text-foreground shadow-sm outline-none transition placeholder:text-muted-foreground/70 focus:border-primary focus:ring-2 focus:ring-primary/15"
          />
        </div>
      </div>

      {filteredTables.length === 0 ? (
        <div className="flex min-h-[280px] items-center justify-center rounded-lg border border-dashed border-border bg-card p-8 text-center">
          <div>
            <CheckCircle2 className="mx-auto mb-4 h-12 w-12 text-muted-foreground/40" />
            <p className="font-bold text-muted-foreground">
              {t("tables.allFree")}
            </p>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 items-start gap-4 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
          {filteredTables.map((table: any) => (
            <TableCard
              key={table.id}
              name={table.name}
              status={table.status}
              orderCount={table.orderCount}
              customerCount={table.customerNames.length}
              customerNames={table.customerNames}
              totalAmount={table.totalAmount}
              updatedAt={table.updatedAt}
              onClick={() => handleTableClick(table)}
            />
          ))}
        </div>
      )}

      <TableDetailModal
        open={modalOpen}
        onOpenChange={(open) => {
          setModalOpen(open);
          if (!open) {
            tableRequestVersion.current += 1;
            setOrdersLoading(false);
          }
        }}
        table={selectedTable}
        orders={tableOrders}
        ordersLoading={ordersLoading}
        ordersError={ordersError}
        paymentInfo={
          selectedTable?.status === "paid"
            ? { amount: selectedTable.totalAmount }
            : null
        }
        onCloseSession={handleCloseSession}
        closing={closeSessionMutation.isPending}
      />
    </section>
  );
};

export default LiveTablesView;
