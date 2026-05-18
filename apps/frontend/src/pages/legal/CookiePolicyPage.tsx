import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { getPublicLegalSettings } from "../../lib/api";

const SITE_COOKIES = [
  {
    name: "token",
    purpose: "Authentication — keeps you signed in (httpOnly, not readable by JavaScript)",
    duration: "Session / 7 days",
  },
  {
    name: "csrf-token",
    purpose: "CSRF protection — prevents cross-site request forgery",
    duration: "Session",
  },
  {
    name: "oauth_nonce",
    purpose: "Google OAuth state verification",
    duration: "Short-lived (minutes)",
  },
];

export default function CookiePolicyPage() {
  const { i18n, t } = useTranslation();
  const { data, isLoading } = useQuery({
    queryKey: ["public-legal-settings"],
    queryFn: getPublicLegalSettings,
    staleTime: 5 * 60 * 1000,
  });

  if (isLoading) {
    return <div className="min-h-screen flex items-center justify-center"><p className="text-gray-400">Loading…</p></div>;
  }

  if (!data?.cookiePolicyEnabled) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-gray-400">404 — Page not found</p>
      </div>
    );
  }

  const locale = i18n.language?.slice(0, 2) || "en";
  const content =
    (data.cookiePolicyContent as Record<string, string> | null)?.[locale] ||
    (data.cookiePolicyContent as Record<string, string> | null)?.["en"] ||
    "";

  return (
    <div className="max-w-2xl mx-auto px-4 py-12">
      <h1 className="text-2xl font-bold mb-6">Cookie Policy</h1>
      {content && (
        <pre className="whitespace-pre-wrap text-sm text-gray-700 dark:text-gray-300 leading-relaxed font-sans mb-10">
          {content}
        </pre>
      )}

      <h2 className="text-lg font-semibold mb-4">{t("gdpr.cookiesUsed")}</h2>
      <div className="overflow-x-auto">
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr className="border-b text-left text-gray-500">
              <th className="py-2 pr-4 font-medium">{t("gdpr.cookieName")}</th>
              <th className="py-2 pr-4 font-medium">{t("gdpr.cookiePurpose")}</th>
              <th className="py-2 font-medium">{t("gdpr.cookieDuration")}</th>
            </tr>
          </thead>
          <tbody>
            {SITE_COOKIES.map((c) => (
              <tr key={c.name} className="border-b border-gray-100 dark:border-white/5">
                <td className="py-3 pr-4 font-mono text-xs">{c.name}</td>
                <td className="py-3 pr-4 text-gray-600 dark:text-gray-400">{c.purpose}</td>
                <td className="py-3 text-gray-600 dark:text-gray-400">{c.duration}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-6 text-xs text-gray-500">
        All cookies listed are strictly necessary. No tracking or advertising cookies are used.
      </p>
    </div>
  );
}
