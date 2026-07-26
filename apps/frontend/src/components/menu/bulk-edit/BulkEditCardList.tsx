import { useTranslation } from "react-i18next";
import { AlertTriangle } from "lucide-react";
import {
  BULK_COLUMNS,
  effectiveValue,
  type BulkColumnId,
  type BulkEdits,
} from "../../../lib/bulkEditUtils";
import { BulkEditCell } from "./BulkEditCell";
import type { BulkEditGroup } from "./BulkEditGrid";

interface BulkEditCardListProps {
  groups: BulkEditGroup[];
  showGroupHeaders: boolean;
  columns: BulkColumnId[];
  edits: BulkEdits;
  onCellChange: (itemId: string, field: BulkColumnId, value: unknown) => void;
  selectedIds: Set<string>;
  onToggleSelect: (itemId: string) => void;
  errorsByItemId: Record<string, string>;
}

// Mobile-first alternative to BulkEditGrid: the spreadsheet grid (frozen
// column, shift-click range select, TSV paste) assumes mouse+keyboard and
// doesn't translate to touch. This stacks one card per item instead — same
// fields, same BulkEditCell (parsing/validation/tags popover all shared),
// just a vertical layout with full-width touch targets. No range-select or
// clipboard paste here — neither is a coherent mobile gesture.
export function BulkEditCardList({
  groups,
  showGroupHeaders,
  columns,
  edits,
  onCellChange,
  selectedIds,
  onToggleSelect,
  errorsByItemId,
}: BulkEditCardListProps) {
  const { t } = useTranslation();
  const detailColumns = columns.filter((c) => c !== "name");
  const noop = () => {};

  return (
    <div className="space-y-6">
      {groups.map((group) => (
        <div key={group.categoryId} className="space-y-3">
          {showGroupHeaders && (
            <h3 className="px-1 text-xs font-black uppercase tracking-widest text-muted-foreground">
              {group.categoryName}
            </h3>
          )}
          {group.items.map((item) => {
            const rowError = errorsByItemId[item.id];
            const isDirty = !!edits[item.id];
            return (
              <div
                key={item.id}
                className={`rounded-2xl border p-4 space-y-3 ${
                  rowError
                    ? "border-destructive/40 bg-destructive/5"
                    : isDirty
                      ? "border-amber-500/40 bg-amber-500/5"
                      : "border-border/40 bg-background"
                }`}
              >
                <div className="flex items-start gap-3">
                  <input
                    type="checkbox"
                    checked={selectedIds.has(item.id)}
                    onChange={() => onToggleSelect(item.id)}
                    aria-label={item.name}
                    className="mt-2.5 shrink-0"
                  />
                  <div className="flex-1 min-w-0 rounded-lg border border-border/30">
                    <BulkEditCell
                      field="name"
                      value={effectiveValue(edits, item, "name")}
                      isDirty={!!edits[item.id] && "name" in edits[item.id]}
                      onChange={(value) => onCellChange(item.id, "name", value)}
                      onFocusCell={noop}
                      onMouseDownCell={noop}
                    />
                  </div>
                  {rowError && (
                    <AlertTriangle
                      className="w-4 h-4 text-destructive shrink-0 mt-2.5"
                      aria-label={rowError}
                    />
                  )}
                </div>

                {detailColumns.map((field) => (
                  <div key={field}>
                    <label className="block px-1 pb-1 text-[10px] font-black uppercase tracking-widest text-muted-foreground">
                      {t(
                        BULK_COLUMNS[field].labelKey,
                        BULK_COLUMNS[field].labelDefault,
                      )}
                    </label>
                    <div className="rounded-lg border border-border/30">
                      <BulkEditCell
                        field={field}
                        value={effectiveValue(edits, item, field)}
                        isDirty={!!edits[item.id] && field in edits[item.id]}
                        onChange={(value) =>
                          onCellChange(item.id, field, value)
                        }
                        onFocusCell={noop}
                        onMouseDownCell={noop}
                      />
                    </div>
                  </div>
                ))}
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}
