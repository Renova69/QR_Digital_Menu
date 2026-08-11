import React, { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { X, AlertTriangle } from "lucide-react";
import { Button } from "../ui/button";
import {
  getItemTranslations,
  updateItemTranslation,
  type ItemTranslations,
} from "../../lib/api";

interface Props {
  itemId: string;
  onClose: () => void;
}

export const TranslationOverrideModal: React.FC<Props> = ({
  itemId,
  onClose,
}) => {
  const { t } = useTranslation();
  const [data, setData] = useState<ItemTranslations | null>(null);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [savingLocale, setSavingLocale] = useState<string | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    getItemTranslations(itemId)
      .then((result) => {
        if (cancelled) return;
        setData(result);
        setDrafts(
          Object.fromEntries(
            result.locales.map((l) => [l.locale, l.value ?? ""]),
          ),
        );
      })
      .catch(() =>
        setError(
          t("menuAdmin.translationsLoadFailed", "Could not load translations."),
        ),
      );
    return () => {
      cancelled = true;
    };
  }, [itemId, t]);

  const save = async (locale: string) => {
    setSavingLocale(locale);
    setError("");
    try {
      const next = drafts[locale]?.trim() ?? "";
      const result = await updateItemTranslation(itemId, locale, next || null);
      setData(result);
    } catch {
      setError(
        t(
          "menuAdmin.translationsSaveFailed",
          "Could not save. Please try again.",
        ),
      );
    } finally {
      setSavingLocale(null);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-lg rounded-2xl bg-background p-5 shadow-xl">
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <h2 className="text-base font-bold text-foreground">
              {t("menuAdmin.editTranslations", "Edit translations")}
            </h2>
            {data && (
              <p className="mt-1 text-xs text-muted-foreground">
                {data.sourceLang.toUpperCase()}: {data.sourceText}
              </p>
            )}
          </div>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={onClose}
          >
            <X className="h-4 w-4" />
          </Button>
        </div>

        {error && <p className="mb-3 text-xs text-red-600">{error}</p>}

        <div className="space-y-3">
          {data?.locales.map((entry) => (
            <div key={entry.locale}>
              <label
                htmlFor={`xlate-${entry.locale}`}
                className="mb-1 block text-xs font-bold uppercase tracking-wide text-muted-foreground"
              >
                {entry.locale}
              </label>
              <div className="flex gap-2">
                <input
                  id={`xlate-${entry.locale}`}
                  aria-label={entry.locale}
                  value={drafts[entry.locale] ?? ""}
                  onChange={(e) =>
                    setDrafts((prev) => ({
                      ...prev,
                      [entry.locale]: e.target.value,
                    }))
                  }
                  className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm text-foreground"
                />
                <Button
                  size="sm"
                  className="h-9"
                  disabled={savingLocale === entry.locale}
                  onClick={() => save(entry.locale)}
                >
                  {t("common.save", "Save")}
                </Button>
              </div>
              {entry.status === "MANUAL" && (
                <p className="mt-1 text-[11px] text-muted-foreground">
                  {t(
                    "menuAdmin.manualOverride",
                    "Your wording — never overwritten by automatic translation.",
                  )}
                </p>
              )}
              {entry.sourceChanged && (
                <p className="mt-1 flex items-center gap-1 text-[11px] text-amber-600">
                  <AlertTriangle className="h-3 w-3" />
                  {t(
                    "menuAdmin.sourceChangedSinceOverride",
                    "Source text changed since you edited this.",
                  )}
                </p>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
