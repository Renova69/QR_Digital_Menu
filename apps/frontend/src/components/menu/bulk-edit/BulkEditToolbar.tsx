import { Percent, Save, Undo2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { Category } from "../../../types";
import { ColumnPicker } from "./ColumnPicker";
import type { BulkColumnId } from "../../../lib/bulkEditUtils";

interface BulkEditToolbarProps {
  categories: Category[];
  scopeCategoryId: string | null;
  onScopeChange: (id: string | null) => void;
  activeColumns: BulkColumnId[];
  onColumnsChange: (columns: BulkColumnId[]) => void;
  dirtyCount: number;
  selectedCount: number;
  isSaving: boolean;
  onSave: () => void;
  onDiscard: () => void;
  onOpenPriceAdjust: () => void;
}

export function BulkEditToolbar({
  categories,
  scopeCategoryId,
  onScopeChange,
  activeColumns,
  onColumnsChange,
  dirtyCount,
  selectedCount,
  isSaving,
  onSave,
  onDiscard,
  onOpenPriceAdjust,
}: BulkEditToolbarProps) {
  const { t } = useTranslation();

  return (
    <div className="flex flex-wrap items-center gap-3 justify-between">
      <div className="flex flex-wrap items-center gap-3">
        <select
          value={scopeCategoryId ?? "__all__"}
          onChange={(e) =>
            onScopeChange(e.target.value === "__all__" ? null : e.target.value)
          }
          className="h-10 px-3 rounded-xl text-xs font-bold bg-secondary border border-border/40"
        >
          <option value="__all__">
            {t("bulkEdit.wholeMenu", "Whole menu")}
          </option>
          {categories.map((cat) => (
            <option key={cat.id} value={cat.id}>
              {cat.name}
            </option>
          ))}
        </select>

        <ColumnPicker
          activeColumns={activeColumns}
          onChange={onColumnsChange}
        />

        <button
          type="button"
          onClick={onOpenPriceAdjust}
          className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl border border-border/40 text-xs font-black uppercase tracking-widest text-muted-foreground hover:text-foreground hover:bg-secondary/60 transition-colors"
        >
          <Percent className="w-3.5 h-3.5" />
          {selectedCount > 0
            ? t("bulkEdit.priceAdjustSelected", "Adjust price ({{count}})", {
                count: selectedCount,
              })
            : t("bulkEdit.priceAdjustAll", "Adjust price (all visible)")}
        </button>
      </div>

      <div className="flex items-center gap-2">
        {dirtyCount > 0 && (
          <button
            type="button"
            onClick={onDiscard}
            className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-xs font-bold text-muted-foreground hover:text-foreground transition-colors"
          >
            <Undo2 className="w-3.5 h-3.5" />
            {t("bulkEdit.discard", "Discard")}
          </button>
        )}
        <button
          type="button"
          onClick={onSave}
          disabled={dirtyCount === 0 || isSaving}
          className="flex items-center gap-2 px-6 py-2.5 rounded-xl brand-cta text-white text-sm font-black uppercase tracking-widest transition-all hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <Save className="w-4 h-4" />
          {isSaving
            ? t("bulkEdit.saving", "Saving…")
            : t("bulkEdit.saveChanges", "Save changes ({{count}})", {
                count: dirtyCount,
              })}
        </button>
      </div>
    </div>
  );
}
