import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "../ui/button";
import { TimeSelect, WEEKDAYS, fromHHMM } from "./shared";

export interface ServiceHoursEditorProps {
  initial: Map<number, { open: string; last: string }>;
  onSave: (
    rows: { weekday: number; openMinute: number; lastSlotMinute: number }[],
  ) => void;
  saving: boolean;
}

export function ServiceHoursEditor({
  initial,
  onSave,
  saving,
}: ServiceHoursEditorProps) {
  const { t } = useTranslation();
  const dayNames = ["", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
  const [rows, setRows] = useState<
    Record<number, { open: string; last: string }>
  >(() => {
    const r: Record<number, { open: string; last: string }> = {};
    for (const d of WEEKDAYS) r[d] = initial.get(d) ?? { open: "", last: "" };
    return r;
  });

  const save = () => {
    const payload = WEEKDAYS.filter((d) => rows[d].open && rows[d].last).map(
      (d) => ({
        weekday: d,
        openMinute: fromHHMM(rows[d].open),
        lastSlotMinute: fromHHMM(rows[d].last),
      }),
    );
    onSave(payload);
  };

  return (
    <div className="space-y-2">
      {WEEKDAYS.map((d) => (
        <div key={d} className="flex items-center gap-2 text-sm">
          <span className="w-10 text-gray-600">{dayNames[d]}</span>
          <TimeSelect
            value={rows[d].open}
            onChange={(v) =>
              setRows((p) => ({ ...p, [d]: { ...p[d], open: v } }))
            }
          />
          <span className="text-gray-400">→</span>
          <TimeSelect
            value={rows[d].last}
            onChange={(v) =>
              setRows((p) => ({ ...p, [d]: { ...p[d], last: v } }))
            }
          />
        </div>
      ))}
      <Button onClick={save} disabled={saving} className="mt-2">
        {t("reservations.saveHours", "Save service hours")}
      </Button>
    </div>
  );
}
