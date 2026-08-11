import React, { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import { X, AlertTriangle } from "lucide-react";
import { Button } from "../ui/button";
import {
  getItemTranslations,
  updateItemTranslation,
  type ItemTranslations,
  type TranslationOverrideField,
} from "../../lib/api";

interface Props {
  itemId: string;
  onClose: () => void;
}

type TranslationDrafts = Record<
  TranslationOverrideField,
  Record<string, string>
>;

const createDrafts = (data: ItemTranslations): TranslationDrafts => ({
  NAME: Object.fromEntries(
    data.locales.map((entry) => [entry.locale, entry.name.value ?? ""]),
  ),
  DESCRIPTION: Object.fromEntries(
    data.locales.map((entry) => [entry.locale, entry.description.value ?? ""]),
  ),
});

export const TranslationOverrideModal: React.FC<Props> = ({
  itemId,
  onClose,
}) => {
  const { t } = useTranslation();
  const [data, setData] = useState<ItemTranslations | null>(null);
  const [activeField, setActiveField] =
    useState<TranslationOverrideField>("NAME");
  const [drafts, setDrafts] = useState<TranslationDrafts>({
    NAME: {},
    DESCRIPTION: {},
  });
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    getItemTranslations(itemId)
      .then((result) => {
        if (cancelled) return;
        setData(result);
        setDrafts(createDrafts(result));
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
    const field = activeField;
    const key = `${field}:${locale}`;
    setSavingKey(key);
    setError("");
    try {
      const next = drafts[field][locale]?.trim() ?? "";
      const result = await updateItemTranslation(
        itemId,
        field,
        locale,
        next || null,
      );
      setData(result);
    } catch {
      setError(
        t(
          "menuAdmin.translationsSaveFailed",
          "Could not save. Please try again.",
        ),
      );
    } finally {
      setSavingKey(null);
    }
  };

  const activeKey = activeField === "NAME" ? "name" : "description";
  const editingDescriptions = activeField === "DESCRIPTION";
  const titleId = "translation-override-title";

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="max-h-[85vh] w-full max-w-lg overflow-y-auto rounded-2xl bg-background p-5 shadow-xl"
      >
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <h2 id={titleId} className="text-base font-bold text-foreground">
              {t("menuAdmin.editTranslations", "Edit translations")}
            </h2>
            {data && (
              <p className="mt-1 text-xs text-muted-foreground">
                {t(
                  editingDescriptions
                    ? "menuAdmin.sourceDescription"
                    : "menuAdmin.sourceName",
                  {
                    locale: data.sourceLang.toUpperCase(),
                    defaultValue: editingDescriptions
                      ? "{{locale}} description:"
                      : "{{locale}} name:",
                  },
                )}{" "}
                {data.source[activeKey]}
              </p>
            )}
          </div>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={onClose}
            aria-label={t("common.close", "Close")}
          >
            <X className="h-4 w-4" />
          </Button>
        </div>

        {error && <p className="mb-3 text-xs text-red-600">{error}</p>}

        <Button
          type="button"
          variant="outline"
          size="sm"
          className="mb-4"
          aria-pressed={editingDescriptions}
          onClick={() =>
            setActiveField(editingDescriptions ? "NAME" : "DESCRIPTION")
          }
        >
          {editingDescriptions
            ? t("menuAdmin.editNames", "Edit names")
            : t("menuAdmin.editDescriptions", "Edit descriptions")}
        </Button>

        <div className="space-y-3">
          {data?.locales.map((entry) => {
            const override = entry[activeKey];
            const inputId = `xlate-${activeKey}-${entry.locale}`;
            const inputLabel = t(
              editingDescriptions
                ? "menuAdmin.translationDescriptionInput"
                : "menuAdmin.translationNameInput",
              {
                locale: entry.locale,
                defaultValue: editingDescriptions
                  ? "{{locale}} description"
                  : "{{locale}} name",
              },
            );
            const saving = savingKey === `${activeField}:${entry.locale}`;

            return (
              <div key={`${activeField}-${entry.locale}`}>
                <label
                  htmlFor={inputId}
                  className="mb-1 block text-xs font-bold uppercase tracking-wide text-muted-foreground"
                >
                  {entry.locale}
                </label>
                <div className="flex items-start gap-2">
                  {editingDescriptions ? (
                    <textarea
                      id={inputId}
                      aria-label={inputLabel}
                      rows={3}
                      value={drafts.DESCRIPTION[entry.locale] ?? ""}
                      onChange={(event) =>
                        setDrafts((previous) => ({
                          ...previous,
                          DESCRIPTION: {
                            ...previous.DESCRIPTION,
                            [entry.locale]: event.target.value,
                          },
                        }))
                      }
                      className="w-full resize-y rounded-xl border border-border bg-background px-3 py-2 text-sm text-foreground"
                    />
                  ) : (
                    <input
                      id={inputId}
                      aria-label={inputLabel}
                      value={drafts.NAME[entry.locale] ?? ""}
                      onChange={(event) =>
                        setDrafts((previous) => ({
                          ...previous,
                          NAME: {
                            ...previous.NAME,
                            [entry.locale]: event.target.value,
                          },
                        }))
                      }
                      className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm text-foreground"
                    />
                  )}
                  <Button
                    size="sm"
                    className="h-9"
                    disabled={saving}
                    onClick={() => save(entry.locale)}
                  >
                    {t("menuAdmin.save", "Save")}
                  </Button>
                </div>
                {override.status === "MANUAL" && (
                  <p className="mt-1 text-[11px] text-muted-foreground">
                    {t(
                      "menuAdmin.manualOverride",
                      "Your wording — never overwritten by automatic translation.",
                    )}
                  </p>
                )}
                {override.sourceChanged && (
                  <p className="mt-1 flex items-center gap-1 text-[11px] text-amber-600">
                    <AlertTriangle className="h-3 w-3" />
                    {t(
                      "menuAdmin.sourceChangedSinceOverride",
                      "Source text changed since you edited this.",
                    )}
                  </p>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>,
    document.body,
  );
};
