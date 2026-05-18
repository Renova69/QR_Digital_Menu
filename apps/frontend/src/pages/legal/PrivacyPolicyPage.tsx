import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { getPublicLegalSettings } from "../../lib/api";

export default function PrivacyPolicyPage() {
  const { i18n } = useTranslation();
  const { data, isLoading } = useQuery({
    queryKey: ["public-legal-settings"],
    queryFn: getPublicLegalSettings,
    staleTime: 5 * 60 * 1000,
  });

  if (isLoading) {
    return <div className="min-h-screen flex items-center justify-center"><p className="text-gray-400">Loading…</p></div>;
  }

  if (!data?.privacyPolicyEnabled) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-gray-400">404 — Page not found</p>
      </div>
    );
  }

  const locale = i18n.language?.slice(0, 2) || "en";
  const content =
    (data.privacyPolicyContent as Record<string, string> | null)?.[locale] ||
    (data.privacyPolicyContent as Record<string, string> | null)?.["en"] ||
    "";

  return (
    <div className="max-w-2xl mx-auto px-4 py-12">
      <h1 className="text-2xl font-bold mb-6">Privacy Policy</h1>
      <pre className="whitespace-pre-wrap text-sm text-gray-700 dark:text-gray-300 leading-relaxed font-sans">
        {content}
      </pre>
      {data.dataControllerName && (
        <div className="mt-10 pt-6 border-t text-xs text-gray-500 space-y-1">
          <p><strong>Data Controller:</strong> {data.dataControllerName}</p>
          {data.dataControllerEmail && <p>{data.dataControllerEmail}</p>}
          {data.dataControllerAddress && <p>{data.dataControllerAddress}</p>}
        </div>
      )}
    </div>
  );
}
