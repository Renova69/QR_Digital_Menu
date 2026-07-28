import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Target, Pencil, Check, X } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useDailyTarget } from "../../../hooks/useAnalytics";
import { setDailyTarget } from "../../../lib/api";
import { formatEuro } from "../../../lib/currency";
import { DashboardButton } from "../../../components/dashboard/DashboardButton";

interface DailyTargetCardProps {
  restaurantId: string | undefined;
}

/**
 * Daily revenue goal with a live progress bar (today's ordered revenue vs.
 * the owner-set target). Owner/manager can set or edit the goal inline. Render
 * only inside an ANALYTICS_BASIC-gated block — the endpoint is STARTER+.
 */
const DailyTargetCard = ({ restaurantId }: DailyTargetCardProps) => {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const { data } = useDailyTarget(restaurantId);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");

  const target = data?.target ?? 0;
  const actual = data?.actual ?? 0;
  const pct =
    target > 0 ? Math.min(100, Math.round((actual / target) * 100)) : 0;
  const reached = target > 0 && actual >= target;
  const remaining = Math.max(0, target - actual);

  const mutation = useMutation({
    mutationFn: (value: number) => setDailyTarget(restaurantId!, value),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["dailyTarget", restaurantId],
      });
      setEditing(false);
    },
  });

  const startEdit = () => {
    setDraft(target > 0 ? String(target) : "");
    setEditing(true);
  };

  const save = () => {
    const value = parseFloat(draft);
    if (!Number.isFinite(value) || value < 0) return;
    mutation.mutate(value);
  };

  return (
    <div className="glass-panel rounded-[1.5rem] p-4 sm:p-5">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-xl flex items-center justify-center bg-primary/10 border border-primary/15">
            <Target className="w-3.5 h-3.5 text-primary" />
          </div>
          <h3 className="text-sm font-display font-bold text-foreground">
            {t("dashboard.dailyTarget.title")}
          </h3>
        </div>
        {!editing && (
          <DashboardButton
            density="compact"
            onClick={startEdit}
            className="w-9 px-0 text-muted-foreground hover:bg-muted hover:text-foreground"
            aria-label={t("dashboard.dailyTarget.edit")}
          >
            <Pencil className="w-3.5 h-3.5" />
          </DashboardButton>
        )}
      </div>

      {editing ? (
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <input
              type="number"
              min={0}
              step="0.01"
              inputMode="decimal"
              autoFocus
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") save();
                if (e.key === "Escape") setEditing(false);
              }}
              placeholder={t("dashboard.dailyTarget.placeholder")}
              className="flex-1 rounded-lg border border-border bg-muted/40 px-3 py-2 text-sm font-mono"
            />
            <DashboardButton
              density="compact"
              onClick={save}
              disabled={mutation.isPending}
              className="w-9 border border-primary/20 bg-primary/10 px-0 text-primary hover:bg-primary/20"
              aria-label={t("dashboard.dailyTarget.save")}
            >
              <Check className="w-4 h-4" />
            </DashboardButton>
            <DashboardButton
              density="compact"
              onClick={() => setEditing(false)}
              className="w-9 border border-border px-0 text-muted-foreground hover:bg-muted hover:text-foreground"
              aria-label={t("dashboard.dailyTarget.cancel")}
            >
              <X className="w-4 h-4" />
            </DashboardButton>
          </div>
          {mutation.isError && (
            <p className="text-xs font-semibold text-destructive">
              {t("dashboard.dailyTarget.saveError")}
            </p>
          )}
        </div>
      ) : target > 0 ? (
        <>
          <div className="flex items-baseline justify-between mb-2 gap-2">
            <span className="text-[1.65rem] font-display font-bold text-foreground leading-none">
              {formatEuro(actual)}
            </span>
            <span className="text-xs text-muted-foreground shrink-0">
              {t("dashboard.dailyTarget.of", { target: formatEuro(target) })}
            </span>
          </div>
          <div
            className="h-2.5 w-full rounded-full bg-muted/50 overflow-hidden"
            role="progressbar"
            aria-valuenow={pct}
            aria-valuemin={0}
            aria-valuemax={100}
          >
            <div
              className="h-full rounded-full transition-[width] duration-500"
              style={{
                width: `${pct}%`,
                background: reached ? "#16a34a" : "var(--brand)",
              }}
            />
          </div>
          <p className="mt-2 text-xs font-semibold text-muted-foreground">
            {reached
              ? t("dashboard.dailyTarget.reached")
              : t("dashboard.dailyTarget.remaining", {
                  amount: formatEuro(remaining),
                  pct,
                })}
          </p>
        </>
      ) : (
        <DashboardButton
          onClick={startEdit}
          className="w-full border border-dashed border-border/60 bg-transparent text-muted-foreground hover:border-border hover:bg-muted/40 hover:text-foreground"
        >
          {t("dashboard.dailyTarget.setGoal")}
        </DashboardButton>
      )}
    </div>
  );
};

export default DailyTargetCard;
