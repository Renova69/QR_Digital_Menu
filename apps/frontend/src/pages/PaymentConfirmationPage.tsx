import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  AlertCircle,
  Banknote,
  CheckCircle2,
  CreditCard,
  ExternalLink,
  LoaderCircle,
  Star,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "../components/ui/button";
import { Textarea } from "../components/ui/textarea";
import {
  createFeedbackInvitation,
  markFeedbackInvitationPresented,
  markGoogleReviewClick,
  submitVisitFeedback,
  type FeedbackInvitationResponse,
} from "../lib/api";
import {
  clearPaymentConfirmationContext,
  readPaymentConfirmationContext,
} from "../lib/paymentConfirmationContext";

function formatPaymentAmount(amount: number, currency = "EUR") {
  return new Intl.NumberFormat(undefined, {
    style: "currency",
    currency: currency.toUpperCase(),
  }).format(amount);
}

export default function PaymentConfirmationPage() {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const [context] = useState(readPaymentConfirmationContext);
  const [invitation, setInvitation] =
    useState<FeedbackInvitationResponse | null>(null);
  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [verificationStatus, setVerificationStatus] = useState<
    "checking" | "pending" | "verified" | "unavailable"
  >("checking");

  const loadInvitation = useCallback(async () => {
    if (!context) return;
    try {
      const result = await createFeedbackInvitation(context.sessionToken, {
        paymentId: context.paymentId,
      });
      setInvitation((current) =>
        result.reason === "ALREADY_PROMPTED" && current?.eligible
          ? current
          : result,
      );
      setSubmitted((current) => current || result.submitted);
      setVerificationStatus(
        result.reason === "PAYMENT_PENDING" ? "pending" : "verified",
      );
    } catch {
      setVerificationStatus((current) =>
        current === "checking" ? "unavailable" : current,
      );
    }
  }, [context]);

  useEffect(() => {
    void loadInvitation();
  }, [loadInvitation]);

  useEffect(() => {
    if (
      invitation?.reason !== "ORDERS_NOT_SERVED" &&
      invitation?.reason !== "PAYMENT_PENDING"
    )
      return;
    const timer = window.setInterval(() => {
      void loadInvitation();
    }, 30_000);
    return () => window.clearInterval(timer);
  }, [invitation?.reason, loadInvitation]);

  useEffect(() => {
    const invitationToken = invitation?.invitationToken;
    if (
      verificationStatus !== "verified" ||
      !invitation?.eligible ||
      !invitationToken ||
      submitted ||
      dismissed
    ) {
      return;
    }
    void markFeedbackInvitationPresented(invitationToken).catch(() => {});
  }, [dismissed, invitation, submitted, verificationStatus]);

  if (!context) {
    return (
      <main className="premium-bg flex min-h-screen items-center justify-center px-4">
        <div className="glass-panel w-full max-w-md rounded-3xl p-6 text-center">
          <p className="text-sm text-muted-foreground">
            {t(
              "payment.unexpectedStatus",
              "Payment confirmation is no longer available.",
            )}
          </p>
          <Button className="mt-5 w-full" onClick={() => navigate("/")}>
            {t("payment.backToMenu", "Back to Menu")}
          </Button>
        </div>
      </main>
    );
  }

  const amount =
    invitation?.payment.amount ??
    (typeof context.amount === "number" ? context.amount : undefined);
  const currency = invitation?.payment.currency ?? "EUR";
  const provider = invitation?.payment.provider ?? context.provider;
  const isCash = provider === "CASH";
  const invitationToken = invitation?.invitationToken;
  const showFeedback =
    verificationStatus === "verified" &&
    invitation?.eligible &&
    !!invitationToken &&
    !submitted &&
    !dismissed;
  const paymentVerified = verificationStatus === "verified";

  const returnToMenu = () => {
    clearPaymentConfirmationContext();
    navigate(context.menuReturnUrl, { replace: true });
  };

  const handleSubmit = async () => {
    if (!invitationToken || rating < 1) return;
    setSubmitting(true);
    setError(null);
    try {
      await submitVisitFeedback({
        invitationToken,
        rating,
        ...(comment.trim() ? { comment: comment.trim() } : {}),
      });
      setSubmitted(true);
    } catch {
      setError(
        t(
          "feedback.failedSubmit",
          "Failed to submit feedback. Please try again.",
        ),
      );
    } finally {
      setSubmitting(false);
    }
  };

  const handleGoogleReview = () => {
    if (!invitation?.restaurant.googleReviewUrl || !invitationToken) return;
    window.open(
      invitation.restaurant.googleReviewUrl,
      "_blank",
      "noopener,noreferrer",
    );
    void markGoogleReviewClick(invitationToken).catch(() => {});
  };

  const retryVerification = () => {
    setVerificationStatus("checking");
    void loadInvitation();
  };

  return (
    <main
      className="premium-bg flex min-h-screen justify-center px-4 pt-8 sm:items-center sm:py-8"
      style={{
        paddingBottom:
          "max(2rem, calc(env(safe-area-inset-bottom, 0px) + 1.5rem))",
      }}
    >
      <div className="w-full max-w-md space-y-4">
        <section
          className={`glass-panel rounded-3xl border p-6 text-center ${
            paymentVerified
              ? "border-emerald-400/25 bg-emerald-400/5"
              : "border-amber-400/25 bg-amber-400/5"
          }`}
        >
          <div
            className={`mx-auto flex h-16 w-16 items-center justify-center rounded-full ${
              paymentVerified ? "bg-emerald-500/15" : "bg-amber-500/15"
            }`}
          >
            {paymentVerified ? (
              <CheckCircle2 className="h-9 w-9 text-emerald-500" />
            ) : verificationStatus === "unavailable" ? (
              <AlertCircle className="h-9 w-9 text-amber-500" />
            ) : (
              <LoaderCircle className="h-9 w-9 animate-spin text-amber-500" />
            )}
          </div>
          <h1 className="mt-4 text-xl font-black tracking-tight text-foreground">
            {paymentVerified
              ? t("payment.paymentReceived", "Payment received successfully")
              : verificationStatus === "unavailable"
                ? t(
                    "payment.verificationUnavailable",
                    "We couldn't verify this payment yet",
                  )
                : t("payment.confirmingPayment", "Confirming payment")}
          </h1>
          {!paymentVerified && (
            <p className="mt-2 text-sm text-muted-foreground">
              {verificationStatus === "unavailable"
                ? t(
                    "payment.verificationUnavailableDesc",
                    "Check your connection and try again. If you were charged, do not pay again.",
                  )
                : t(
                    "payment.confirmingPaymentDesc",
                    "We're waiting for secure confirmation. Please don't pay again.",
                  )}
            </p>
          )}
          {amount !== undefined && (
            <p className="mt-3 text-3xl font-black text-foreground">
              {formatPaymentAmount(amount, currency)}
            </p>
          )}
          <div className="mt-3 flex items-center justify-center gap-2 text-sm text-muted-foreground">
            {isCash ? (
              <Banknote className="h-4 w-4" />
            ) : (
              <CreditCard className="h-4 w-4" />
            )}
            <span>
              {isCash
                ? t("assistance.cash", "Cash")
                : provider || t("payment.payment", "Payment")}
              {context.tableNumber
                ? ` · ${t("checkout.table", "Table")} ${context.tableNumber}`
                : ""}
            </span>
          </div>
          {typeof context.remaining === "number" && context.remaining > 0 && (
            <p className="mt-3 text-xs text-muted-foreground">
              {t(
                "payment.remainingTableBalance",
                "Remaining table balance: {{amount}}",
                {
                  amount: formatPaymentAmount(context.remaining, currency),
                },
              )}
            </p>
          )}
          {verificationStatus === "unavailable" && (
            <Button
              variant="outline"
              className="mt-4 w-full"
              onClick={retryVerification}
            >
              {t("common.tryAgain", "Try Again")}
            </Button>
          )}
        </section>

        {showFeedback && (
          <section className="glass-panel rounded-3xl p-5">
            <h2 className="text-center text-base font-bold text-foreground">
              {t("feedback.howWasExperience", "How was your experience?")}
            </h2>
            <p className="mt-1 text-center text-xs text-muted-foreground">
              {invitation.restaurant.name
                ? t("feedback.atRestaurant", "at {{name}}", {
                    name: invitation.restaurant.name,
                  })
                : t(
                    "feedback.helpsUsImprove",
                    "Your feedback helps us improve",
                  )}
            </p>
            <div className="mt-4 flex justify-center gap-2">
              {[1, 2, 3, 4, 5].map((star) => (
                <button
                  key={star}
                  type="button"
                  aria-label={`${star} star`}
                  onClick={() => setRating(star)}
                  className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-lg p-1 transition active:scale-90"
                >
                  <Star
                    className={`h-8 w-8 ${
                      star <= rating
                        ? "fill-amber-400 text-amber-400"
                        : "text-muted-foreground/30"
                    }`}
                  />
                </button>
              ))}
            </div>

            {rating > 0 && (
              <div className="mt-4 space-y-3">
                <Textarea
                  value={comment}
                  maxLength={2000}
                  onChange={(event) => setComment(event.target.value)}
                  placeholder={t(
                    "feedback.shareExperienceOptional",
                    "Tell us more about your experience (optional)",
                  )}
                  className="min-h-24 resize-none"
                />
                {error && (
                  <p className="text-sm text-destructive" role="alert">
                    {error}
                  </p>
                )}
                <Button
                  className="w-full"
                  disabled={submitting}
                  onClick={handleSubmit}
                >
                  {submitting
                    ? t("feedback.submitting", "Submitting...")
                    : t("feedback.submit", "Submit")}
                </Button>
              </div>
            )}

            <button
              type="button"
              onClick={() => setDismissed(true)}
              className="mt-3 w-full py-2 text-sm font-medium text-muted-foreground"
            >
              {t("feedback.maybeLater", "Maybe later")}
            </button>
          </section>
        )}

        {submitted && invitation && (
          <section className="glass-panel rounded-3xl p-5 text-center">
            <h2 className="font-bold text-foreground">
              {t("feedback.thankYou", "Thank you!")}
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              {t(
                "feedback.feedbackRecorded",
                "Your feedback has been recorded.",
              )}
            </p>
            {invitation.restaurant.googleReviewUrl && invitationToken && (
              <Button
                className="mt-4 w-full gap-2 bg-blue-600 hover:bg-blue-700"
                onClick={handleGoogleReview}
              >
                {t("feedback.leaveGoogleReview", "Leave a Google Review")}
                <ExternalLink className="h-4 w-4" />
              </Button>
            )}
          </section>
        )}

        <Button className="h-12 w-full" onClick={returnToMenu}>
          {t("payment.backToMenu", "Back to Menu")}
        </Button>
      </div>
    </main>
  );
}
