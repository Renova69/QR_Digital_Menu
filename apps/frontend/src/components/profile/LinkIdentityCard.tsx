import React, { useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { addIdentity, verifyIdentity } from "../../lib/api";
import { useAuth } from "../../context/AuthContext";

/**
 * A customer who signs up by phone and later signs in by email would otherwise
 * end up with two accounts and two point balances. Adding the second identifier
 * from inside an authenticated session is what keeps them on one row — so this
 * is framed as a benefit ("keep your points"), not as a data request.
 */

const PLACEHOLDER_EMAIL_DOMAIN = "@phone.local";

const isPlaceholderEmail = (email?: string | null): boolean =>
  typeof email === "string" &&
  email.toLowerCase().endsWith(PLACEHOLDER_EMAIL_DOMAIN);

type Field = "email" | "phone";
type Stage = "idle" | "code" | "done";

export const LinkIdentityCard: React.FC = () => {
  const { t } = useTranslation();
  const { user, refreshUser } = useAuth();

  const [stage, setStage] = useState<Stage>("idle");
  const [value, setValue] = useState("");
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isBusy, setIsBusy] = useState(false);

  // Offer whichever identifier the account is missing. A phone-first account
  // carries a fabricated placeholder address, so a real email is what's absent.
  const missingField: Field | null = isPlaceholderEmail(user?.email)
    ? "email"
    : !user?.phone
      ? "phone"
      : null;

  if (!user || !missingField) return null;

  const payload = () =>
    missingField === "email" ? { email: value } : { phone: value };

  const messageFor = (err: any): string =>
    err?.response?.data?.message === "IDENTITY_IN_USE"
      ? t("profile.linkIdentity.errorInUse")
      : (err?.response?.data?.message ??
        t("profile.linkIdentity.errorGeneric"));

  const handleSend = async () => {
    setIsBusy(true);
    setError(null);
    try {
      await addIdentity(payload());
      setStage("code");
    } catch (err: any) {
      setError(messageFor(err));
    } finally {
      setIsBusy(false);
    }
  };

  const handleVerify = async () => {
    setIsBusy(true);
    setError(null);
    try {
      await verifyIdentity({ ...payload(), code });
      await refreshUser();
      setStage("done");
    } catch (err: any) {
      setError(messageFor(err));
    } finally {
      setIsBusy(false);
    }
  };

  const reset = () => {
    setStage("idle");
    setCode("");
    setError(null);
  };

  if (stage === "done") {
    return (
      <div className="glass-panel p-8 rounded-[2rem] border-white/5 mb-8">
        <p className="text-sm font-semibold text-emerald-400">
          {t(`profile.linkIdentity.success.${missingField}`)}
        </p>
      </div>
    );
  }

  return (
    <div className="glass-panel p-8 rounded-[2rem] border-white/5 mb-8">
      <h2 className="text-xl font-bold mb-2">
        {t(`profile.linkIdentity.title.${missingField}`)}
      </h2>
      <p className="text-muted-foreground text-sm mb-5">
        {t(`profile.linkIdentity.description.${missingField}`)}
      </p>

      {stage === "idle" ? (
        <div className="flex flex-col sm:flex-row gap-3">
          <Input
            type={missingField === "email" ? "email" : "tel"}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder={t(`profile.linkIdentity.placeholder.${missingField}`)}
            aria-label={t(`profile.linkIdentity.title.${missingField}`)}
            className="flex-1"
          />
          <Button onClick={handleSend} disabled={isBusy || !value.trim()}>
            {t("profile.linkIdentity.sendCode")}
          </Button>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          <p className="text-sm text-muted-foreground">
            {t(`profile.linkIdentity.codeSent.${missingField}`, { value })}
          </p>
          <div className="flex flex-col sm:flex-row gap-3">
            <Input
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
              placeholder={t("profile.linkIdentity.codePlaceholder")}
              aria-label={t("profile.linkIdentity.codeLabel")}
              className="flex-1"
            />
            <Button onClick={handleVerify} disabled={isBusy || code.length < 6}>
              {t("profile.linkIdentity.confirm")}
            </Button>
            <Button variant="ghost" onClick={reset} disabled={isBusy}>
              {t("profile.linkIdentity.cancel")}
            </Button>
          </div>
        </div>
      )}

      {error && (
        <p className="text-sm text-red-400 mt-4" role="alert">
          {error}
        </p>
      )}
    </div>
  );
};

export default LinkIdentityCard;
