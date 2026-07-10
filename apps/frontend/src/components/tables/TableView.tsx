import React, { useEffect, useMemo, useRef, useState } from "react";
import { QRCodeSVG, QRCodeCanvas } from "qrcode.react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  createTable,
  createServicePoint,
  deleteTable,
  getServicePoints,
  getTables,
  getTableSessions,
  getZones,
  rotateServicePointToken,
  createZone,
  updateZone,
  deleteZone,
  reorderZones,
  updateTable,
  getLogoBase64,
} from "../../lib/api";
import type {
  FulfillmentMode,
  ServicePoint,
  ServicePointPaymentMethod,
  ServicePointType,
  TableZone,
} from "../../lib/api";
import {
  ZONE_CATALOG_KEYS,
  humanizeZoneKey,
  zoneLabel,
} from "../../lib/zoneCatalog";
import { Button } from "../ui/button";
import { Modal } from "../ui/modal";
import { useTranslation } from "react-i18next";
import {
  ArrowDown,
  ArrowUp,
  Copy,
  Download,
  Edit2,
  Eye,
  Hotel,
  LayoutGrid,
  MapPin,
  Package,
  Plus,
  Printer,
  QrCode,
  RefreshCw,
  Search,
  Trash2,
  Check,
  X,
} from "lucide-react";
import PrintableQRCodes, {
  PrintOrientation,
  PrintTemplate,
} from "./PrintableQRCodes";
import RestaurantContext from "../../context/RestaurantContext";
import LiveTablesView from "../../pages/Dashboard/LiveTablesView";
import { useTier } from "../../hooks/useFeature";
import { cn } from "../../lib/utils";
import { useAuth } from "../../context/AuthContext";

const templateOptions: Array<{ value: PrintTemplate; label: string }> = [
  { value: "classic", label: "Classic" },
  { value: "premium", label: "Premium" },
  { value: "minimal", label: "Minimal" },
];

const orientationOptions: Array<{ value: PrintOrientation; label: string }> = [
  { value: "portrait", label: "Portrait" },
  { value: "landscape", label: "Landscape" },
];

const servicePointTypes: Array<{
  value: Exclude<ServicePointType, "TABLE">;
  labelKey: string;
  fallback: string;
}> = [
  { value: "ROOM", labelKey: "servicePoints.types.room", fallback: "Room" },
  {
    value: "PICKUP",
    labelKey: "servicePoints.types.pickup",
    fallback: "Pickup",
  },
  {
    value: "OTHER",
    labelKey: "servicePoints.types.other",
    fallback: "Other",
  },
];

const fulfillmentOptions: Array<{
  value: FulfillmentMode;
  labelKey: string;
  fallback: string;
}> = [
  {
    value: "ROOM_DELIVERY",
    labelKey: "servicePoints.fulfillmentModes.roomDelivery",
    fallback: "Deliver to room",
  },
  {
    value: "PICKUP",
    labelKey: "servicePoints.fulfillmentModes.pickupAdmin",
    fallback: "Guest pickup",
  },
  {
    value: "DINE_IN",
    labelKey: "servicePoints.fulfillmentModes.dineIn",
    fallback: "Dine in",
  },
];

const paymentOptions: Array<{
  value: ServicePointPaymentMethod;
  labelKey: string;
  fallback: string;
}> = [
  {
    value: "ONLINE",
    labelKey: "servicePoints.paymentMethods.online",
    fallback: "Pay online",
  },
  {
    value: "PAY_ON_DELIVERY",
    labelKey: "servicePoints.paymentMethods.payOnDelivery",
    fallback: "Pay on delivery",
  },
  {
    value: "PAY_AT_PICKUP",
    labelKey: "servicePoints.paymentMethods.payAtPickup",
    fallback: "Pay at pickup",
  },
  {
    value: "CASH",
    labelKey: "servicePoints.paymentMethods.cash",
    fallback: "Cash",
  },
];

type TablesSubTab = "live" | "qr" | "zones" | "service-points";

function normalizeTableName(name: string) {
  return name.trim().replace(/\s+/g, " ").toLowerCase();
}

async function copyToClipboard(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    /* fall through to fallback */
  }

  // Fallback for non-HTTPS / older browsers
  try {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.style.position = "fixed";
    ta.style.left = "-9999px";
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand("copy");
    document.body.removeChild(ta);
    return ok;
  } catch {
    return false;
  }
}

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
  const [selectedTable, setSelectedTable] = useState<{
    id: string;
    name: string;
    type?: ServicePointType;
    publicToken?: string | null;
  } | null>(null);
  const [copiedTableId, setCopiedTableId] = useState<string | null>(null);
  const qrCodeRef = useRef<HTMLDivElement>(null);
  const qrCanvasRef = useRef<HTMLDivElement>(null);
  const [logoDataUrl, setLogoDataUrl] = useState<string | null>(null);
  const { t } = useTranslation();
  const { tier } = useTier();
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
  const [newServicePointName, setNewServicePointName] = useState("");
  const [newServicePointType, setNewServicePointType] =
    useState<Exclude<ServicePointType, "TABLE">>("ROOM");
  const [newFulfillmentModes, setNewFulfillmentModes] = useState<
    FulfillmentMode[]
  >(["ROOM_DELIVERY", "PICKUP"]);
  const [newPaymentMethods, setNewPaymentMethods] = useState<
    ServicePointPaymentMethod[]
  >(["ONLINE", "PAY_ON_DELIVERY"]);
  const [servicePointSearch, setServicePointSearch] = useState("");

  const getServicePointTypeLabel = (type?: ServicePointType | null) => {
    const option = servicePointTypes.find((entry) => entry.value === type);
    return option
      ? t(option.labelKey, option.fallback)
      : t("servicePoints.types.location", "Location");
  };

  const getFulfillmentOptionLabel = (mode: FulfillmentMode) => {
    const option = fulfillmentOptions.find((entry) => entry.value === mode);
    return option ? t(option.labelKey, option.fallback) : mode;
  };

  const getPaymentOptionLabel = (method: ServicePointPaymentMethod) => {
    const option = paymentOptions.find((entry) => entry.value === method);
    return option ? t(option.labelKey, option.fallback) : method;
  };

  const { data: tables, isLoading } = useQuery({
    queryKey: ["tables", restaurantId],
    queryFn: () => getTables(restaurantId),
    enabled: !!restaurantId,
  });

  const { data: servicePoints, isLoading: servicePointsLoading } = useQuery({
    queryKey: ["servicePoints", restaurantId],
    queryFn: () => getServicePoints(restaurantId),
    enabled: !!restaurantId && isManagerOrOwner,
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

  const createServicePointMutation = useMutation({
    mutationFn: () =>
      createServicePoint(restaurantId, {
        name: newServicePointName.trim().replace(/\s+/g, " "),
        type: newServicePointType,
        fulfillmentModes: newFulfillmentModes,
        paymentMethods: newPaymentMethods,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["servicePoints", restaurantId],
      });
      setNewServicePointName("");
    },
  });

  const rotateServicePointTokenMutation = useMutation({
    mutationFn: (id: string) => rotateServicePointToken(id),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["servicePoints", restaurantId],
      });
    },
  });

  const { data: sessions } = useQuery({
    queryKey: ["tableSessions", restaurantId],
    queryFn: () => getTableSessions(restaurantId),
    enabled: !!restaurantId,
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

  const duplicateServicePoint = useMemo(() => {
    const normalized = normalizeTableName(newServicePointName);
    if (!normalized) return false;
    return [...(tables || []), ...(servicePoints || [])].some(
      (point: any) => normalizeTableName(point.name) === normalized,
    );
  }, [newServicePointName, servicePoints, tables]);

  const filteredServicePoints = useMemo(() => {
    const query = servicePointSearch.trim().toLowerCase();
    return (servicePoints || []).filter((point: ServicePoint) => {
      if (!query) return true;
      return [point.name, point.type]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(query));
    });
  }, [servicePointSearch, servicePoints]);

  const tableStats = useMemo(() => {
    const tableCount = tables?.length ?? 0;
    const activeSessions = (sessions || []).filter(
      (session: any) => session.status === "OPEN",
    ).length;
    const paidSessions = (sessions || []).filter(
      (session: any) => session.status === "PAID",
    ).length;
    return { tableCount, activeSessions, paidSessions };
  }, [sessions, tables]);

  useEffect(() => {
    if (newServicePointType === "ROOM") {
      setNewFulfillmentModes(["ROOM_DELIVERY", "PICKUP"]);
      setNewPaymentMethods(["ONLINE", "PAY_ON_DELIVERY"]);
    } else if (newServicePointType === "PICKUP") {
      setNewFulfillmentModes(["PICKUP"]);
      setNewPaymentMethods(["ONLINE", "PAY_AT_PICKUP"]);
    } else {
      setNewFulfillmentModes(["PICKUP"]);
      setNewPaymentMethods(["ONLINE", "CASH"]);
    }
  }, [newServicePointType]);

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

  const toggleFulfillmentMode = (mode: FulfillmentMode) => {
    setNewFulfillmentModes((current) => {
      if (current.includes(mode)) {
        return current.length === 1
          ? current
          : current.filter((value) => value !== mode);
      }
      return [...current, mode];
    });
  };

  const togglePaymentMethod = (method: ServicePointPaymentMethod) => {
    setNewPaymentMethods((current) => {
      if (current.includes(method)) {
        return current.length === 1
          ? current
          : current.filter((value) => value !== method);
      }
      return [...current, method];
    });
  };

  const handleCreateServicePoint = (event: React.FormEvent) => {
    event.preventDefault();
    if (
      newServicePointName.trim() &&
      !duplicateServicePoint &&
      newFulfillmentModes.length > 0 &&
      newPaymentMethods.length > 0
    ) {
      createServicePointMutation.mutate();
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

  const handleDownloadQR = () => {
    const container = qrCanvasRef.current;
    if (!container) return;
    const sourceCanvas = container.querySelector("canvas");
    if (!sourceCanvas) return;

    // 4-module quiet zone required by QR spec. 512 px / ~29 modules ≈ 17.7 px/module
    // for version-5 QR; 4 × 17.7 ≈ 71 px. Use 72 px for clean integer.
    const QUIET_ZONE = 72;
    const srcW = sourceCanvas.width;
    const outW = srcW + QUIET_ZONE * 2;
    const out = document.createElement("canvas");
    out.width = outW;
    out.height = outW;
    const ctx = out.getContext("2d")!;

    // White background (quiet zone)
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, outW, outW);

    // Draw QR centered with pixel-snapping
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(sourceCanvas, QUIET_ZONE, QUIET_ZONE);

    const finish = () => {
      const pngFile = out.toDataURL("image/png");
      const downloadLink = document.createElement("a");
      const targetKind =
        selectedTable?.type && selectedTable.type !== "TABLE"
          ? "service-point"
          : "table";
      downloadLink.download = `qr-menu-${targetKind}-${selectedTable?.name || "unknown"}.png`;
      downloadLink.href = pngFile;
      downloadLink.click();
    };

    if (logoDataUrl) {
      const logoImg = new Image();
      logoImg.onload = () => {
        const logoPx = Math.round(srcW * 0.138);
        const x = QUIET_ZONE + Math.round((srcW - logoPx) / 2);
        const y = QUIET_ZONE + Math.round((srcW - logoPx) / 2);
        const pad = Math.max(2, Math.round(srcW * 0.008));
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(x - pad, y - pad, logoPx + pad * 2, logoPx + pad * 2);
        ctx.imageSmoothingEnabled = false;
        ctx.drawImage(logoImg, x, y, logoPx, logoPx);
        finish();
      };
      logoImg.onerror = finish;
      logoImg.src = logoDataUrl;
    } else {
      finish();
    }
  };

  const getQrCodeUrl = () => {
    if (!restaurantId || !selectedTable) return "";
    if (selectedTable.type && selectedTable.type !== "TABLE") {
      if (!selectedTable.publicToken) return "";
      return `${window.location.origin}/menu/public/${restaurantId}?sp=${encodeURIComponent(selectedTable.publicToken)}`;
    }
    return `${window.location.origin}/menu/public/${restaurantId}?table=${encodeURIComponent(selectedTable.name)}`;
  };

  const logoUrl = restaurant.logoUrl?.startsWith("http")
    ? restaurant.logoUrl
    : restaurant.logoUrl
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
        <div className="grid grid-cols-2 gap-1 rounded-lg border border-border bg-card p-1 shadow-sm sm:flex sm:flex-wrap sm:items-center">
          {!isFree && (
            <button
              type="button"
              onClick={() => setSubTab("live")}
              className={cn(
                "flex h-10 items-center justify-center gap-2 rounded-md px-3 text-sm font-bold transition active:scale-[0.98] sm:h-9 sm:px-4",
                subTab === "live"
                  ? "bg-primary text-white shadow-[0_8px_18px_-10px_rgba(110,86,248,0.8)]"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground",
              )}
            >
              <Eye className="h-4 w-4" />
              {t("tables.liveView")}
            </button>
          )}
          {isManagerOrOwner && (
            <>
              <button
                type="button"
                onClick={() => setSubTab("qr")}
                className={cn(
                  "flex h-10 items-center justify-center gap-2 rounded-md px-3 text-sm font-bold transition active:scale-[0.98] sm:h-9 sm:px-4",
                  subTab === "qr"
                    ? "bg-primary text-white shadow-[0_8px_18px_-10px_rgba(110,86,248,0.8)]"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground",
                )}
              >
                <QrCode className="h-4 w-4" />
                {t("tables.qrManagement")}
              </button>
              <button
                type="button"
                onClick={() => setSubTab("zones")}
                className={cn(
                  "flex h-10 items-center justify-center gap-2 rounded-md px-3 text-sm font-bold transition active:scale-[0.98] sm:h-9 sm:px-4",
                  subTab === "zones"
                    ? "bg-primary text-white shadow-[0_8px_18px_-10px_rgba(110,86,248,0.8)]"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground",
                )}
              >
                <MapPin className="h-4 w-4" />
                {t("auto.zones", "Zones")}
              </button>
              <button
                type="button"
                onClick={() => setSubTab("service-points")}
                className={cn(
                  "flex h-10 items-center justify-center gap-2 rounded-md px-3 text-sm font-bold transition active:scale-[0.98] sm:h-9 sm:px-4",
                  subTab === "service-points"
                    ? "bg-primary text-white shadow-[0_8px_18px_-10px_rgba(110,86,248,0.8)]"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground",
                )}
              >
                <Hotel className="h-4 w-4" />
                {t("servicePoints.title", "Service Points")}
              </button>
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
                className="h-11 flex-1 rounded-lg border border-border bg-background px-3 text-sm font-medium text-foreground outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/15"
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
                  className="h-11 flex-1 rounded-lg border border-border bg-background px-3 text-sm font-medium text-foreground outline-none transition placeholder:text-muted-foreground/70 focus:border-primary focus:ring-2 focus:ring-primary/15"
                />
              )}
              <button
                type="submit"
                disabled={
                  createZoneMutation.isPending ||
                  !newZoneKey ||
                  (newZoneKey === "__custom__" && !newZoneName.trim())
                }
                className="flex h-11 items-center justify-center gap-2 rounded-lg bg-primary px-5 text-sm font-black text-white shadow-[0_10px_20px_-12px_rgba(110,86,248,0.9)] transition hover:bg-accent disabled:cursor-not-allowed disabled:opacity-50"
              >
                <Plus className="h-4 w-4" />
                {t("auto.addZone", "Add Zone")}
              </button>
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
      ) : subTab === "service-points" ? (
        <div className="space-y-6">
          <form
            onSubmit={handleCreateServicePoint}
            className="rounded-lg border border-border bg-card p-4 shadow-sm"
          >
            <div className="mb-4 flex items-start gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <Hotel className="h-5 w-5" />
              </div>
              <div>
                <h2 className="text-base font-black text-foreground">
                  {t("servicePoints.createTitle", "Create service point")}
                </h2>
                <p className="mt-0.5 text-sm font-medium text-muted-foreground">
                  {t(
                    "servicePoints.createSubtitle",
                    "Create room or pickup QR codes with their own fulfillment and payment choices.",
                  )}
                </p>
              </div>
            </div>

            <div className="grid gap-3 lg:grid-cols-[160px_minmax(0,1fr)_auto]">
              <select
                value={newServicePointType}
                onChange={(event) =>
                  setNewServicePointType(
                    event.target.value as Exclude<ServicePointType, "TABLE">,
                  )
                }
                className="h-11 rounded-lg border border-border bg-background px-3 text-sm font-bold text-foreground outline-none focus:border-primary focus:ring-2 focus:ring-primary/15"
              >
                {servicePointTypes.map((option) => (
                  <option key={option.value} value={option.value}>
                    {t(option.labelKey, option.fallback)}
                  </option>
                ))}
              </select>
              <input
                type="text"
                value={newServicePointName}
                onChange={(event) => setNewServicePointName(event.target.value)}
                placeholder={t(
                  "servicePoints.namePlaceholder",
                  "Room 304, Lobby pickup, Pool bar...",
                )}
                className="h-11 rounded-lg border border-border bg-background px-3 text-sm font-medium text-foreground outline-none transition placeholder:text-muted-foreground/70 focus:border-primary focus:ring-2 focus:ring-primary/15"
              />
              <button
                type="submit"
                disabled={
                  createServicePointMutation.isPending ||
                  !newServicePointName.trim() ||
                  duplicateServicePoint
                }
                className="flex h-11 items-center justify-center gap-2 rounded-lg bg-primary px-5 text-sm font-black text-white shadow-[0_10px_20px_-12px_rgba(110,86,248,0.9)] transition hover:bg-accent disabled:cursor-not-allowed disabled:opacity-50"
              >
                <Plus className="h-4 w-4" />
                {t("servicePoints.add", "Add")}
              </button>
            </div>

            {duplicateServicePoint && (
              <p className="mt-2 text-xs font-bold text-red-600">
                {t(
                  "servicePoints.duplicate",
                  "A table or service point with this name already exists.",
                )}
              </p>
            )}

            <div className="mt-4 grid gap-4 lg:grid-cols-2">
              <div>
                <p className="mb-2 text-xs font-black uppercase tracking-[0.16em] text-muted-foreground">
                  {t("servicePoints.fulfillment", "Fulfillment")}
                </p>
                <div className="flex flex-wrap gap-2">
                  {fulfillmentOptions.map((option) => (
                    <button
                      key={option.value}
                      type="button"
                      onClick={() => toggleFulfillmentMode(option.value)}
                      className={cn(
                        "rounded-lg border px-3 py-2 text-xs font-black transition",
                        newFulfillmentModes.includes(option.value)
                          ? "border-primary bg-primary/10 text-primary"
                          : "border-border bg-background text-muted-foreground hover:bg-muted",
                      )}
                    >
                      {t(option.labelKey, option.fallback)}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <p className="mb-2 text-xs font-black uppercase tracking-[0.16em] text-muted-foreground">
                  {t("servicePoints.payment", "Payment")}
                </p>
                <div className="flex flex-wrap gap-2">
                  {paymentOptions.map((option) => (
                    <button
                      key={option.value}
                      type="button"
                      onClick={() => togglePaymentMethod(option.value)}
                      className={cn(
                        "rounded-lg border px-3 py-2 text-xs font-black transition",
                        newPaymentMethods.includes(option.value)
                          ? "border-primary bg-primary/10 text-primary"
                          : "border-border bg-background text-muted-foreground hover:bg-muted",
                      )}
                    >
                      {t(option.labelKey, option.fallback)}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </form>

          <div className="flex flex-col gap-3 border-b border-border pb-4 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex items-center gap-2">
              <Package className="h-4 w-4 text-primary" />
              <h2 className="text-sm font-black uppercase tracking-[0.16em] text-muted-foreground">
                {t("servicePoints.qrGrid", "Service point QR grid")}
              </h2>
            </div>
            <div className="relative lg:w-80">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <input
                value={servicePointSearch}
                onChange={(event) => setServicePointSearch(event.target.value)}
                placeholder={t(
                  "servicePoints.search",
                  "Search service points...",
                )}
                className="h-10 w-full rounded-lg border border-border bg-card pl-10 pr-3 text-sm font-medium text-foreground shadow-sm outline-none transition placeholder:text-muted-foreground/70 focus:border-primary focus:ring-2 focus:ring-primary/15"
              />
            </div>
          </div>

          {servicePointsLoading ? (
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
              {[...Array(3)].map((_, index) => (
                <div
                  key={index}
                  className="h-36 animate-pulse rounded-lg bg-muted/50"
                />
              ))}
            </div>
          ) : filteredServicePoints.length === 0 ? (
            <div className="flex min-h-[220px] items-center justify-center rounded-lg border border-dashed border-border bg-card p-8 text-center text-sm font-medium text-muted-foreground">
              {servicePoints?.length === 0
                ? t(
                    "servicePoints.empty",
                    "No service points yet. Add a room or pickup QR above.",
                  )
                : t("servicePoints.noMatches", "No service points match.")}
            </div>
          ) : (
            <div className="grid grid-cols-1 items-start gap-4 md:grid-cols-2 xl:grid-cols-3">
              {filteredServicePoints.map((point) => {
                const publicUrl = point.publicToken
                  ? `${window.location.origin}/menu/public/${restaurantId}?sp=${encodeURIComponent(point.publicToken)}`
                  : "";
                const pointFulfillment = fulfillmentOptions
                  .filter((option) =>
                    point.fulfillmentModes.includes(option.value),
                  )
                  .map((option) => getFulfillmentOptionLabel(option.value));
                const pointPayment = paymentOptions
                  .filter((option) =>
                    point.paymentMethods.includes(option.value),
                  )
                  .map((option) => getPaymentOptionLabel(option.value));

                return (
                  <article
                    key={point.id}
                    className="flex flex-col gap-3 rounded-lg border border-border bg-card p-3 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="inline-flex h-5 items-center gap-1 rounded-full bg-primary/10 px-1.5 text-[10px] font-black uppercase text-primary">
                        <Hotel className="h-3 w-3" />
                        {getServicePointTypeLabel(point.type)}
                      </span>
                      <button
                        type="button"
                        onClick={() =>
                          updateTableMutation.mutate({
                            tableId: point.id,
                            data: { isActive: !point.isActive },
                          })
                        }
                        className={cn(
                          "rounded-full px-2 py-0.5 text-[10px] font-black uppercase",
                          point.isActive
                            ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-400/15 dark:text-emerald-200"
                            : "bg-muted text-muted-foreground",
                        )}
                      >
                        {point.isActive
                          ? t("auto.active", "Active")
                          : t("auto.inactive", "Inactive")}
                      </button>
                    </div>

                    <div className="flex items-center justify-between gap-2">
                      <span className="truncate text-xl font-black tracking-tight text-foreground">
                        {point.name}
                      </span>
                      <button
                        type="button"
                        onClick={async () => {
                          if (!publicUrl) return;
                          const ok = await copyToClipboard(publicUrl);
                          if (ok) {
                            setCopiedTableId(point.id);
                            setTimeout(() => setCopiedTableId(null), 2000);
                          }
                        }}
                        className="flex h-7 shrink-0 items-center gap-1 rounded px-2 text-[10px] font-black text-muted-foreground transition hover:bg-muted hover:text-foreground"
                        title={publicUrl}
                      >
                        {copiedTableId === point.id ? (
                          <Check className="h-3 w-3 text-green-500" />
                        ) : (
                          <Copy className="h-3 w-3" />
                        )}
                        {copiedTableId === point.id
                          ? t("auto.copied", "Copied!")
                          : t("auto.copyURL", "Copy URL")}
                      </button>
                    </div>

                    <div className="space-y-1">
                      {[...pointFulfillment, ...pointPayment].map((label) => (
                        <span
                          key={label}
                          className="mr-1 inline-flex rounded-md bg-muted px-2 py-1 text-[10px] font-black text-muted-foreground"
                        >
                          {label}
                        </span>
                      ))}
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => handleShowQr(point)}
                        disabled={!point.publicToken}
                        className="flex h-8 flex-1 items-center justify-center gap-1.5 rounded-lg bg-primary px-2 text-xs font-black text-white shadow-[0_8px_16px_-10px_rgba(110,86,248,0.8)] transition hover:bg-accent disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        <QrCode className="h-3.5 w-3.5" />
                        {t("auto.generateQR", "Generate QR")}
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          rotateServicePointTokenMutation.mutate(point.id)
                        }
                        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-border bg-card text-muted-foreground transition hover:bg-muted hover:text-foreground"
                        aria-label={t(
                          "servicePoints.rotateToken",
                          "Rotate QR token",
                        )}
                      >
                        <RefreshCw className="h-3.5 w-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => deleteMutation.mutate(point.id)}
                        disabled={deleteMutation.isPending}
                        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-red-200 bg-card text-red-600 transition hover:bg-red-50 disabled:opacity-50 dark:border-red-500/30 dark:hover:bg-red-500/10"
                        aria-label={t("tables.delete")}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </div>
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
                  className="h-11 flex-1 rounded-lg border border-border bg-background px-3 text-sm font-medium text-foreground outline-none transition placeholder:text-muted-foreground/70 focus:border-primary focus:ring-2 focus:ring-primary/15"
                />
                {zones && zones.length > 1 && (
                  <select
                    value={newTableZoneId}
                    onChange={(e) => setNewTableZoneId(e.target.value)}
                    className="h-11 rounded-lg border border-border bg-background px-3 text-sm font-medium text-foreground outline-none focus:border-primary focus:ring-2 focus:ring-primary/15"
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
                <button
                  type="submit"
                  disabled={
                    createMutation.isPending ||
                    !newTableName.trim() ||
                    duplicateTable
                  }
                  className="flex h-11 items-center justify-center gap-2 rounded-lg bg-primary px-5 text-sm font-black text-white shadow-[0_10px_20px_-12px_rgba(110,86,248,0.9)] transition hover:bg-accent disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <Plus className="h-4 w-4" />
                  {createMutation.isPending
                    ? t("tables.adding")
                    : t("tables.addButton")}
                </button>
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

              <button
                type="button"
                onClick={() => window.print()}
                disabled={!tables || tables.length === 0}
                className="mt-3 flex h-10 w-full items-center justify-center gap-2 rounded-lg border border-border bg-muted px-4 text-xs font-black text-foreground transition hover:bg-secondary disabled:cursor-not-allowed disabled:opacity-50"
              >
                <Printer className="h-4 w-4" />
                {t("tables.printAllQr")}
              </button>
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
            <div className="flex min-h-[260px] items-center justify-center rounded-lg border border-dashed border-border bg-card p-8 text-center text-sm font-medium text-muted-foreground">
              {tables?.length === 0
                ? t("tables.noTables")
                : "No tables match your search."}
            </div>
          ) : (
            <div className="grid grid-cols-1 items-start gap-4 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
              {filteredTables.map((table: any) => {
                const session = sessionByTableId.get(table.id);
                const publicUrl = `${window.location.origin}/menu/public/${restaurantId}?table=${encodeURIComponent(table.name)}`;
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
                          {session.status}
                        </span>
                      )}
                    </div>

                    <div className="flex items-center justify-between gap-2">
                      <span className="text-2xl font-black tracking-tight text-foreground">
                        {table.name}
                      </span>
                      <button
                        type="button"
                        onClick={async () => {
                          const ok = await copyToClipboard(publicUrl);
                          if (ok) {
                            setCopiedTableId(table.id);
                            setTimeout(() => setCopiedTableId(null), 2000);
                          }
                        }}
                        className="flex h-7 shrink-0 items-center gap-1 rounded px-2 text-[10px] font-black text-muted-foreground transition hover:bg-muted hover:text-foreground"
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
                      </button>
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
                      <button
                        type="button"
                        onClick={() => handleShowQr(table)}
                        className="flex h-8 flex-1 items-center justify-center gap-1.5 rounded-lg bg-primary px-2 text-xs font-black text-white shadow-[0_8px_16px_-10px_rgba(110,86,248,0.8)] transition hover:bg-accent"
                      >
                        <QrCode className="h-3.5 w-3.5" />
                        {t("auto.generateQR", "Generate QR")}
                      </button>
                      <button
                        type="button"
                        onClick={() => deleteMutation.mutate(table.id)}
                        disabled={deleteMutation.isPending}
                        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-red-200 bg-card text-red-600 transition hover:bg-red-50 disabled:opacity-50 dark:border-red-500/30 dark:hover:bg-red-500/10"
                        aria-label={t("tables.delete")}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </article>
                );
              })}
            </div>
          )}

          <Modal
            open={isQrModalOpen}
            onOpenChange={setIsQrModalOpen}
            title={
              selectedTable
                ? selectedTable.type && selectedTable.type !== "TABLE"
                  ? t("servicePoints.qrTitle", {
                      name: selectedTable.name,
                      defaultValue: "{{name}} QR",
                    })
                  : t("tables.qrTitle", { name: selectedTable.name })
                : t("tables.generateQR")
            }
            description={
              selectedTable
                ? selectedTable.type && selectedTable.type !== "TABLE"
                  ? t(
                      "servicePoints.qrInstructions",
                      "Place this QR at the room or pickup point.",
                    )
                  : t("tables.qrInstructions", { name: selectedTable.name })
                : undefined
            }
          >
            {selectedTable && (
              <div className="flex flex-col items-center">
                <div
                  className="mb-6 inline-block rounded-2xl border-8 border-white bg-white p-6 shadow-inner"
                  ref={qrCodeRef}
                >
                  <QRCodeSVG
                    value={getQrCodeUrl()}
                    size={256}
                    fgColor={restaurant.accentColor || "#000000"}
                    bgColor="#ffffff"
                    level="H"
                    imageSettings={
                      logoDataUrl
                        ? {
                            src: logoDataUrl,
                            height: 38,
                            width: 38,
                            excavate: true,
                          }
                        : undefined
                    }
                  />
                </div>
                {/* Hidden canvas QR used for PNG download — renders clean QR without
                    logo; we draw the logo manually on top to avoid anti-aliasing and
                    nested data-URI corruption (Issue 18). */}
                <div
                  ref={qrCanvasRef}
                  style={{ position: "absolute", left: "-9999px", top: 0 }}
                >
                  <QRCodeCanvas
                    value={getQrCodeUrl()}
                    size={512}
                    fgColor={restaurant.accentColor || "#000000"}
                    bgColor="#ffffff"
                    level="H"
                  />
                </div>
                <Button className="w-full gap-2" onClick={handleDownloadQR}>
                  <Download className="h-4 w-4" />
                  {t("tables.downloadPNG")}
                </Button>
              </div>
            )}
          </Modal>

          <PrintableQRCodes
            restaurant={restaurant}
            tables={tables || []}
            template={printTemplate}
            orientation={printOrientation}
          />
        </div>
      )}
    </section>
  );
};

export default TableView;
