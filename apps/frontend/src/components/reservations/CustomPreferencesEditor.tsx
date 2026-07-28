import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "../ui/button";

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
    <div className="space-y-2">
      <div className="flex flex-wrap gap-1.5">
        {labels.length === 0 && (
          <span className="text-xs text-gray-400">
            {t("reservations.noCustomPrefs", "No custom chips yet.")}
          </span>
        )}
        {labels.map((l) => (
          <span
            key={l}
            className="inline-flex items-center gap-1 text-xs bg-indigo-50 text-indigo-700 rounded-full px-2.5 py-1"
          >
            {l}
            <button
              onClick={() => setLabels((p) => p.filter((x) => x !== l))}
              className="text-indigo-400 hover:text-indigo-700"
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
          className="h-11 min-w-0 w-full flex-1 rounded-lg border border-border bg-background px-3 text-sm text-foreground outline-none focus:border-primary focus:ring-2 focus:ring-primary/15"
        />
        <button
          onClick={add}
          className="h-11 w-full shrink-0 rounded-lg border border-border bg-card px-4 text-sm font-semibold text-foreground transition hover:bg-muted sm:w-auto"
        >
          {t("reservations.add", "Add")}
        </button>
      </div>
      <Button onClick={() => onSave(labels)} disabled={saving} className="mt-1">
        {t("reservations.savePrefs", "Save chips")}
      </Button>
    </div>
  );
}
