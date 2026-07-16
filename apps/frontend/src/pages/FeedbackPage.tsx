import { useState, useEffect } from "react";
import { useParams, useSearchParams, useNavigate } from "react-router-dom";
import { submitFeedback, getGoogleReviewUrl } from "../lib/api";
import {
  Star,
  ExternalLink,
  MessageSquare,
  CheckCircle,
  Heart,
} from "lucide-react";
import { Button } from "../components/ui/button";
import { Textarea } from "../components/ui/textarea";
import { useTranslation } from "react-i18next";
import { buildMenuReturnUrl } from "../lib/menuUrl";

type FeedbackStep = "rating" | "comment" | "redirect" | "thankyou";

const FeedbackPage = () => {
  const { restaurantId } = useParams<{ restaurantId: string }>();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { t } = useTranslation();
  const orderId = searchParams.get("orderId");
  const returnUrl =
    searchParams.get("returnUrl") || buildMenuReturnUrl(restaurantId);

  const [step, setStep] = useState<FeedbackStep>("rating");
  const [rating, setRating] = useState(0);
  const [hoveredStar, setHoveredStar] = useState(0);
  const [comment, setComment] = useState("");
  const [googleReviewUrl, setGoogleReviewUrl] = useState<string | null>(null);
  const [restaurantName, setRestaurantName] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (restaurantId) {
      getGoogleReviewUrl(restaurantId)
        .then((data) => {
          setGoogleReviewUrl(data.googleReviewUrl);
          setRestaurantName(data.name);
        })
        .catch(() => {});
    }
  }, [restaurantId]);

  const handleRatingSelect = (selectedRating: number) => {
    setRating(selectedRating);
    setTimeout(() => setStep("comment"), 300);
  };

  const handleSubmit = async () => {
    if (!orderId || !restaurantId) {
      setError(t("feedback.missingInfo"));
      return;
    }

    try {
      setSubmitting(true);
      setError(null);

      const shouldRedirect = rating >= 4 && googleReviewUrl;

      await submitFeedback({
        rating,
        comment: comment.trim() || undefined,
        orderId,
        restaurantId,
        redirectedToGoogle: !!shouldRedirect,
      });

      if (shouldRedirect) {
        setStep("redirect");
      } else {
        setStep("thankyou");
      }
    } catch (err: any) {
      if (err.response?.status === 409) {
        setError(t("feedback.alreadySubmitted"));
        setStep("thankyou");
      } else {
        setError(t("feedback.failedSubmit"));
      }
    } finally {
      setSubmitting(false);
    }
  };

  const handleGoogleRedirect = () => {
    if (googleReviewUrl) {
      window.open(googleReviewUrl, "_blank", "noopener,noreferrer");
    }
    setStep("thankyou");
  };

  const handleContinueBrowsing = () => {
    navigate(returnUrl, { replace: true });
  };

  const ratingLabels = [
    "",
    t("feedback.ratings.poor"),
    t("feedback.ratings.fair"),
    t("feedback.ratings.good"),
    t("feedback.ratings.great"),
    t("feedback.ratings.excellent"),
  ];
  const ratingEmojis = ["", "😞", "😐", "🙂", "😊", "🤩"];

  return (
    <div className="min-h-[80vh] flex items-center justify-center px-4">
      <div className="w-full max-w-md">
        {/* Step 1: Star Rating */}
        {step === "rating" && (
          <div className="bg-card rounded-2xl shadow-lg border border-border p-8 text-center animate-in">
            <div className="w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-5">
              <Heart className="h-8 w-8 text-primary" />
            </div>
            <h1 className="text-2xl font-bold text-foreground mb-2">
              {t("feedback.howWasExperience")}
            </h1>
            <p className="text-muted-foreground text-sm mb-8">
              {restaurantName
                ? t("feedback.atRestaurant", { name: restaurantName })
                : t("feedback.helpsUsImprove")}
            </p>

            <div className="flex justify-center gap-2 mb-4">
              {[1, 2, 3, 4, 5].map((star) => (
                <button
                  key={star}
                  onClick={() => handleRatingSelect(star)}
                  onMouseEnter={() => setHoveredStar(star)}
                  onMouseLeave={() => setHoveredStar(0)}
                  className="transition-transform hover:scale-125 focus:outline-none"
                >
                  <Star
                    className={`h-10 w-10 transition-colors ${
                      star <= (hoveredStar || rating)
                        ? "fill-amber-400 text-amber-400"
                        : "text-muted-foreground/30"
                    }`}
                  />
                </button>
              ))}
            </div>

            <p className="text-sm text-muted-foreground h-5">
              {hoveredStar > 0
                ? `${ratingEmojis[hoveredStar]} ${ratingLabels[hoveredStar]}`
                : rating > 0
                  ? `${ratingEmojis[rating]} ${ratingLabels[rating]}`
                  : t("feedback.tapToRate")}
            </p>
          </div>
        )}

        {/* Step 2: Optional Comment */}
        {step === "comment" && (
          <div className="bg-card rounded-2xl shadow-lg border border-border p-8 text-center animate-in">
            <div className="flex justify-center gap-1 mb-4">
              {[1, 2, 3, 4, 5].map((star) => (
                <Star
                  key={star}
                  className={`h-6 w-6 ${
                    star <= rating
                      ? "fill-amber-400 text-amber-400"
                      : "text-muted-foreground/30"
                  }`}
                />
              ))}
            </div>
            <p className="text-2xl mb-1">{ratingEmojis[rating]}</p>
            <h2 className="text-xl font-bold text-foreground mb-1">
              {ratingLabels[rating]}!
            </h2>
            <p className="text-muted-foreground text-sm mb-6">
              {rating >= 4
                ? t("feedback.gladYouEnjoyed")
                : t("feedback.tellUsDoBetter")}
            </p>

            <div className="mb-6">
              <div className="relative">
                <MessageSquare className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                <Textarea
                  value={comment}
                  onChange={(e) => setComment(e.target.value)}
                  placeholder={
                    rating >= 4
                      ? t("feedback.whatDidYouEnjoy")
                      : t("feedback.whatCouldImprove")
                  }
                  className="pl-10 min-h-[100px] resize-none"
                />
              </div>
            </div>

            {error && (
              <div className="bg-destructive/10 text-destructive text-sm p-3 rounded-lg mb-4">
                {error}
              </div>
            )}

            <div className="flex gap-3">
              <Button
                variant="outline"
                onClick={() => setStep("rating")}
                className="flex-1"
              >
                {t("feedback.back")}
              </Button>
              <Button
                onClick={handleSubmit}
                disabled={submitting}
                className="flex-1"
              >
                {submitting ? t("feedback.submitting") : t("feedback.submit")}
              </Button>
            </div>
          </div>
        )}

        {/* Step 3: Google Review Redirect */}
        {step === "redirect" && (
          <div className="bg-card rounded-2xl shadow-lg border border-border p-8 text-center animate-in">
            <div className="w-16 h-16 bg-green-50 rounded-full flex items-center justify-center mx-auto mb-5">
              <CheckCircle className="h-8 w-8 text-green-500" />
            </div>
            <h2 className="text-2xl font-bold text-foreground mb-2">
              {t("feedback.thankYouRedirect")} ❤️
            </h2>
            <p className="text-muted-foreground mb-8">
              {t("feedback.shareOnGoogle")}
            </p>

            <Button
              onClick={handleGoogleRedirect}
              className="w-full mb-3 bg-blue-600 hover:bg-blue-700 flex items-center justify-center gap-2"
            >
              <svg viewBox="0 0 24 24" className="h-5 w-5" fill="currentColor">
                <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" />
                <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
                <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
              </svg>
              {t("feedback.leaveGoogleReview")}
              <ExternalLink className="h-4 w-4" />
            </Button>

            <button
              onClick={handleContinueBrowsing}
              className="text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              {t("feedback.maybeLater")}
            </button>
          </div>
        )}

        {/* Step 4: Thank You */}
        {step === "thankyou" && (
          <div className="bg-card rounded-2xl shadow-lg border border-border p-8 text-center animate-in">
            <div className="w-20 h-20 bg-green-50 rounded-full flex items-center justify-center mx-auto mb-5">
              <CheckCircle className="h-10 w-10 text-green-500" />
            </div>
            <h2 className="text-2xl font-bold text-foreground mb-2">
              {t("feedback.thankYou")} 🎉
            </h2>
            <p className="text-muted-foreground mb-2">
              {t("feedback.feedbackRecorded")}
            </p>
            <p className="text-muted-foreground/70 text-sm mb-6">
              {t("feedback.appreciateTime")}
            </p>
            <Button onClick={handleContinueBrowsing} className="w-full">
              {t("feedback.continueBrowsing")}
            </Button>
          </div>
        )}
      </div>
    </div>
  );
};

export default FeedbackPage;
