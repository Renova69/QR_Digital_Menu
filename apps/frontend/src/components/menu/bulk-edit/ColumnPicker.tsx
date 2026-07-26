import { useEffect, useRef, useState } from "react";
import { Plus } from "lucide-react";
import { useTranslation } from "react-i18next";
import {
  ALWAYS_VISIBLE_COLUMNS,
  BULK_COLUMNS,
  OPTIONAL_COLUMN_GROUPS,
  type BulkColumnId,
} from "../../../lib/bulkEditUtils";

interface ColumnPickerProps {
  activeColumns: BulkColumnId[];
  onChange: (columns: BulkColumnId[]) => void;
}

const COLUMN_ORDER = Object.keys(BULK_COLUMNS) as BulkColumnId[];

function sortColumns(columns: BulkColumnId[]): BulkColumnId[] {
  return COLUMN_ORDER.filter((c) => columns.includes(c));
}

export function ColumnPicker({ activeColumns, onChange }: ColumnPickerProps) {
  const { t } = useTranslation();
  const [isOpen, setIsOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isOpen) return;
    const handler = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [isOpen]);

  function toggleGroup(columns: BulkColumnId[]) {
    const allActive = columns.every((c) => activeColumns.includes(c));
    const next = allActive
      ? activeColumns.filter((c) => !columns.includes(c))
      : [
          ...activeColumns,
          ...columns.filter((c) => !activeColumns.includes(c)),
        ];
    onChange(sortColumns([...ALWAYS_VISIBLE_COLUMNS, ...next]));
  }

  return (
    <div className="relative" ref={rootRef}>
      <button
        type="button"
        onClick={() => setIsOpen((o) => !o)}
        className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl border border-border/40 text-xs font-black uppercase tracking-widest text-muted-foreground hover:text-foreground hover:bg-secondary/60 transition-colors"
      >
        <Plus className="w-3.5 h-3.5" />
        {t("bulkEdit.addColumns", "Add columns")}
      </button>
      {isOpen && (
        <div className="absolute z-20 top-full left-0 mt-2 w-72 glass-panel bg-background rounded-2xl border border-border/60 p-3 shadow-2xl space-y-1">
          {OPTIONAL_COLUMN_GROUPS.map((group) => {
            const checked = group.columns.every((c) =>
              activeColumns.includes(c),
            );
            return (
              <label
                key={group.id}
                className="flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-secondary/60 cursor-pointer transition-colors"
              >
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={() => toggleGroup(group.columns)}
                />
                <span className="text-sm font-semibold text-foreground">
                  {t(group.labelKey, group.labelDefault)}
                </span>
              </label>
            );
          })}
        </div>
      )}
    </div>
  );
}
