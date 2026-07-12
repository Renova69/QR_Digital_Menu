import React, { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  createServicePoint,
  deleteTable,
  getServicePoints,
  getTables,
  rotateServicePointToken,
  updateTable,
} from "../../lib/api";
import type {
  FulfillmentMode,
  ServicePoint,
  ServicePointPaymentMethod,
  ServicePointType,
} from "../../lib/api";
import { copyToClipboard, normalizeTableName } from "../../lib/tableViewUtils";
import { useTranslation } from "react-i18next";
import {
  Check,
  Copy,
  Edit2,
  Hotel,
  Package,
  Plus,
  QrCode,
  RefreshCw,
  Search,
  Trash2,
  X,
} from "lucide-react";
import { cn } from "../../lib/utils";

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

interface ServicePointsTabProps {
  restaurantId: string;
  paymentsEnabled: boolean;
  onShowQr: (point: {
    id: string;
    name: string;
    type?: ServicePointType;
    publicToken?: string | null;
  }) => void;
}

const ServicePointsTab: React.FC<ServicePointsTabProps> = ({
  restaurantId,
  paymentsEnabled,
  onShowQr,
}) => {
  const { t } = useTranslation();
  const queryClient = useQueryClient();

  const [newServicePointName, setNewServicePointName] = useState("");
  const [newServicePointType, setNewServicePointType] =
    useState<Exclude<ServicePointType, "TABLE">>("ROOM");
  const [newFulfillmentModes, setNewFulfillmentModes] = useState<
    FulfillmentMode[]
  >(["ROOM_DELIVERY", "PICKUP"]);
  const [newPaymentMethods, setNewPaymentMethods] = useState<
    ServicePointPaymentMethod[]
  >(paymentsEnabled ? ["ONLINE", "PAY_ON_DELIVERY"] : ["PAY_ON_DELIVERY"]);
  const [servicePointSearch, setServicePointSearch] = useState("");
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [editingServicePoint, setEditingServicePoint] = useState<{
    id: string;
    name: string;
    fulfillmentModes: FulfillmentMode[];
    paymentMethods: ServicePointPaymentMethod[];
  } | null>(null);

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

  // Shares the ["tables", restaurantId] cache with TableView — no extra
  // network call — only used here to block a service point name colliding
  // with an existing table name.
  const { data: tables } = useQuery({
    queryKey: ["tables", restaurantId],
    queryFn: () => getTables(restaurantId),
    enabled: !!restaurantId,
  });

  const { data: servicePoints, isLoading: servicePointsLoading } = useQuery({
    queryKey: ["servicePoints", restaurantId],
    queryFn: () => getServicePoints(restaurantId),
    enabled: !!restaurantId,
  });

  const invalidateServicePoints = () => {
    queryClient.invalidateQueries({
      queryKey: ["servicePoints", restaurantId],
    });
    queryClient.invalidateQueries({ queryKey: ["tables", restaurantId] });
    queryClient.invalidateQueries({
      queryKey: ["tableStatuses", restaurantId],
    });
    queryClient.invalidateQueries({ queryKey: ["zones", restaurantId] });
  };

  const createServicePointMutation = useMutation({
    mutationFn: () =>
      createServicePoint(restaurantId, {
        name: newServicePointName.trim().replace(/\s+/g, " "),
        type: newServicePointType,
        fulfillmentModes: newFulfillmentModes,
        paymentMethods: newPaymentMethods,
      }),
    onSuccess: () => {
      invalidateServicePoints();
      setNewServicePointName("");
    },
  });

  const rotateServicePointTokenMutation = useMutation({
    mutationFn: (id: string) => rotateServicePointToken(id),
    onSuccess: () => invalidateServicePoints(),
  });

  const toggleActiveMutation = useMutation({
    mutationFn: ({ id, isActive }: { id: string; isActive: boolean }) =>
      updateTable(id, { isActive }),
    onSuccess: () => invalidateServicePoints(),
  });

  const updateServicePointMutation = useMutation({
    mutationFn: (input: {
      id: string;
      name: string;
      fulfillmentModes: FulfillmentMode[];
      paymentMethods: ServicePointPaymentMethod[];
    }) =>
      updateTable(input.id, {
        name: input.name.trim().replace(/\s+/g, " "),
        fulfillmentModes: input.fulfillmentModes,
        paymentMethods: input.paymentMethods,
      }),
    onSuccess: () => {
      invalidateServicePoints();
      setEditingServicePoint(null);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteTable(id),
    onSuccess: () => invalidateServicePoints(),
  });

  useEffect(() => {
    if (newServicePointType === "ROOM") {
      setNewFulfillmentModes(["ROOM_DELIVERY", "PICKUP"]);
      setNewPaymentMethods(
        paymentsEnabled ? ["ONLINE", "PAY_ON_DELIVERY"] : ["PAY_ON_DELIVERY"],
      );
    } else if (newServicePointType === "PICKUP") {
      setNewFulfillmentModes(["PICKUP"]);
      setNewPaymentMethods(
        paymentsEnabled ? ["ONLINE", "PAY_AT_PICKUP"] : ["PAY_AT_PICKUP"],
      );
    } else {
      setNewFulfillmentModes(["PICKUP"]);
      setNewPaymentMethods(paymentsEnabled ? ["ONLINE", "CASH"] : ["CASH"]);
    }
  }, [newServicePointType, paymentsEnabled]);

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
      if (method === "ONLINE" && !paymentsEnabled) return current;
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

  const handleCopy = async (id: string, url: string) => {
    if (!url) return;
    const ok = await copyToClipboard(url);
    if (ok) {
      setCopiedId(id);
      setTimeout(() => setCopiedId(null), 2000);
    }
  };

  const startEditing = (point: ServicePoint) => {
    setEditingServicePoint({
      id: point.id,
      name: point.name,
      fulfillmentModes: [...point.fulfillmentModes],
      paymentMethods: [...point.paymentMethods],
    });
  };

  const toggleEditingFulfillment = (mode: FulfillmentMode) => {
    setEditingServicePoint((current) => {
      if (!current) return current;
      const selected = current.fulfillmentModes.includes(mode);
      if (selected && current.fulfillmentModes.length === 1) return current;
      return {
        ...current,
        fulfillmentModes: selected
          ? current.fulfillmentModes.filter((value) => value !== mode)
          : [...current.fulfillmentModes, mode],
      };
    });
  };

  const toggleEditingPayment = (method: ServicePointPaymentMethod) => {
    setEditingServicePoint((current) => {
      if (!current) return current;
      const selected = current.paymentMethods.includes(method);
      if (method === "ONLINE" && !paymentsEnabled && !selected) return current;
      if (selected && current.paymentMethods.length === 1) return current;
      return {
        ...current,
        paymentMethods: selected
          ? current.paymentMethods.filter((value) => value !== method)
          : [...current.paymentMethods, method],
      };
    });
  };

  return (
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
                  disabled={option.value === "ONLINE" && !paymentsEnabled}
                  className={cn(
                    "rounded-lg border px-3 py-2 text-xs font-black transition disabled:cursor-not-allowed disabled:opacity-40",
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
            placeholder={t("servicePoints.search", "Search service points...")}
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
            const isEditing = editingServicePoint?.id === point.id;
            const publicUrl = point.publicToken
              ? `${window.location.origin}/menu/public/${restaurantId}?sp=${encodeURIComponent(point.publicToken)}`
              : "";
            const pointFulfillment = fulfillmentOptions
              .filter((option) => point.fulfillmentModes.includes(option.value))
              .map((option) => getFulfillmentOptionLabel(option.value));
            const pointPayment = paymentOptions
              .filter((option) => point.paymentMethods.includes(option.value))
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
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => startEditing(point)}
                      className="flex h-7 w-7 items-center justify-center rounded text-muted-foreground transition hover:bg-muted hover:text-foreground"
                      aria-label={t("menuAdmin.edit", "Edit")}
                    >
                      <Edit2 className="h-3.5 w-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        toggleActiveMutation.mutate({
                          id: point.id,
                          isActive: !point.isActive,
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
                </div>

                {isEditing && editingServicePoint ? (
                  <div
                    data-testid="service-point-editor"
                    className="space-y-3 rounded-lg border border-border bg-background p-3"
                  >
                    <input
                      value={editingServicePoint.name}
                      onChange={(event) =>
                        setEditingServicePoint((current) =>
                          current
                            ? { ...current, name: event.target.value }
                            : current,
                        )
                      }
                      className="h-9 w-full rounded border border-border bg-card px-2 text-sm font-bold text-foreground outline-none focus:border-primary"
                    />
                    <div className="flex flex-wrap gap-1.5">
                      {fulfillmentOptions.map((option) => (
                        <button
                          key={option.value}
                          type="button"
                          onClick={() => toggleEditingFulfillment(option.value)}
                          className={cn(
                            "rounded border px-2 py-1 text-[10px] font-black",
                            editingServicePoint.fulfillmentModes.includes(
                              option.value,
                            )
                              ? "border-primary bg-primary/10 text-primary"
                              : "border-border text-muted-foreground",
                          )}
                        >
                          {t(option.labelKey, option.fallback)}
                        </button>
                      ))}
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {paymentOptions.map((option) => {
                        const selected =
                          editingServicePoint.paymentMethods.includes(
                            option.value,
                          );
                        const disabled =
                          option.value === "ONLINE" &&
                          !paymentsEnabled &&
                          !selected;
                        return (
                          <button
                            key={option.value}
                            type="button"
                            onClick={() => toggleEditingPayment(option.value)}
                            disabled={disabled}
                            className={cn(
                              "rounded border px-2 py-1 text-[10px] font-black disabled:cursor-not-allowed disabled:opacity-40",
                              selected
                                ? "border-primary bg-primary/10 text-primary"
                                : "border-border text-muted-foreground",
                            )}
                          >
                            {t(option.labelKey, option.fallback)}
                          </button>
                        );
                      })}
                    </div>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() =>
                          updateServicePointMutation.mutate(editingServicePoint)
                        }
                        disabled={
                          !editingServicePoint.name.trim() ||
                          updateServicePointMutation.isPending
                        }
                        className="flex h-8 flex-1 items-center justify-center gap-1 rounded bg-primary text-xs font-black text-white disabled:opacity-50"
                      >
                        <Check className="h-3.5 w-3.5" />
                        {t("menuAdmin.save", "Save")}
                      </button>
                      <button
                        type="button"
                        onClick={() => setEditingServicePoint(null)}
                        className="flex h-8 flex-1 items-center justify-center gap-1 rounded border border-border text-xs font-black text-muted-foreground"
                      >
                        <X className="h-3.5 w-3.5" />
                        {t("menuAdmin.cancel", "Cancel")}
                      </button>
                    </div>
                  </div>
                ) : (
                  <>
                    <div className="flex items-center justify-between gap-2">
                      <span className="truncate text-xl font-black tracking-tight text-foreground">
                        {point.name}
                      </span>
                      <button
                        type="button"
                        onClick={() => handleCopy(point.id, publicUrl)}
                        className="flex h-7 shrink-0 items-center gap-1 rounded px-2 text-[10px] font-black text-muted-foreground transition hover:bg-muted hover:text-foreground"
                        title={publicUrl}
                      >
                        {copiedId === point.id ? (
                          <Check className="h-3 w-3 text-green-500" />
                        ) : (
                          <Copy className="h-3 w-3" />
                        )}
                        {copiedId === point.id
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
                  </>
                )}

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => onShowQr(point)}
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
  );
};

export default ServicePointsTab;
