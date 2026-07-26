import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Modal } from "../../ui/modal";
import {
  applyPriceAdjustment,
  type PriceAdjustMode,
} from "../../../lib/bulkEditUtils";
import type { BulkEditItem } from "../../../lib/api";

interface BulkPriceAdjustModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Rows the adjustment applies to — checked rows, or all visible rows if none checked. */
  targetItems: BulkEditItem[];
  onApply: (changes: { id: string; price: number }[]) => void;
}

export function BulkPriceAdjustModal({
  open,
  onOpenChange,
  targetItems,
  onApply,
}: BulkPriceAdjustModalProps) {
  const { t } = useTranslation();
  const [mode, setMode] = useState<PriceAdjustMode>("percentage");
  const [sign, setSign] = useState<1 | -1>(1);
  const [value, setValue] = useState("10");

  const numericValue = parseFloat(value);
  const isValid = Number.isFinite(numericValue) && numericValue > 0;

  const preview = useMemo(() => {
    if (!isValid) return [];
    return targetItems.slice(0, 5).map((item) => ({
      item,
      newPrice: applyPriceAdjustment(item.price, {
        mode,
        sign,
        value: numericValue,
      }),
    }));
  }, [targetItems, mode, sign, numericValue, isValid]);

  function handleApply() {
    if (!isValid) return;
    onApply(
      targetItems.map((item) => ({
        id: item.id,
        price: applyPriceAdjustment(item.price, {
          mode,
          sign,
          value: numericValue,
        }),
      })),
    );
    onOpenChange(false);
  }

  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      title={t("bulkEdit.priceAdjust.title", "Bulk price adjustment")}
      description={t(
        "bulkEdit.priceAdjust.description",
        "Applies to {{count}} item(s) — review, then hit Save Changes to commit.",
        { count: targetItems.length },
      )}
    >
      <div className="space-y-5">
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setSign(1)}
            className={`flex-1 py-2.5 rounded-xl text-sm font-black uppercase tracking-widest transition-colors ${
              sign === 1
                ? "bg-primary text-white"
                : "bg-secondary/60 text-muted-foreground"
            }`}
          >
            {t("bulkEdit.priceAdjust.increase", "Increase")}
          </button>
          <button
            type="button"
            onClick={() => setSign(-1)}
            className={`flex-1 py-2.5 rounded-xl text-sm font-black uppercase tracking-widest transition-colors ${
              sign === -1
                ? "bg-primary text-white"
                : "bg-secondary/60 text-muted-foreground"
            }`}
          >
            {t("bulkEdit.priceAdjust.decrease", "Decrease")}
          </button>
        </div>

        <div className="flex gap-2">
          <input
            type="number"
            min="0"
            step="0.01"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            className="min-w-0 flex-1 h-11 px-4 rounded-xl bg-secondary/60 border border-border/40 text-sm font-semibold focus:ring-2 focus:ring-primary/40 focus:outline-none"
          />
          <select
            value={mode}
            onChange={(e) => setMode(e.target.value as PriceAdjustMode)}
            className="h-11 w-20 shrink-0 px-2 rounded-xl bg-secondary/60 border border-border/40 text-sm font-semibold"
          >
            <option value="percentage">
              {t("bulkEdit.priceAdjust.percent", "%")}
            </option>
            <option value="fixed">
              {t("bulkEdit.priceAdjust.fixedEur", "EUR")}
            </option>
          </select>
        </div>

        {preview.length > 0 && (
          <div className="rounded-xl bg-secondary/40 p-3 space-y-1.5">
            {preview.map(({ item, newPrice }) => (
              <div
                key={item.id}
                className="flex items-center justify-between text-xs"
              >
                <span className="truncate text-muted-foreground">
                  {item.name}
                </span>
                <span className="font-mono font-semibold text-foreground">
                  {item.price.toFixed(2)} → {newPrice.toFixed(2)}
                </span>
              </div>
            ))}
            {targetItems.length > preview.length && (
              <p className="text-[11px] text-muted-foreground pt-1">
                {t("bulkEdit.priceAdjust.andMore", "…and {{count}} more", {
                  count: targetItems.length - preview.length,
                })}
              </p>
            )}
          </div>
        )}

        <button
          type="button"
          onClick={handleApply}
          disabled={!isValid || targetItems.length === 0}
          className="w-full px-3 py-3 rounded-xl brand-cta text-white text-xs sm:text-sm font-black uppercase tracking-wide sm:tracking-widest leading-snug transition-all hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {t("bulkEdit.priceAdjust.apply", "Apply to {{count}} item(s)", {
            count: targetItems.length,
          })}
        </button>
      </div>
    </Modal>
  );
}
