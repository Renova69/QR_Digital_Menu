import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import ReactMarkdown from "react-markdown";
import { getPublicLegalSettings } from "../../lib/api";

export default function MsaPage() {
  const { t, i18n } = useTranslation();
  const { data, isLoading } = useQuery({
    queryKey: ["public-legal-settings"],
    queryFn: getPublicLegalSettings,
    staleTime: 5 * 60 * 1000,
  });

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-gray-400">{t("auto.loading", "Loading…")}</p>
      </div>
    );
  }

  if (!data?.msaEnabled) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-gray-400">
          {t("auto.404PageNotFound", "404 — Page not found")}
        </p>
      </div>
    );
  }

  const locale = i18n.language?.slice(0, 2) || "en";
  const content =
    (data.msaContent as Record<string, string> | null)?.[locale] ||
    (data.msaContent as Record<string, string> | null)?.["en"] ||
    "";

  return (
    <div className="max-w-2xl mx-auto px-4 pt-32 pb-12">
      <div className="prose prose-sm md:prose-base dark:prose-invert max-w-none">
        <ReactMarkdown>{content}</ReactMarkdown>
      </div>
      {data.dataControllerName && (
        <div className="mt-10 pt-6 border-t text-xs text-gray-500 space-y-1">
          <p>
            <strong>{t("auto.dataController", "Data Controller:")}</strong>{" "}
            {data.dataControllerName}
          </p>
          {data.dataControllerEmail && <p>{data.dataControllerEmail}</p>}
        </div>
      )}
    </div>
  );
}
