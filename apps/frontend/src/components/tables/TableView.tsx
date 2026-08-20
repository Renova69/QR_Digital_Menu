import React, { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  createTable,
  deleteTable,
  getTables,
  getTableSessions,
  getZones,
  createZone,
  updateZone,
  deleteZone,
  reorderZones,
  updateTable,
  getLogoBase64,
  commitRestaurantSlug,
} from "../../lib/api";
import type { ServicePointType, TableZone } from "../../lib/api";
import {
  ZONE_CATALOG_KEYS,
  humanizeZoneKey,
  zoneLabel,
} from "../../lib/zoneCatalog";
import { useTranslation } from "react-i18next";
import {
  ArrowDown,
  ArrowUp,
  Copy,
  Edit2,
  Eye,
  Hotel,
  LayoutGrid,
  MapPin,
  Plus,
  Printer,
  QrCode,
  Search,
  Trash2,
  Check,
  X,
} from "lucide-react";
import PrintableQRCodes, {
  PrintOrientation,
  PrintTemplate,
} from "./PrintableQRCodes";
import ServicePointsTab from "./ServicePointsTab";
import QrCodeModal, { type QrCodeTarget } from "./QrCodeModal";
import RestaurantContext from "../../context/RestaurantContext";
import LiveTablesView from "../../pages/Dashboard/LiveTablesView";
import { useFeature, useTier, type FeatureFlag } from "../../hooks/useFeature";
import { cn } from "../../lib/utils";
import { useAuth } from "../../context/AuthContext";
import { copyToClipboard, normalizeTableName } from "../../lib/tableViewUtils";
import { getMenuUrl } from "../../lib/menuUrl";
import { DashboardButton } from "../dashboard/DashboardButton";
import { dashboardSurface } from "../dashboard/dashboardUi";

const templateOptions: Array<{ value: PrintTemplate; label: string }> = [
  { value: "classic", label: "Classic" },
  { value: "premium", label: "Premium" },
  { value: "minimal", label: "Minimal" },
];

const orientationOptions: Array<{ value: PrintOrientation; label: string }> = [
  { value: "portrait", label: "Portrait" },
  { value: "landscape", label: "Landscape" },
];

const ONLINE_PAYMENT_FEATURES: FeatureFlag[] = [
  "payments:stripe",
  "payments:epay",
  "payments:borica",
  "payments:mypos",
];

const SESSION_STATUS_LABEL_KEYS: Record<string, string> = {
  OPEN: "tables.status.open",
  PAID: "tables.status.paid",
  CLOSED_NO_PAYMENT: "tables.status.closedNoPayment",
};

function humanizeSessionStatus(status: string): string {
  return status
    .replace(/_/g, " ")
    .toLowerCase()
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

type TablesSubTab = "live" | "qr" | "zones" | "service-points";

const TableView: React.FC = () => {
  const { activeRestaurant: restaurant } = React.useContext(
    RestaurantContext,
  ) as any;
  const restaurantId = restaurant?.id;
  const queryClient = useQueryClient();
  const [newTableName, setNewTableName] = useState("");
  const [newTableZoneId, setNewTableZoneId] = useState<string>("");
  const [tableSearch, setTableSearch] = useState("");
  const [isQrModalOpen, setIsQrModalOpen] = useState(false);
  const [selectedTable, setSelectedTable] = useState<QrCodeTarget | null>(null);
  const [copiedTableId, setCopiedTableId] = useState<string | null>(null);
  const [logoDataUrl, setLogoDataUrl] = useState<string | null>(null);
  const { t } = useTranslation();
  const { tier, features } = useTier();
  const canManageServicePoints = useFeature("service-points");
  const canAcceptOnlinePayments =
    !!restaurant?.paymentsEnabled &&
    ONLINE_PAYMENT_FEATURES.some((feature) => features.includes(feature));
  const { user } = useAuth();
  const isManagerOrOwner = user?.role === "OWNER" || user?.role === "MANAGER";
  const isFree = tier === "FREE";
  const defaultTab: TablesSubTab = !isManagerOrOwner
    ? "live"
    : isFree
      ? "qr"
      : "live";
  const [subTab, setSubTab] = useState<TablesSubTab>(defaultTab);
  const [printTemplate, setPrintTemplate] = useState<PrintTemplate>("classic");
  const [printOrientation, setPrintOrientation] =
    useState<PrintOrientation>("portrait");

  // `subTab` is seeded once from `isFree`, which resolves asynchronously
  // (useTier falls back to a cached tier first). If the authoritative tier
  // arrives as FREE after mount, the "Live" tab button is hidden — redirect
  // away so a FREE user isn't stranded on a view with no active nav (#M12).
  useEffect(() => {
    if (isFree && subTab === "live") setSubTab("qr");
  }, [isFree, subTab]);

  useEffect(() => {
    if (subTab === "service-points" && !canManageServicePoints) {
      setSubTab(isFree ? "qr" : "live");
    }
  }, [canManageServicePoints, isFree, subTab]);

  const { data: tables, isLoading } = useQuery({
    queryKey: ["tables", restaurantId],
    queryFn: () => getTables(restaurantId),
    enabled: !!restaurantId,
  });

  const createMutation = useMutation({
    mutationFn: ({ name, zoneId }: { name: string; zoneId?: string }) =>
      createTable(restaurantId, name, zoneId || undefined),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["tables", restaurantId] });
      queryClient.invalidateQueries({
        queryKey: ["servicePoints", restaurantId],
      });
      queryClient.invalidateQueries({
        queryKey: ["tableStatuses", restaurantId],
      });
      queryClient.invalidateQueries({ queryKey: ["zones", restaurantId] });
      setNewTableName("");
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteTable(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["tables", restaurantId] });
      queryClient.invalidateQueries({
        queryKey: ["servicePoints", restaurantId],
      });
      queryClient.invalidateQueries({
        queryKey: ["tableStatuses", restaurantId],
      });
      queryClient.invalidateQueries({ queryKey: ["zones", restaurantId] });
    },
  });

  // The Tables tab itself is FREE-entitled (qr:manage), but this endpoint is
  // not: GET /payments/sessions/:restaurantId is guarded by
  // RequireFeature(PAYMENTS_STRIPE), i.e. PROFESSIONAL+. Without the
  // entitlement check the query 403s on every FREE and STARTER tenant and,
  // because of refetchInterval, keeps doing so every 30s for as long as the
  // tab is open. Mirror the server-side flag exactly.
  const canPayments = useFeature("payments:stripe");

  const { data: sessions } = useQuery({
    queryKey: ["tableSessions", restaurantId],
    queryFn: () => getTableSessions(restaurantId),
    enabled: !!restaurantId && canPayments,
    refetchInterval: 30000,
  });

  const sessionByTableId = useMemo(() => {
    const map = new Map<string, { token: string; status: string }>();
    (sessions || []).forEach((session: any) =>
      map.set(session.tableId, {
        token: session.token,
        status: session.status,
      }),
    );
    return map;
  }, [sessions]);

  const filteredTables = useMemo(() => {
    const query = tableSearch.trim().toLowerCase();
    return (tables || []).filter((table: any) => {
      if (!query) return true;
      return String(table.name ?? "")
        .toLowerCase()
        .includes(query);
    });
  }, [tableSearch, tables]);

  const normalizedNewTableName = normalizeTableName(newTableName);
  const duplicateTable = useMemo(() => {
    if (!normalizedNewTableName) return false;
    return (tables || []).some(
      (table: any) => normalizeTableName(table.name) === normalizedNewTableName,
    );
  }, [normalizedNewTableName, tables]);

  const tableStats = useMemo(() => {
    const tableCount = tables?.length ?? 0;
    // Service points (ROOM/PICKUP/OTHER) intentionally allow many concurrent
    // OPEN/PAID sessions per tableId (one per guest), unlike physical tables.
    // Counting them here would inflate/desync these badges the moment any
    // service point exists, since tableCount is TABLE-only.
    const physicalSessions = (sessions || []).filter(
      (session: any) => !session.isServicePoint,
    );
    const activeSessions = physicalSessions.filter(
      (session: any) => session.status === "OPEN",
    ).length;
    const paidSessions = physicalSessions.filter(
      (session: any) => session.status === "PAID",
    ).length;
    return { tableCount, activeSessions, paidSessions };
  }, [sessions, tables]);

  // ── Zone state ──────────────────────────────────────────────────────────
  const [newZoneName, setNewZoneName] = useState("");
  // "" = nothing picked, a catalog key, or "__custom__" for a free-text zone.
  const [newZoneKey, setNewZoneKey] = useState("");
  const [editingZoneId, setEditingZoneId] = useState<string | null>(null);
  const [editingZoneName, setEditingZoneName] = useState("");

  const { data: zones } = useQuery({
    queryKey: ["zones", restaurantId],
    queryFn: () => getZones(restaurantId),
    enabled: !!restaurantId,
  });

  // Initialize zone dropdown to first zone when zones load
  useEffect(() => {
    if (zones && zones.length > 0 && !newTableZoneId) {
      const sorted = [...zones].sort((a, b) => a.displayOrder - b.displayOrder);
      setNewTableZoneId(sorted[0].id);
    }
  }, [zones]);

  const zoneInvalidate = () => {
    queryClient.invalidateQueries({ queryKey: ["zones", restaurantId] });
    queryClient.invalidateQueries({ queryKey: ["tables", restaurantId] });
    queryClient.invalidateQueries({
      queryKey: ["tableStatuses", restaurantId],
    });
  };

  const createZoneMutation = useMutation({
    mutationFn: (input: { name: string; zoneKey: string | null }) =>
      createZone(restaurantId, input.name, input.zoneKey),
    onSuccess: () => {
      zoneInvalidate();
      setNewZoneName("");
      setNewZoneKey("");
    },
  });

  const updateZoneMutation = useMutation({
    mutationFn: ({
      zoneId,
      data,
    }: {
      zoneId: string;
      data: { name?: string; displayOrder?: number };
    }) => updateZone(zoneId, data),
    onSuccess: () => zoneInvalidate(),
  });

  const deleteZoneMutation = useMutation({
    mutationFn: (zoneId: string) => deleteZone(zoneId),
    onSuccess: () => zoneInvalidate(),
  });

  const reorderZonesMutation = useMutation({
    mutationFn: (items: { id: string; displayOrder: number }[]) =>
      reorderZones(restaurantId, items),
    onSuccess: () => zoneInvalidate(),
  });

  const updateTableMutation = useMutation({
    mutationFn: ({
      tableId,
      data,
    }: {
      tableId: string;
      data: { name?: string; zoneId?: string | null };
    }) => updateTable(tableId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["tables", restaurantId] });
      queryClient.invalidateQueries({
        queryKey: ["tableStatuses", restaurantId],
      });
      queryClient.invalidateQueries({ queryKey: ["zones", restaurantId] });
    },
  });

  // ── Bulk QR print: commit-before-print ──────────────────────────────────
  // PrintableQRCodes is mounted the instant the QR tab is shown (well
  // before this button is pressed), so simply viewing the tables screen
  // must never call commitRestaurantSlug — that would silently end the
  // slug's edit-grace window on every page view. The commit is tied to
  // print *intent* instead: only this button's click fires it. See the
  // gating comment in PrintableQRCodes.tsx for how the sheet itself stays
  // free of real QR codes (even against a bare Ctrl+P) until this resolves.
  const printSlugMutation = useMutation({
    mutationFn: () => commitRestaurantSlug(restaurantId as string),
  });
  const [pendingPrint, setPendingPrint] = useState(false);

  // window.print() must run strictly after PrintableQRCodes has re-rendered
  // with either the frozen slug or the permanent legacy-id fallback, not
  // from a mutation callback. A callback can fire before React has committed
  // the new props to the DOM, which would let the browser capture the sheet
  // mid-transition. Waiting on the settled mutation state guarantees the
  // DOM already holds the real QR codes first.
  useEffect(() => {
    if (
      pendingPrint &&
      (printSlugMutation.isSuccess || printSlugMutation.isError)
    ) {
      window.print();
      setPendingPrint(false);
    }
  }, [
    pendingPrint,
    printSlugMutation.isSuccess,
    printSlugMutation.isError,
    printSlugMutation.data,
  ]);

  const handlePrintAllClick = () => {
    if (!restaurantId) return;
    setPendingPrint(true);
    printSlugMutation.mutate();
  };

  const moveZoneUp = (index: number) => {
    if (!zones || index === 0) return;
    const items = zones.map((z, i) => ({
      id: z.id,
      displayOrder: z.displayOrder,
    }));
    [items[index - 1].displayOrder, items[index].displayOrder] = [
      items[index].displayOrder,
      items[index - 1].displayOrder,
    ];
    reorderZonesMutation.mutate(items);
  };

  const moveZoneDown = (index: number) => {
    if (!zones || index === zones.length - 1) return;
    const items = zones.map((z, i) => ({
      id: z.id,
      displayOrder: z.displayOrder,
    }));
    [items[index].displayOrder, items[index + 1].displayOrder] = [
      items[index + 1].displayOrder,
      items[index].displayOrder,
    ];
    reorderZonesMutation.mutate(items);
  };

  const handleCreate = (event: React.FormEvent) => {
    event.preventDefault();
    if (newTableName.trim() && !duplicateTable) {
      createMutation.mutate({
        name: newTableName.trim().replace(/\s+/g, " "),
        zoneId: newTableZoneId || undefined,
      });
    }
  };

  const handleCreateZone = (event: React.FormEvent) => {
    event.preventDefault();
    if (newZoneKey === "__custom__") {
      // Fully custom zone (won't translate) — free-text name, no preset key.
      if (newZoneName.trim()) {
        createZoneMutation.mutate({ name: newZoneName.trim(), zoneKey: null });
      }
    } else if (newZoneKey) {
      // Preset: store a stable fallback name + the translatable catalog key.
      createZoneMutation.mutate({
        name: humanizeZoneKey(newZoneKey),
        zoneKey: newZoneKey,
      });
    }
  };

  const handleShowQr = (table: {
    id: string;
    name: string;
    type?: ServicePointType;
    publicToken?: string | null;
  }) => {
    setSelectedTable(table);
    setIsQrModalOpen(true);
  };

  // restaurant may be null while the context resolves; guard every deref (#M14)
  // so a future caller that doesn't gate on activeRestaurant can't crash here.
  const logoUrl = restaurant?.logoUrl?.startsWith("http")
    ? restaurant.logoUrl
    : restaurant?.logoUrl
      ? `${(import.meta as any).env.VITE_API_URL || "http://localhost:3000/api"}`.replace(
          "/api",
          "",
        ) + `/${restaurant.logoUrl}`
      : null;

  // Fetch logo as base64 data URL via the backend proxy so embedding it in
  // the QR SVG doesn't taint the canvas used for PNG download (Issue 18).
  // Direct browser fetch() fails on cross-origin R2 URLs without CORS;
  // the backend fetches server-side (no CORS) and returns the data URL.
  useEffect(() => {
    if (!restaurantId || !logoUrl) {
      setLogoDataUrl(null);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const result = await getLogoBase64(restaurantId);
        if (!cancelled && result?.dataUrl) {
          setLogoDataUrl(result.dataUrl);
        } else if (!cancelled) {
          setLogoDataUrl(null);
        }
      } catch {
        if (!cancelled) setLogoDataUrl(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [logoUrl, restaurantId]);

  return (
    <section className="min-h-full bg-background text-foreground">
      <div className="mb-6 flex flex-col gap-5 border-b border-border/70 pb-5 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <h1 className="text-2xl font-black leading-tight text-foreground">
            {t("dashboard.tabs.tables", "Tables & QR")}
          </h1>
          <p className="mt-1 text-sm font-medium text-muted-foreground">
            {t(
              "auto.trackTableSessionsManageQ",
              "Track table sessions, manage QR codes, and print table-ready assets.",
            )}
          </p>
        </div>

        <div className="grid grid-cols-3 gap-2 sm:flex sm:items-center">
          <div className="rounded-lg border border-border bg-card px-3 py-2 shadow-sm">
            <p className="text-[10px] font-black uppercase tracking-[0.16em] text-muted-foreground">
              {t("auto.tables", "Tables")}
            </p>
            <p className="mt-0.5 text-xl font-black text-foreground">
              {tableStats.tableCount}
            </p>
          </div>
          <div className="rounded-lg border border-primary/20 bg-primary/10 px-3 py-2 shadow-sm">
            <p className="text-[10px] font-black uppercase tracking-[0.16em] text-primary">
              {t("auto.open", "Open")}
            </p>
            <p className="mt-0.5 text-xl font-black text-primary">
              {tableStats.activeSessions}
            </p>
          </div>
          <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 shadow-sm dark:border-emerald-400/20 dark:bg-emerald-400/10">
            <p className="text-[10px] font-black uppercase tracking-[0.16em] text-emerald-700 dark:text-emerald-200">
              {t("auto.paid", "Paid")}
            </p>
            <p className="mt-0.5 text-xl font-black text-emerald-700 dark:text-emerald-200">
              {tableStats.paidSessions}
            </p>
          </div>
        </div>
      </div>

      <div className="mb-6">
        <div
          className="grid grid-cols-2 gap-1 rounded-lg border border-border bg-card p-1 shadow-sm sm:flex sm:flex-wrap sm:items-center"
          role="tablist"
          aria-label={t("tables.title")}
        >
          {!isFree && (
            <DashboardButton
              density="tab"
              type="button"
              onClick={() => setSubTab("live")}
              role="tab"
              aria-selected={subTab === "live"}
              className={cn(
                "w-full sm:w-auto sm:px-4",
                subTab === "live"
                  ? "bg-primary text-white shadow-[0_8px_18px_-10px_rgba(110,86,248,0.8)]"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground",
              )}
            >
              <Eye className="h-4 w-4" />
              {t("tables.liveView")}
            </DashboardButton>
          )}
          {isManagerOrOwner && (
            <>
              <DashboardButton
                density="tab"
                type="button"
                onClick={() => setSubTab("qr")}
                role="tab"
                aria-selected={subTab === "qr"}
                className={cn(
                  "w-full sm:w-auto sm:px-4",
                  subTab === "qr"
                    ? "bg-primary text-white shadow-[0_8px_18px_-10px_rgba(110,86,248,0.8)]"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground",
                )}
              >
                <QrCode className="h-4 w-4" />
                {t("tables.qrManagement")}
              </DashboardButton>
              <DashboardButton
                density="tab"
                type="button"
                onClick={() => setSubTab("zones")}
                role="tab"
                aria-selected={subTab === "zones"}
                className={cn(
                  "w-full sm:w-auto sm:px-4",
                  subTab === "zones"
                    ? "bg-primary text-white shadow-[0_8px_18px_-10px_rgba(110,86,248,0.8)]"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground",
                )}
              >
                <MapPin className="h-4 w-4" />
                {t("auto.zones", "Zones")}
              </DashboardButton>
              {canManageServicePoints && (
                <DashboardButton
                  density="tab"
                  type="button"
                  onClick={() => setSubTab("service-points")}
                  role="tab"
                  aria-selected={subTab === "service-points"}
                  className={cn(
                    "w-full sm:w-auto sm:px-4",
                    subTab === "service-points"
                      ? "bg-primary text-white shadow-[0_8px_18px_-10px_rgba(110,86,248,0.8)]"
                      : "text-muted-foreground hover:bg-muted hover:text-foreground",
                  )}
                >
                  <Hotel className="h-4 w-4" />
                  {t("servicePoints.title", "Service Points")}
                </DashboardButton>
              )}
            </>
          )}
        </div>
      </div>

      {subTab === "live" ? (
        <LiveTablesView />
      ) : subTab === "zones" ? (
        <div className="space-y-6">
          <form
            onSubmit={handleCreateZone}
            className="rounded-lg border border-border bg-card p-4 shadow-sm"
          >
            <div className="mb-4 flex items-start gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <MapPin className="h-5 w-5" />
              </div>
              <div>
                <h2 className="text-base font-black text-foreground">
                  {t("auto.tableZones", "Table Zones")}
                </h2>
                <p className="mt-0.5 text-sm font-medium text-muted-foreground">
                  {t(
                    "auto.organizeTablesIntoZonesRe",
                    "Organize tables into zones (Restaurant, Garden, Terrace, etc.)",
                  )}
                </p>
              </div>
            </div>

            <div className="flex flex-col gap-3 sm:flex-row">
              {/* Preset catalog so the zone label translates on the booking
                  page + dashboard. "Custom" is a free-text escape hatch that
                  won't translate. */}
              <select
                value={newZoneKey}
                onChange={(e) => setNewZoneKey(e.target.value)}
                className="h-12 w-full rounded-lg border border-border bg-background px-3 text-base font-medium text-foreground outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/15 sm:h-11 sm:flex-1 sm:text-sm"
              >
                <option value="">
                  {t("zonesPicker.choose", "Choose a zone…")}
                </option>
                {ZONE_CATALOG_KEYS.map((k) => (
                  <option key={k} value={k}>
                    {t(`zones.${k}`, humanizeZoneKey(k))}
                  </option>
                ))}
                <option value="__custom__">
                  {t("zonesPicker.custom", "Custom (won't translate)…")}
                </option>
              </select>
              {newZoneKey === "__custom__" && (
                <input
                  type="text"
                  value={newZoneName}
                  onChange={(e) => setNewZoneName(e.target.value)}
                  placeholder={t("auto.zoneName", "Zone name...")}
                  className="h-12 w-full rounded-lg border border-border bg-background px-3 text-base font-medium text-foreground outline-none transition placeholder:text-muted-foreground/70 focus:border-primary focus:ring-2 focus:ring-primary/15 sm:h-11 sm:flex-1 sm:text-sm"
                />
              )}
              <DashboardButton
                type="submit"
                disabled={
                  createZoneMutation.isPending ||
                  !newZoneKey ||
                  (newZoneKey === "__custom__" && !newZoneName.trim())
                }
                className="h-12 min-h-12 w-full bg-primary text-white shadow-[0_10px_20px_-12px_rgba(110,86,248,0.9)] hover:bg-accent sm:h-11 sm:min-h-11 sm:w-auto"
              >
                <Plus className="h-4 w-4" />
                {t("auto.addZone", "Add Zone")}
              </DashboardButton>
            </div>
          </form>

          <div className="rounded-lg border border-border bg-card p-4 shadow-sm">
            <div className="mb-4 flex items-center gap-2">
              <LayoutGrid className="h-4 w-4 text-primary" />
              <h2 className="text-sm font-black uppercase tracking-[0.16em] text-muted-foreground">
                {t("auto.zoneList", "Zone list")}
              </h2>
            </div>

            {!zones || zones.length === 0 ? (
              <p className="py-4 text-center text-sm text-muted-foreground">
                {t("auto.noZonesCreatedYet", "No zones created yet.")}
              </p>
            ) : (
              <div className="space-y-2">
                {[...zones]
                  .sort((a, b) => a.displayOrder - b.displayOrder)
                  .map((zone, index) => (
                    <div
                      key={zone.id}
                      className="flex items-center gap-3 rounded-lg border border-border bg-background p-3"
                    >
                      <MapPin className="h-4 w-4 shrink-0 text-muted-foreground" />

                      {editingZoneId === zone.id ? (
                        <>
                          <input
                            type="text"
                            value={editingZoneName}
                            onChange={(e) => setEditingZoneName(e.target.value)}
                            className="h-9 flex-1 rounded border border-border bg-background px-2 text-sm font-medium outline-none focus:border-primary"
                            autoFocus
                            onKeyDown={(e) => {
                              if (e.key === "Enter") {
                                updateZoneMutation.mutate({
                                  zoneId: zone.id,
                                  data: { name: editingZoneName.trim() },
                                });
                                setEditingZoneId(null);
                              }
                              if (e.key === "Escape") setEditingZoneId(null);
                            }}
                          />
                          <button
                            type="button"
                            onClick={() => {
                              updateZoneMutation.mutate({
                                zoneId: zone.id,
                                data: { name: editingZoneName.trim() },
                              });
                              setEditingZoneId(null);
                            }}
                            className="shrink-0 rounded p-1.5 text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-500/10"
                            aria-label="Save"
                          >
                            <Check className="h-4 w-4" />
                          </button>
                          <button
                            type="button"
                            onClick={() => setEditingZoneId(null)}
                            className="shrink-0 rounded p-1.5 text-muted-foreground hover:bg-muted"
                            aria-label="Cancel"
                          >
                            <X className="h-4 w-4" />
                          </button>
                        </>
                      ) : (
                        <>
                          <span className="flex-1 text-sm font-bold text-foreground">
                            {zoneLabel(t, {
                              key: zone.zoneKey,
                              name: zone.name,
                            })}
                          </span>
                          <span className="text-xs text-muted-foreground">
                            {zone._count?.tables ?? 0}{" "}
                            {t("auto.tables", "tables")}
                          </span>
                          <button
                            type="button"
                            onClick={() => moveZoneUp(index)}
                            disabled={index === 0}
                            className="shrink-0 rounded p-1.5 text-muted-foreground hover:bg-muted disabled:opacity-30"
                            aria-label="Move up"
                          >
                            <ArrowUp className="h-4 w-4" />
                          </button>
                          <button
                            type="button"
                            onClick={() => moveZoneDown(index)}
                            disabled={index === zones.length - 1}
                            className="shrink-0 rounded p-1.5 text-muted-foreground hover:bg-muted disabled:opacity-30"
                            aria-label="Move down"
                          >
                            <ArrowDown className="h-4 w-4" />
                          </button>
                          {/* Preset zones translate from their key, so inline
                              renaming doesn't apply — only custom zones. */}
                          {!zone.zoneKey && (
                            <button
                              type="button"
                              onClick={() => {
                                setEditingZoneId(zone.id);
                                setEditingZoneName(zone.name);
                              }}
                              className="shrink-0 rounded p-1.5 text-muted-foreground hover:bg-muted"
                              aria-label="Edit"
                            >
                              <Edit2 className="h-4 w-4" />
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => {
                              if (
                                window.confirm(
                                  t(
                                    "zonesPicker.deleteConfirm",
                                    "Delete this zone? Any tables in it will be moved to the default zone.",
                                  ),
                                )
                              ) {
                                deleteZoneMutation.mutate(zone.id);
                              }
                            }}
                            disabled={zones.length <= 1}
                            className="shrink-0 rounded p-1.5 text-red-500 hover:bg-red-50 disabled:opacity-30 dark:hover:bg-red-500/10"
                            aria-label="Delete"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </>
                      )}
                    </div>
                  ))}
              </div>
            )}
          </div>
        </div>
      ) : subTab === "service-points" && canManageServicePoints ? (
        <ServicePointsTab
          restaurantId={restaurantId}
          restaurantSlug={restaurant?.slug ?? null}
          paymentsEnabled={canAcceptOnlinePayments}
          onShowQr={handleShowQr}
        />
      ) : (
        <div className="space-y-6">
          <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
            <form
              onSubmit={handleCreate}
              className="rounded-lg border border-border bg-card p-4 shadow-sm"
            >
              <div className="mb-4 flex items-start gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  <Plus className="h-5 w-5" />
                </div>
                <div>
                  <h2 className="text-base font-black text-foreground">
                    {t("tables.title")}
                  </h2>
                  <p className="mt-0.5 text-sm font-medium text-muted-foreground">
                    {t(
                      "auto.addTableNamesExactlyAsGuestsShould",
                      "Add table names exactly as guests should see them in QR links.",
                    )}
                  </p>
                </div>
              </div>

              <div className="flex flex-col gap-3 sm:flex-row">
                <input
                  type="text"
                  value={newTableName}
                  onChange={(event) => setNewTableName(event.target.value)}
                  placeholder={t("tables.addPlaceholder")}
                  className="h-12 w-full rounded-lg border border-border bg-background px-3 text-base font-medium text-foreground outline-none transition placeholder:text-muted-foreground/70 focus:border-primary focus:ring-2 focus:ring-primary/15 sm:h-11 sm:flex-1 sm:text-sm"
                />
                {zones && zones.length > 1 && (
                  <select
                    value={newTableZoneId}
                    onChange={(e) => setNewTableZoneId(e.target.value)}
                    className="h-12 w-full rounded-lg border border-border bg-background px-3 text-base font-medium text-foreground outline-none focus:border-primary focus:ring-2 focus:ring-primary/15 sm:h-11 sm:w-auto sm:text-sm"
                  >
                    {[...zones]
                      .sort((a, b) => a.displayOrder - b.displayOrder)
                      .map((z) => (
                        <option key={z.id} value={z.id}>
                          {zoneLabel(t, z)}
                        </option>
                      ))}
                  </select>
                )}
                <DashboardButton
                  type="submit"
                  disabled={
                    createMutation.isPending ||
                    !newTableName.trim() ||
                    duplicateTable
                  }
                  className="h-12 min-h-12 w-full bg-primary text-white shadow-[0_10px_20px_-12px_rgba(110,86,248,0.9)] hover:bg-accent sm:h-11 sm:min-h-11 sm:w-auto"
                >
                  <Plus className="h-4 w-4" />
                  {createMutation.isPending
                    ? t("tables.adding")
                    : t("tables.addButton")}
                </DashboardButton>
              </div>
              {duplicateTable && (
                <p className="mt-2 text-xs font-bold text-red-600">
                  {t(
                    "auto.aTableWithThisNameAlready",
                    "A table with this name already exists.",
                  )}
                </p>
              )}
            </form>

            <div className="rounded-lg border border-border bg-card p-4 shadow-sm">
              <div className="mb-4 flex items-start gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  <Printer className="h-5 w-5" />
                </div>
                <div>
                  <h2 className="text-base font-black text-foreground">
                    {t("auto.printSetup", "Print setup")}
                  </h2>
                  <p className="mt-0.5 text-sm font-medium text-muted-foreground">
                    {t(
                      "auto.chooseAQRLayoutBeforePrin",
                      "Choose a QR layout before printing all tables.",
                    )}
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <select
                  value={printTemplate}
                  onChange={(event) =>
                    setPrintTemplate(event.target.value as PrintTemplate)
                  }
                  className="h-10 rounded-lg border border-border bg-background px-3 text-xs font-bold text-foreground outline-none focus:ring-2 focus:ring-primary/20"
                  aria-label="Print template"
                >
                  {templateOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
                <select
                  value={printOrientation}
                  onChange={(event) =>
                    setPrintOrientation(event.target.value as PrintOrientation)
                  }
                  className="h-10 rounded-lg border border-border bg-background px-3 text-xs font-bold text-foreground outline-none focus:ring-2 focus:ring-primary/20"
                  aria-label="Print orientation"
                >
                  {orientationOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </div>

              <DashboardButton
                type="button"
                onClick={handlePrintAllClick}
                disabled={
                  !tables || tables.length === 0 || printSlugMutation.isPending
                }
                className="mt-3 w-full border border-border bg-muted text-foreground hover:bg-secondary"
              >
                <Printer className="h-4 w-4" />
                {printSlugMutation.isPending
                  ? t("tables.preparingPrint", "Preparing…")
                  : t("tables.printAllQr")}
              </DashboardButton>
              {printSlugMutation.isError && (
                <p role="alert" className="mt-2 text-xs font-bold text-red-600">
                  {t(
                    "tables.qrCommitFailed",
                    "Could not prepare the menu link. Check your connection and try again.",
                  )}
                </p>
              )}
            </div>
          </div>

          <div className="flex flex-col gap-3 border-b border-border pb-4 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex items-center gap-2">
              <LayoutGrid className="h-4 w-4 text-primary" />
              <h2 className="text-sm font-black uppercase tracking-[0.16em] text-muted-foreground">
                {t("auto.qRTableGrid", "QR table grid")}
              </h2>
            </div>
            <div className="relative lg:w-80">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <input
                value={tableSearch}
                onChange={(event) => setTableSearch(event.target.value)}
                placeholder={t("auto.searchTable", "Search table...")}
                className="h-10 w-full rounded-lg border border-border bg-card pl-10 pr-3 text-sm font-medium text-foreground shadow-sm outline-none transition placeholder:text-muted-foreground/70 focus:border-primary focus:ring-2 focus:ring-primary/15"
              />
            </div>
          </div>

          {isLoading ? (
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
              {[...Array(8)].map((_, index) => (
                <div
                  key={index}
                  className="h-32 animate-pulse rounded-lg bg-muted/50"
                />
              ))}
            </div>
          ) : filteredTables.length === 0 ? (
            <div
              className={`flex min-h-[260px] items-center justify-center rounded-lg border border-dashed border-border bg-card text-center text-sm font-medium text-muted-foreground ${dashboardSurface.empty}`}
            >
              {tables?.length === 0
                ? t("tables.noTables")
                : "No tables match your search."}
            </div>
          ) : (
            <div className="grid grid-cols-1 items-start gap-4 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
              {filteredTables.map((table: any) => {
                const session = sessionByTableId.get(table.id);
                const publicUrl = getMenuUrl(restaurant, { table: table.name });
                const sessionStatusLabel = session
                  ? t(
                      SESSION_STATUS_LABEL_KEYS[session.status] ??
                        "tables.status.unknown",
                      {
                        defaultValue: humanizeSessionStatus(session.status),
                      },
                    )
                  : "";
                return (
                  <article
                    key={table.id}
                    className="flex flex-col gap-2.5 rounded-lg border border-border bg-card p-3 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="inline-flex h-5 items-center gap-1 rounded-full bg-primary/10 px-1.5 text-[10px] font-black uppercase text-primary">
                        <QrCode className="h-3 w-3" />
                        {t("auto.qRReady", "QR ready")}
                      </span>
                      {session && (
                        <span
                          className={cn(
                            "rounded-full px-2 py-0.5 text-[10px] font-black uppercase",
                            session.status === "OPEN"
                              ? "bg-amber-100 text-amber-700 dark:bg-amber-400/15 dark:text-amber-200"
                              : "bg-emerald-100 text-emerald-700 dark:bg-emerald-400/15 dark:text-emerald-200",
                          )}
                        >
                          {sessionStatusLabel}
                        </span>
                      )}
                    </div>

                    <div className="flex items-center justify-between gap-2">
                      <span className="text-2xl font-black tracking-tight text-foreground">
                        {table.name}
                      </span>
                      <DashboardButton
                        density="compact"
                        type="button"
                        onClick={async () => {
                          const ok = await copyToClipboard(publicUrl);
                          if (ok) {
                            setCopiedTableId(table.id);
                            setTimeout(() => setCopiedTableId(null), 2000);
                          }
                        }}
                        className="shrink-0 px-2 text-muted-foreground hover:bg-muted hover:text-foreground"
                        title={publicUrl}
                      >
                        {copiedTableId === table.id ? (
                          <Check className="h-3 w-3 text-green-500" />
                        ) : (
                          <Copy className="h-3 w-3" />
                        )}
                        {copiedTableId === table.id
                          ? t("auto.copied", "Copied!")
                          : t("auto.copyURL", "Copy URL")}
                      </DashboardButton>
                    </div>

                    {zones && zones.length > 0 && (
                      <select
                        value={table.zone?.id ?? ""}
                        onChange={(e) => {
                          const newZoneId = e.target.value || null;
                          updateTableMutation.mutate({
                            tableId: table.id,
                            data: { zoneId: newZoneId },
                          });
                        }}
                        className="h-7 w-full rounded border border-border bg-background px-1.5 text-[11px] font-medium text-foreground outline-none focus:border-primary"
                      >
                        <option value="">{t("auto.noZone", "No zone")}</option>
                        {zones.map((z: TableZone) => (
                          <option key={z.id} value={z.id}>
                            {zoneLabel(t, z)}
                          </option>
                        ))}
                      </select>
                    )}

                    <div className="flex items-center gap-2">
                      <DashboardButton
                        type="button"
                        onClick={() => handleShowQr(table)}
                        className="flex-1 bg-primary px-2 text-white shadow-[0_8px_16px_-10px_rgba(110,86,248,0.8)] hover:bg-accent"
                      >
                        <QrCode className="h-3.5 w-3.5" />
                        {t("auto.generateQR", "Generate QR")}
                      </DashboardButton>
                      <DashboardButton
                        density="icon"
                        type="button"
                        onClick={() => deleteMutation.mutate(table.id)}
                        disabled={deleteMutation.isPending}
                        className="border border-red-200 bg-card text-red-600 hover:bg-red-50 dark:border-red-500/30 dark:hover:bg-red-500/10"
                        aria-label={t("tables.delete")}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </DashboardButton>
                    </div>
                  </article>
                );
              })}
            </div>
          )}

          <PrintableQRCodes
            restaurant={restaurant}
            tables={tables || []}
            template={printTemplate}
            orientation={printOrientation}
            committed={printSlugMutation.data ?? null}
            commitError={printSlugMutation.isError}
          />
        </div>
      )}
      <QrCodeModal
        open={isQrModalOpen}
        onOpenChange={setIsQrModalOpen}
        restaurant={restaurant}
        target={selectedTable}
        logoDataUrl={logoDataUrl}
      />
    </section>
  );
};

export default TableView;
