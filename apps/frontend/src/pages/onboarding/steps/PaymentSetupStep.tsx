import { useState } from "react";
import { CreditCard, ExternalLink, CheckCircle } from "lucide-react";
import { useTranslation } from "react-i18next";
import { generateStripeConnectLink } from "../../../lib/api";

interface Props {
  restaurantId: string;
  returnUrl: string;
  refreshUrl: string;
  onNext: () => void;
  onSkip: () => void;
}

export default function PaymentSetupStep({
  restaurantId,
  returnUrl,
  refreshUrl,
  onNext,
  onSkip,
}: Props) {
  const { t } = useTranslation();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleConnect = async () => {
    setLoading(true);
    setError("");
    try {
      const data = await generateStripeConnectLink(
        restaurantId,
        returnUrl,
        refreshUrl,
      );
      window.location.href = data.url;
    } catch (err: any) {
      setError(err.response?.data?.message || t("onboarding.payment.error"));
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6 max-w-md">
      <div>
        <h2 className="text-2xl font-display font-bold text-foreground">
          {t("onboarding.payment.title")}
        </h2>
        <p className="text-sm text-muted-foreground mt-1">
          {t("onboarding.payment.subtitle")}
        </p>
      </div>

      <div className="glass-panel rounded-2xl p-6 space-y-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
            <CreditCard className="w-5 h-5 text-primary" />
          </div>
          <div>
            <p className="text-sm font-bold text-foreground">
              {t("onboarding.payment.stripeConnect")}
            </p>
            <p className="text-xs text-muted-foreground">
              {t("onboarding.payment.stripeDesc")}
            </p>
          </div>
        </div>

        <ul className="space-y-1.5 text-xs text-muted-foreground">
          <li className="flex items-center gap-2">
            <CheckCircle className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
            {t("onboarding.payment.featureCards")}
          </li>
          <li className="flex items-center gap-2">
            <CheckCircle className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
            {t("onboarding.payment.featureSplit")}
          </li>
          <li className="flex items-center gap-2">
            <CheckCircle className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
            {t("onboarding.payment.featurePayouts")}
          </li>
        </ul>

        {error && <p className="text-sm text-red-500">{error}</p>}

        <button
          onClick={handleConnect}
          disabled={loading}
          className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-bold hover:bg-primary/90 transition-all disabled:opacity-50"
        >
          {loading ? (
            t("onboarding.payment.redirecting")
          ) : (
            <>
              {t("onboarding.payment.connectButton")}
              <ExternalLink className="w-3.5 h-3.5" />
            </>
          )}
        </button>
      </div>

      <div className="flex justify-end">
        <button
          onClick={onSkip}
          className="text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          {t("onboarding.payment.skip")}
        </button>
      </div>
    </div>
  );
}
