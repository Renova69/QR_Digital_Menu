import { useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import type { BulkEditItem } from "../../../lib/api";
import {
  BULK_COLUMNS,
  CHECKBOX_COLUMN_STICKY_OFFSET_CLASS,
  CHECKBOX_COLUMN_WIDTH_CLASS,
  effectiveValue,
  parseCellValue,
  serializeCellValue,
  parseTsv,
  serializeTsv,
  type BulkColumnId,
  type BulkEdits,
} from "../../../lib/bulkEditUtils";
import { BulkEditCell } from "./BulkEditCell";

export interface BulkEditGroup {
  categoryId: string;
  categoryName: string;
  items: BulkEditItem[];
}

interface BulkEditGridProps {
  groups: BulkEditGroup[];
  showGroupHeaders: boolean;
  columns: BulkColumnId[];
  edits: BulkEdits;
  onCellChange: (itemId: string, field: BulkColumnId, value: unknown) => void;
  selectedIds: Set<string>;
  onToggleSelect: (itemId: string) => void;
  onToggleSelectAll: () => void;
  errorsByItemId: Record<string, string>;
}

interface CellPos {
  row: number;
  col: number;
}

export function BulkEditGrid({
  groups,
  showGroupHeaders,
  columns,
  edits,
  onCellChange,
  selectedIds,
  onToggleSelect,
  onToggleSelectAll,
  errorsByItemId,
}: BulkEditGridProps) {
  const { t } = useTranslation();
  const flatItems = useMemo(() => groups.flatMap((g) => g.items), [groups]);
  const [anchor, setAnchor] = useState<CellPos | null>(null);
  const [focus, setFocus] = useState<CellPos | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const allSelected =
    flatItems.length > 0 && flatItems.every((it) => selectedIds.has(it.id));

  function handleMouseDown(row: number, col: number, e: React.MouseEvent) {
    if (e.shiftKey && anchor) {
      setFocus({ row, col });
    } else {
      setAnchor({ row, col });
      setFocus({ row, col });
    }
  }

  function handleFocusCell(row: number, col: number) {
    setAnchor({ row, col });
    setFocus({ row, col });
  }

  function isSelected(row: number, col: number) {
    if (!anchor || !focus) return false;
    const r0 = Math.min(anchor.row, focus.row);
    const r1 = Math.max(anchor.row, focus.row);
    const c0 = Math.min(anchor.col, focus.col);
    const c1 = Math.max(anchor.col, focus.col);
    return row >= r0 && row <= r1 && col >= c0 && col <= c1;
  }

  function handleCopy(e: React.ClipboardEvent) {
    if (!anchor || !focus) return;
    const r0 = Math.min(anchor.row, focus.row);
    const r1 = Math.max(anchor.row, focus.row);
    const c0 = Math.min(anchor.col, focus.col);
    const c1 = Math.max(anchor.col, focus.col);
    if (r0 === r1 && c0 === c1) return; // single cell — let native copy proceed

    const rows: string[][] = [];
    for (let r = r0; r <= r1; r++) {
      const item = flatItems[r];
      if (!item) continue;
      const rowVals: string[] = [];
      for (let c = c0; c <= c1; c++) {
        const field = columns[c];
        if (!field) continue;
        const type = BULK_COLUMNS[field].type;
        rowVals.push(
          serializeCellValue(type, effectiveValue(edits, item, field)),
        );
      }
      rows.push(rowVals);
    }
    e.clipboardData.setData("text/plain", serializeTsv(rows));
    e.preventDefault();
  }

  function handlePaste(e: React.ClipboardEvent) {
    if (!focus) return;
    const text = e.clipboardData.getData("text/plain");
    if (!text) return;
    e.preventDefault();
    const rows = parseTsv(text);
    rows.forEach((rowCells, dr) => {
      const r = focus.row + dr;
      const item = flatItems[r];
      if (!item) return;
      rowCells.forEach((raw, dc) => {
        const c = focus.col + dc;
        const field = columns[c];
        if (!field) return;
        onCellChange(
          item.id,
          field,
          parseCellValue(BULK_COLUMNS[field].type, raw),
        );
      });
    });
  }

  function handleEnterKey(e: React.KeyboardEvent, row: number, col: number) {
    if (e.key !== "Enter") return;
    const nextRow = row + 1;
    if (!flatItems[nextRow]) return;
    e.preventDefault();
    const el = containerRef.current?.querySelector<HTMLElement>(
      `[data-cell-row="${nextRow}"][data-cell-col="${col}"] input, [data-cell-row="${nextRow}"][data-cell-col="${col}"] select, [data-cell-row="${nextRow}"][data-cell-col="${col}"] button`,
    );
    el?.focus();
  }

  const groupStarts = useMemo(() => {
    const starts: number[] = [];
    let cursor = 0;
    for (const group of groups) {
      starts.push(cursor);
      cursor += group.items.length;
    }
    return starts;
  }, [groups]);

  return (
    <div
      ref={containerRef}
      className="overflow-auto rounded-2xl border border-border/40 max-h-[70vh]"
      onCopy={handleCopy}
      onPaste={handlePaste}
    >
      <table className="w-full text-sm border-separate border-spacing-0">
        <thead className="sticky top-0 z-30 bg-secondary/95 backdrop-blur">
          <tr>
            <th
              className={`sticky left-0 z-30 ${CHECKBOX_COLUMN_WIDTH_CLASS} px-3 py-3 border-b border-border/40 bg-secondary/95`}
            >
              <input
                type="checkbox"
                checked={allSelected}
                onChange={onToggleSelectAll}
                aria-label={t("bulkEdit.selectAll", "Select all")}
              />
            </th>
            {columns.map((field, col) => (
              <th
                key={field}
                className={`text-left px-3 py-3 text-xs font-black uppercase tracking-widest text-muted-foreground whitespace-nowrap border-b border-border/40 ${BULK_COLUMNS[field].minWidthClass} ${
                  col === 0
                    ? `sticky ${CHECKBOX_COLUMN_STICKY_OFFSET_CLASS} z-30 bg-secondary/95`
                    : ""
                }`}
              >
                {t(
                  BULK_COLUMNS[field].labelKey,
                  BULK_COLUMNS[field].labelDefault,
                )}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {groups.map((group, i) => (
            <GroupRows
              key={group.categoryId}
              group={group}
              startIndex={groupStarts[i]}
              showGroupHeaders={showGroupHeaders}
              columns={columns}
              edits={edits}
              errorsByItemId={errorsByItemId}
              selectedIds={selectedIds}
              onToggleSelect={onToggleSelect}
              onCellChange={onCellChange}
              isSelected={isSelected}
              onMouseDown={handleMouseDown}
              onFocusCell={handleFocusCell}
              onEnterKey={handleEnterKey}
            />
          ))}
        </tbody>
      </table>
    </div>
  );
}

function GroupRows({
  group,
  startIndex,
  showGroupHeaders,
  columns,
  edits,
  errorsByItemId,
  selectedIds,
  onToggleSelect,
  onCellChange,
  isSelected,
  onMouseDown,
  onFocusCell,
  onEnterKey,
}: {
  group: BulkEditGroup;
  startIndex: number;
  showGroupHeaders: boolean;
  columns: BulkColumnId[];
  edits: BulkEdits;
  errorsByItemId: Record<string, string>;
  selectedIds: Set<string>;
  onToggleSelect: (id: string) => void;
  onCellChange: (itemId: string, field: BulkColumnId, value: unknown) => void;
  isSelected: (row: number, col: number) => boolean;
  onMouseDown: (row: number, col: number, e: React.MouseEvent) => void;
  onFocusCell: (row: number, col: number) => void;
  onEnterKey: (e: React.KeyboardEvent, row: number, col: number) => void;
}) {
  return (
    <>
      {showGroupHeaders && (
        <tr className="bg-secondary/40">
          <td
            colSpan={2}
            className="sticky left-0 z-20 bg-secondary/40 px-3 py-2 text-xs font-black uppercase tracking-widest text-muted-foreground whitespace-nowrap"
          >
            {group.categoryName}
          </td>
          {columns.length > 1 && (
            <td colSpan={columns.length - 1} className="bg-secondary/40" />
          )}
        </tr>
      )}
      {group.items.map((item, i) => {
        const row = startIndex + i;
        const rowError = errorsByItemId[item.id];
        const rowBg = rowError ? "bg-destructive/5" : "bg-background";
        return (
          <tr
            key={item.id}
            className={`hover:bg-secondary/10 ${rowBg}`}
            title={rowError}
          >
            <td
              className={`sticky left-0 z-20 ${CHECKBOX_COLUMN_WIDTH_CLASS} px-3 py-1.5 align-top border-b border-border/20 ${rowBg}`}
            >
              <input
                type="checkbox"
                checked={selectedIds.has(item.id)}
                onChange={() => onToggleSelect(item.id)}
                aria-label={item.name}
              />
            </td>
            {columns.map((field, col) => (
              <td
                key={field}
                data-cell-row={row}
                data-cell-col={col}
                className={`p-0 align-top border-b border-l border-border/20 first:border-l-0 ${rowBg} ${BULK_COLUMNS[field].minWidthClass} ${
                  col === 0
                    ? `sticky ${CHECKBOX_COLUMN_STICKY_OFFSET_CLASS} z-20`
                    : ""
                } ${
                  isSelected(row, col)
                    ? "ring-2 ring-inset ring-primary/50"
                    : ""
                }`}
                onKeyDown={(e) => onEnterKey(e, row, col)}
              >
                <BulkEditCell
                  field={field}
                  value={effectiveValue(edits, item, field)}
                  isDirty={!!edits[item.id] && field in edits[item.id]}
                  onChange={(value) => onCellChange(item.id, field, value)}
                  onFocusCell={() => onFocusCell(row, col)}
                  onMouseDownCell={(e) => onMouseDown(row, col, e)}
                />
              </td>
            ))}
          </tr>
        );
      })}
    </>
  );
}
