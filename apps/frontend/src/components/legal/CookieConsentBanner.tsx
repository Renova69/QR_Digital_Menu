import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { getPublicLegalSettings } from "../../lib/api";
import { useConsent } from "../../context/ConsentContext";
import ConsentPreferencesModal from "./ConsentPreferencesModal";

export default function CookieConsentBanner() {
  const { i18n, t } = useTranslation();
  const { categories, isBannerVisible, accept, reject, openPreferences } =
    useConsent();

  const { data } = useQuery({
    queryKey: ["public-legal-settings"],
    queryFn: getPublicLegalSettings,
    staleTime: 5 * 60 * 1000,
  });

  // Nothing optional to consent to on this page (no analytics/marketing
  // category applies here) — render nothing at all, not even a notice.
  if (categories.length === 0) return null;

  const locale = i18n.language?.slice(0, 2) || "en";
  const text =
    (data?.cookieBannerText as Record<string, string> | null)?.[locale] ||
    (data?.cookieBannerText as Record<string, string> | null)?.["en"] ||
    "This site uses strictly-necessary cookies to keep you signed in.";

  return (
    <>
      {isBannerVisible && (
        <div
          role="dialog"
          aria-label="Cookie notice"
          className="fixed bottom-4 left-4 right-4 md:left-auto md:right-6 md:max-w-md z-50 rounded-xl bg-gray-900 border border-white/10 shadow-2xl p-5 text-sm text-gray-300"
        >
          <p className="mb-4 leading-relaxed">{text}</p>
          <div className="flex items-center gap-2.5">
            <button
              onClick={accept}
              className="flex-1 px-4 py-2 rounded-lg brand-cta text-white text-xs font-semibold hover:opacity-90 transition-colors"
            >
              {t("gdpr.cookieBannerAccept")}
            </button>
            <button
              onClick={reject}
              className="flex-1 px-4 py-2 rounded-lg bg-white/10 text-gray-200 text-xs font-semibold hover:bg-white/20 transition-colors"
            >
              {t("gdpr.rejectAll")}
            </button>
          </div>
          <div className="mt-3 flex items-center gap-2.5 text-[11px] text-gray-500">
            <button
              onClick={openPreferences}
              className="hover:text-gray-300 underline underline-offset-2"
            >
              {t("gdpr.customize")}
            </button>
            {data?.cookiePolicyEnabled && (
              <>
                <span aria-hidden="true">·</span>
                <Link
                  to="/cookies"
                  className="hover:text-gray-300 underline underline-offset-2"
                >
                  {t("gdpr.cookieBannerSettings")}
                </Link>
              </>
            )}
          </div>
        </div>
      )}
      <ConsentPreferencesModal />
    </>
  );
}
