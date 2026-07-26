import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import { TagPicker } from "../TagPicker";
import { ALLERGEN_TAGS, DIETARY_TAGS, resolveTag } from "../../../lib/menuTags";
import {
  BULK_COLUMNS,
  parseCellValue,
  type BulkColumnId,
} from "../../../lib/bulkEditUtils";

interface BulkEditCellProps {
  field: BulkColumnId;
  value: unknown;
  isDirty: boolean;
  onChange: (value: unknown) => void;
  onFocusCell: () => void;
  onMouseDownCell: (e: React.MouseEvent) => void;
}

const inputBase =
  "w-full h-full bg-transparent px-2 py-1.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40 rounded-md";

export function BulkEditCell({
  field,
  value,
  isDirty,
  onChange,
  onFocusCell,
  onMouseDownCell,
}: BulkEditCellProps) {
  const { t } = useTranslation();
  const [tagsOpen, setTagsOpen] = useState(false);
  const [popoverPos, setPopoverPos] = useState<{
    top: number;
    left: number;
  } | null>(null);
  const tagsTriggerRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const type = BULK_COLUMNS[field].type;

  // Positions the tags popover in a document.body portal instead of nesting
  // it inside the table cell — the grid's scroll container clips/obscures
  // regular absolutely-positioned overlays (worst on mobile, where the popup
  // rendered underneath the following rows instead of floating above them).
  useEffect(() => {
    if (!tagsOpen) return;
    const rect = tagsTriggerRef.current?.getBoundingClientRect();
    if (!rect) return;
    const width = 256; // w-64
    setPopoverPos({
      top: rect.bottom + 4,
      left: Math.max(8, Math.min(rect.left, window.innerWidth - width - 8)),
    });
  }, [tagsOpen]);

  useEffect(() => {
    if (!tagsOpen) return;
    const closeOnOutside = (e: MouseEvent) => {
      const target = e.target as Node;
      if (
        popoverRef.current?.contains(target) ||
        tagsTriggerRef.current?.contains(target)
      ) {
        return;
      }
      setTagsOpen(false);
    };
    // capture phase so a scroll on the grid's own overflow container (which
    // doesn't bubble to window) still closes the popover instead of leaving
    // it floating over the wrong row.
    const closeOnScroll = () => setTagsOpen(false);
    document.addEventListener("mousedown", closeOnOutside);
    window.addEventListener("scroll", closeOnScroll, true);
    window.addEventListener("resize", closeOnScroll);
    return () => {
      document.removeEventListener("mousedown", closeOnOutside);
      window.removeEventListener("scroll", closeOnScroll, true);
      window.removeEventListener("resize", closeOnScroll);
    };
  }, [tagsOpen]);

  const wrapperClass = `relative ${isDirty ? "bg-amber-500/10" : ""}`;

  if (type === "boolean") {
    return (
      <div className={wrapperClass} onMouseDown={onMouseDownCell}>
        <button
          type="button"
          onFocus={onFocusCell}
          onClick={() => onChange(!value)}
          className={`mx-2 my-1.5 h-5 w-9 rounded-full transition-colors relative ${
            value ? "bg-primary" : "bg-secondary border border-border/60"
          }`}
          aria-pressed={!!value}
        >
          <span
            className={`absolute left-0.5 top-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform ${
              value ? "translate-x-4" : "translate-x-0"
            }`}
          />
        </button>
      </div>
    );
  }

  if (type === "rewardMode") {
    return (
      <div className={wrapperClass} onMouseDown={onMouseDownCell}>
        <select
          value={(value as string) || "OFF"}
          onFocus={onFocusCell}
          onChange={(e) => onChange(e.target.value)}
          className={`${inputBase} cursor-pointer`}
        >
          <option value="OFF">{t("bulkEdit.rewardMode.off", "Off")}</option>
          <option value="AUTO">{t("bulkEdit.rewardMode.auto", "Auto")}</option>
          <option value="CUSTOM">
            {t("bulkEdit.rewardMode.custom", "Custom")}
          </option>
        </select>
      </div>
    );
  }

  if (type === "tags") {
    const list = Array.isArray(value) ? (value as string[]) : [];
    const options = field === "allergens" ? ALLERGEN_TAGS : DIETARY_TAGS;
    const displayLabels = list.map((key) => {
      const preset = resolveTag(key);
      return preset ? t(preset.labelKey, key) : key;
    });
    return (
      <div className={wrapperClass} onMouseDown={onMouseDownCell}>
        <button
          type="button"
          ref={tagsTriggerRef}
          onFocus={onFocusCell}
          onClick={() => setTagsOpen((o) => !o)}
          className={`${inputBase} text-left truncate`}
        >
          {displayLabels.length
            ? displayLabels.join(", ")
            : t("bulkEdit.addTags", "+ Add")}
        </button>
        {tagsOpen &&
          popoverPos &&
          createPortal(
            <div
              ref={popoverRef}
              style={{ top: popoverPos.top, left: popoverPos.left }}
              className="fixed z-[1000] w-64 max-w-[calc(100vw-1rem)] glass-panel bg-background rounded-xl border border-border/60 p-3 shadow-2xl"
            >
              <TagPicker
                label=""
                value={list}
                onChange={(next) => onChange(next)}
                options={options}
              />
              <button
                type="button"
                onClick={() => setTagsOpen(false)}
                className="mt-2 text-[11px] font-bold uppercase tracking-wider text-muted-foreground hover:text-foreground"
              >
                {t("bulkEdit.done", "Done")}
              </button>
            </div>,
            document.body,
          )}
      </div>
    );
  }

  const inputType = type === "number" ? "number" : "text";
  const asText =
    value === null || value === undefined
      ? ""
      : Array.isArray(value)
        ? value.join(", ")
        : String(value);

  // Local draft buffer: while focused, the input shows exactly what was
  // typed (so "1." doesn't get squashed back to "1" by the parsed-number
  // round-trip on every keystroke). Only resyncs from the incoming value
  // when the cell isn't focused — e.g. after a paste or price-adjust touches
  // a cell the user isn't currently editing.
  const [isFocused, setIsFocused] = useState(false);
  const [draft, setDraft] = useState(asText);
  useEffect(() => {
    if (!isFocused) setDraft(asText);
  }, [asText, isFocused]);

  return (
    <div className={wrapperClass} onMouseDown={onMouseDownCell}>
      <input
        type={inputType}
        step={type === "number" ? "0.01" : undefined}
        value={draft}
        onFocus={() => {
          setIsFocused(true);
          onFocusCell();
        }}
        onBlur={() => setIsFocused(false)}
        onChange={(e) => {
          setDraft(e.target.value);
          onChange(parseCellValue(type, e.target.value));
        }}
        className={inputBase}
      />
    </div>
  );
}
