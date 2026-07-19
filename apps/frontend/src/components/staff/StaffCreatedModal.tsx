import { useEffect, useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import { useTranslation } from "react-i18next";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faCopy, faCheck, faTimes } from "@fortawesome/free-solid-svg-icons";

interface StaffCreatedModalProps {
  open: boolean;
  onClose: () => void;
  staffName: string;
  staffEmail: string;
  rawPin?: string;
  tempPassword?: string;
  enrollmentUrl: string;
  expiresAt: string;
  enrollmentError?: string;
}

export default function StaffCreatedModal({
  open,
  onClose,
  staffName,
  staffEmail,
  rawPin,
  tempPassword,
  enrollmentUrl,
  expiresAt,
  enrollmentError,
}: StaffCreatedModalProps) {
  const { t, i18n } = useTranslation();
  const [pinCopied, setPinCopied] = useState(false);
  const [linkCopied, setLinkCopied] = useState(false);
  const [pinVisible, setPinVisible] = useState(true);
  const [timeLeft, setTimeLeft] = useState("");

  useEffect(() => {
    if (!open || !rawPin) return;
    setPinVisible(true);
    const timer = setTimeout(() => setPinVisible(false), 30000);
    return () => clearTimeout(timer);
  }, [open, rawPin]);

  useEffect(() => {
    if (!open || !expiresAt) return;
    const expiryDate = new Date(expiresAt);
    if (isNaN(expiryDate.getTime())) return;
    const update = () => {
      const remaining = expiryDate.getTime() - Date.now();
      if (remaining <= 0) {
        setTimeLeft(t("staff.created.expired"));
        return;
      }
      const m = Math.floor(remaining / 60000);
      const s = Math.floor((remaining % 60000) / 1000);
      setTimeLeft(`${m}:${s.toString().padStart(2, "0")}`);
    };
    update();
    const interval = setInterval(update, 1000);
    return () => clearInterval(interval);
  }, [open, expiresAt, t]);

  const copyToClipboard = async (text: string): Promise<boolean> => {
    if (!text) return false;
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      // Fallback for non-HTTPS or missing clipboard API
      try {
        const ta = document.createElement("textarea");
        ta.value = text;
        ta.style.position = "fixed";
        ta.style.opacity = "0";
        document.body.appendChild(ta);
        ta.select();
        document.execCommand("copy");
        document.body.removeChild(ta);
        return true;
      } catch {
        return false;
      }
    }
  };

  const handleCopyPin = async () => {
    if (!rawPin) return;
    const ok = await copyToClipboard(rawPin);
    if (ok) {
      setPinCopied(true);
      setTimeout(() => setPinCopied(false), 2000);
    }
  };

  const handleCopyLink = async () => {
    if (!enrollmentUrl) return;
    const ok = await copyToClipboard(enrollmentUrl);
    if (ok) {
      setLinkCopied(true);
      setTimeout(() => setLinkCopied(false), 2000);
    }
  };

  if (!open) return null;

  const isPasswordOnly = !!tempPassword && !rawPin;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="bg-card rounded-2xl shadow-xl border border-border w-full max-w-sm p-6 relative">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-muted-foreground hover:text-foreground transition-colors"
          aria-label={t("staff.created.close")}
        >
          <FontAwesomeIcon icon={faTimes} />
        </button>

        <h3 className="text-lg font-semibold text-foreground mb-1">
          {rawPin || tempPassword
            ? t("staff.created.title")
            : t("staff.created.rebondTitle")}
        </h3>
        <p className="text-sm text-muted-foreground mb-6">
          {isPasswordOnly
            ? t("staff.created.passwordInstruction")
            : rawPin
              ? t("staff.created.scanInstruction")
              : t("staff.created.rebondInstruction", { name: staffName })}
        </p>

        {enrollmentError && (
          <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-4 mb-6 text-center">
            <p className="text-sm text-red-500">{enrollmentError}</p>
          </div>
        )}

        {enrollmentUrl ? (
          <>
            <div className="flex justify-center mb-6">
              <div className="rounded-xl bg-white p-3">
                <QRCodeSVG value={enrollmentUrl} size={200} />
              </div>
            </div>
            {expiresAt && !isNaN(new Date(expiresAt).getTime()) && (
              <p className="text-xs text-muted-foreground text-center mb-4">
                {t("staff.created.expiresIn")} {timeLeft} ·{" "}
                {new Date(expiresAt).toLocaleTimeString(i18n.language, {
                  hour: "2-digit",
                  minute: "2-digit",
                  hour12: false,
                })}
              </p>
            )}
          </>
        ) : (
          !enrollmentError &&
          !tempPassword && (
            <div className="bg-muted rounded-xl p-8 mb-6 flex items-center justify-center">
              <p className="text-sm text-muted-foreground">
                {t("staff.created.qrUnavailable")}
              </p>
            </div>
          )
        )}

        {tempPassword && (
          <div className="bg-blue-500/10 border border-blue-500/20 rounded-xl p-4 mb-4 text-center">
            <p className="text-sm text-muted-foreground mb-1">
              {t("staff.created.passwordFor", {
                name: staffName,
                defaultValue: `Dashboard Password for ${staffName}`,
              })}
            </p>
            <p className="text-xs text-muted-foreground mb-2">
              {t("auto.email", "Email:")}
              <span className="font-semibold text-foreground">
                {staffEmail}
              </span>
            </p>
            <p className="text-2xl font-mono font-bold text-foreground tracking-widest select-all">
              {tempPassword}
            </p>
            <p className="text-[10px] uppercase font-bold text-blue-500 mt-2">
              {t("staff.created.copyPasswordWarning", {
                defaultValue: "Copy this now. It won't be shown again.",
              })}
            </p>
          </div>
        )}

        {rawPin && (
          <div className="bg-green-500/10 border border-green-500/20 rounded-xl p-4 mb-4 text-center">
            <p className="text-sm text-muted-foreground mb-1">
              {t("staff.created.pinFor", { name: staffName })}
            </p>
            <p
              className={`text-3xl font-mono font-bold text-foreground tracking-widest ${pinVisible ? "select-all" : ""}`}
            >
              {pinVisible ? rawPin : "****"}
            </p>
            <p className="text-xs text-muted-foreground mt-2">
              {t("staff.created.copyPinWarning")}
            </p>
            <button
              onClick={pinVisible ? handleCopyPin : () => setPinVisible(true)}
              className="mt-2 inline-flex items-center gap-1 text-sm text-primary hover:underline"
            >
              <FontAwesomeIcon icon={pinCopied ? faCheck : faCopy} />
              {pinVisible
                ? pinCopied
                  ? t("staff.created.copied")
                  : t("staff.created.copyPin")
                : t("staff.created.revealPin", "Reveal PIN")}
            </button>
          </div>
        )}

        {enrollmentUrl && (
          <button
            onClick={handleCopyLink}
            className="w-full inline-flex items-center justify-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            <FontAwesomeIcon icon={linkCopied ? faCheck : faCopy} />
            {linkCopied
              ? t("staff.created.linkCopied")
              : t("staff.created.copyLink")}
          </button>
        )}
      </div>
    </div>
  );
}
