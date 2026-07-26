import { useContext, useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { AlertTriangle, Loader2 } from "lucide-react";
import RestaurantContext from "../../context/RestaurantContext";
import { useMenuContext } from "../../context/MenuContext";
import {
  getBulkEditItems,
  bulkUpdateMenuItems,
  type BulkEditItem,
} from "../../lib/api";
import { getApiError } from "../../lib/apiError";
import {
  ALWAYS_VISIBLE_COLUMNS,
  buildBulkUpdatePayload,
  setFieldEdit,
  type BulkColumnId,
  type BulkEdits,
} from "../../lib/bulkEditUtils";
import { BulkEditToolbar } from "../../components/menu/bulk-edit/BulkEditToolbar";
import {
  BulkEditGrid,
  type BulkEditGroup,
} from "../../components/menu/bulk-edit/BulkEditGrid";
import { BulkEditCardList } from "../../components/menu/bulk-edit/BulkEditCardList";
import { BulkPriceAdjustModal } from "../../components/menu/bulk-edit/BulkPriceAdjustModal";

function columnsStorageKey(restaurantId: string) {
  return `bulkEdit.columns.${restaurantId}`;
}

export default function BulkEditView() {
  const { activeRestaurant }: any = useContext(RestaurantContext);
  const { categories } = useMenuContext();
  const { t } = useTranslation();
  const queryClient = useQueryClient();

  const restaurantId = activeRestaurant?.id as string | undefined;

  const [scopeCategoryId, setScopeCategoryId] = useState<string | null>(null);
  const [activeColumns, setActiveColumns] = useState<BulkColumnId[]>(
    ALWAYS_VISIBLE_COLUMNS,
  );
  const [edits, setEdits] = useState<BulkEdits>({});
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [errorsByItemId, setErrorsByItemId] = useState<Record<string, string>>(
    {},
  );
  const [priceModalOpen, setPriceModalOpen] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  useEffect(() => {
    if (!restaurantId) return;
    try {
      const raw = localStorage.getItem(columnsStorageKey(restaurantId));
      if (raw) {
        const stored: BulkColumnId[] = JSON.parse(raw);
        setActiveColumns(
          Array.from(new Set([...ALWAYS_VISIBLE_COLUMNS, ...stored])),
        );
      }
    } catch {
      // corrupt/unavailable localStorage — fall back to defaults silently
    }
  }, [restaurantId]);

  function handleColumnsChange(columns: BulkColumnId[]) {
    setActiveColumns(columns);
    if (restaurantId) {
      localStorage.setItem(
        columnsStorageKey(restaurantId),
        JSON.stringify(columns),
      );
    }
  }

  const {
    data: items,
    isLoading,
    isError,
    error,
  } = useQuery({
    queryKey: ["bulk-edit-items", restaurantId],
    queryFn: () => getBulkEditItems(restaurantId!),
    enabled: !!restaurantId,
  });

  const scopedItems = useMemo(() => {
    if (!items) return [];
    return scopeCategoryId
      ? items.filter((it) => it.categoryId === scopeCategoryId)
      : items;
  }, [items, scopeCategoryId]);

  const groups: BulkEditGroup[] = useMemo(() => {
    if (!categories) return [];
    const byCategory = new Map<string, BulkEditItem[]>();
    for (const item of scopedItems) {
      const list = byCategory.get(item.categoryId) ?? [];
      list.push(item);
      byCategory.set(item.categoryId, list);
    }
    return categories
      .filter((cat) => byCategory.has(cat.id))
      .map((cat) => ({
        categoryId: cat.id,
        categoryName: cat.name,
        items: byCategory.get(cat.id) ?? [],
      }));
  }, [categories, scopedItems]);

  const originalsById = useMemo(() => {
    const map = new Map<string, BulkEditItem>();
    for (const item of items ?? []) map.set(item.id, item);
    return map;
  }, [items]);

  const dirtyCount = Object.keys(edits).length;

  function handleCellChange(
    itemId: string,
    field: BulkColumnId,
    value: unknown,
  ) {
    const original = originalsById.get(itemId);
    if (!original) return;
    setEdits((prev) => setFieldEdit(prev, itemId, field, value, original));
  }

  function toggleSelect(itemId: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(itemId)) next.delete(itemId);
      else next.add(itemId);
      return next;
    });
  }

  function toggleSelectAll() {
    setSelectedIds((prev) =>
      prev.size === scopedItems.length
        ? new Set()
        : new Set(scopedItems.map((it) => it.id)),
    );
  }

  const saveMutation = useMutation({
    mutationFn: () =>
      bulkUpdateMenuItems(restaurantId!, buildBulkUpdatePayload(edits)),
    onSuccess: (result) => {
      setSaveError(null);
      setEdits((prev) => {
        const next = { ...prev };
        for (const id of result.updated) delete next[id];
        return next;
      });
      const nextErrors: Record<string, string> = {};
      for (const f of result.failed) nextErrors[f.id] = f.error;
      setErrorsByItemId(nextErrors);

      const touchedCategoryIds = new Set(
        result.updated
          .map((id) => originalsById.get(id)?.categoryId)
          .filter((v): v is string => !!v),
      );
      for (const categoryId of touchedCategoryIds) {
        queryClient.invalidateQueries({ queryKey: ["items", categoryId] });
      }
      queryClient.invalidateQueries({
        queryKey: ["bulk-edit-items", restaurantId],
      });
    },
    onError: (err) => setSaveError(getApiError(err)),
  });

  function handleDiscard() {
    if (
      dirtyCount > 0 &&
      !window.confirm(
        t("bulkEdit.confirmDiscard", "Discard {{count}} unsaved change(s)?", {
          count: dirtyCount,
        }) as string,
      )
    ) {
      return;
    }
    setEdits({});
    setErrorsByItemId({});
  }

  const priceAdjustTargets = useMemo(() => {
    const base =
      selectedIds.size > 0
        ? scopedItems.filter((it) => selectedIds.has(it.id))
        : scopedItems;
    return base;
  }, [scopedItems, selectedIds]);

  function handleApplyPriceAdjust(changes: { id: string; price: number }[]) {
    for (const { id, price } of changes) {
      handleCellChange(id, "price", price);
    }
  }

  if (!activeRestaurant) return null;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-display font-black text-foreground">
          {t("bulkEdit.title", "Bulk Edit")}
        </h2>
        <p className="text-sm text-muted-foreground mt-1">
          {t(
            "bulkEdit.subtitle",
            "Edit prices and details across your whole menu like a spreadsheet — click a cell, paste from Excel, or adjust prices in bulk.",
          )}
        </p>
      </div>

      <BulkEditToolbar
        categories={categories ?? []}
        scopeCategoryId={scopeCategoryId}
        onScopeChange={setScopeCategoryId}
        activeColumns={activeColumns}
        onColumnsChange={handleColumnsChange}
        dirtyCount={dirtyCount}
        selectedCount={selectedIds.size}
        isSaving={saveMutation.isPending}
        onSave={() => saveMutation.mutate()}
        onDiscard={handleDiscard}
        onOpenPriceAdjust={() => setPriceModalOpen(true)}
      />

      {saveError && (
        <div className="rounded-xl border border-destructive/20 bg-destructive/5 p-4 flex items-center gap-3">
          <AlertTriangle className="w-4 h-4 text-destructive shrink-0" />
          <p className="text-sm text-destructive">{t(saveError)}</p>
        </div>
      )}

      {Object.keys(errorsByItemId).length > 0 && (
        <div className="rounded-xl border border-destructive/20 bg-destructive/5 p-4 flex items-center gap-3">
          <AlertTriangle className="w-4 h-4 text-destructive shrink-0" />
          <p className="text-sm text-destructive">
            {t(
              "bulkEdit.partialFailure",
              "{{count}} row(s) failed to save — hover the highlighted rows for details.",
              { count: Object.keys(errorsByItemId).length },
            )}
          </p>
        </div>
      )}

      {isLoading ? (
        <div className="flex justify-center p-8">
          <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
        </div>
      ) : isError ? (
        <div className="rounded-xl border border-destructive/20 bg-destructive/5 p-4">
          <p className="text-sm text-destructive">{t(getApiError(error))}</p>
        </div>
      ) : (
        <>
          {/* Spreadsheet grid assumes mouse+keyboard (frozen column, shift-click
              range select, TSV paste) — tablet/desktop only. Mobile gets a
              stacked card-per-item layout instead (see BulkEditCardList). */}
          <div className="hidden md:block">
            <BulkEditGrid
              groups={groups}
              showGroupHeaders={!scopeCategoryId}
              columns={activeColumns}
              edits={edits}
              onCellChange={handleCellChange}
              selectedIds={selectedIds}
              onToggleSelect={toggleSelect}
              onToggleSelectAll={toggleSelectAll}
              errorsByItemId={errorsByItemId}
            />
          </div>
          <div className="md:hidden">
            <BulkEditCardList
              groups={groups}
              showGroupHeaders={!scopeCategoryId}
              columns={activeColumns}
              edits={edits}
              onCellChange={handleCellChange}
              selectedIds={selectedIds}
              onToggleSelect={toggleSelect}
              errorsByItemId={errorsByItemId}
            />
          </div>
        </>
      )}

      <BulkPriceAdjustModal
        open={priceModalOpen}
        onOpenChange={setPriceModalOpen}
        targetItems={priceAdjustTargets}
        onApply={handleApplyPriceAdjust}
      />
    </div>
  );
}
