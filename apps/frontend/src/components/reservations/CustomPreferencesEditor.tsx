import { useState } from "react";
import { useTranslation } from "react-i18next";
import { DashboardButton } from "../dashboard/DashboardButton";

export interface CustomPreferencesEditorProps {
  initial: string[];
  onSave: (labels: string[]) => void;
  saving: boolean;
}

export function CustomPreferencesEditor({
  initial,
  onSave,
  saving,
}: CustomPreferencesEditorProps) {
  const { t } = useTranslation();
  const [labels, setLabels] = useState<string[]>(initial);
  const [input, setInput] = useState("");

  const add = () => {
    const v = input.trim();
    if (!v) return;
    if (labels.some((l) => l.toLowerCase() === v.toLowerCase())) {
      setInput("");
      return;
    }
    setLabels((p) => [...p, v]);
    setInput("");
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        {labels.length === 0 && (
          <span className="text-xs text-gray-400">
            {t("reservations.noCustomPrefs", "No custom chips yet.")}
          </span>
        )}
        {labels.map((l) => (
          <span
            key={l}
            className="inline-flex min-h-9 items-center gap-1.5 rounded-full bg-indigo-50 px-3 py-1.5 text-sm font-medium text-indigo-700"
          >
            {l}
            <button
              onClick={() => setLabels((p) => p.filter((x) => x !== l))}
              className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-sm text-indigo-400 transition hover:bg-indigo-100 hover:text-indigo-700"
              aria-label="remove"
            >
              ×
            </button>
          </span>
        ))}
      </div>
      <div className="flex flex-col gap-2 sm:flex-row">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              add();
            }
          }}
          maxLength={40}
          placeholder={t("reservations.addChipPlaceholder", "Add a chip…")}
          className="h-12 min-h-12 min-w-0 w-full shrink-0 rounded-lg border border-border bg-background px-4 text-base text-foreground outline-none placeholder:text-muted-foreground/70 focus:border-primary focus:ring-2 focus:ring-primary/15 sm:flex-1 sm:text-sm"
        />
        <DashboardButton
          onClick={add}
          className="h-12 min-h-12 w-full shrink-0 border border-border bg-card px-4 text-foreground hover:bg-muted sm:w-auto"
        >
          {t("reservations.add", "Add")}
        </DashboardButton>
      </div>
      <DashboardButton
        onClick={() => onSave(labels)}
        disabled={saving}
        className="brand-cta mt-1 h-12 min-h-12 w-full text-white shadow-lg sm:w-auto"
      >
        {t("reservations.savePrefs", "Save chips")}
      </DashboardButton>
    </div>
  );
}
