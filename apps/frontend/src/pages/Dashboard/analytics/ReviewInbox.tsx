import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  ChevronRight,
  CreditCard,
  ExternalLink,
  MessageSquareText,
  ReceiptText,
  Star,
  Table2,
  UserRound,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { DashboardButton } from "../../../components/dashboard/DashboardButton";
import { Modal } from "../../../components/ui/modal";
import { getFeedbackReviews, type FeedbackReview } from "../../../lib/api";
import { formatPaymentAmount, formatPaymentProvider } from "./reviewFormatting";
import { VisitDetailDrawer } from "./VisitDetailDrawer";

type ReviewInboxProps = {
  restaurantId: string;
};

const ReviewStars = ({ rating }: { rating: number }) => {
  const { t } = useTranslation();
  return (
    <div
      className="flex items-center gap-0.5"
      aria-label={t("analytics.reviewInbox.rating", {
        defaultValue: `${rating} out of 5 stars`,
        rating,
      })}
    >
      {[1, 2, 3, 4, 5].map((star) => (
        <Star
          key={star}
          className={`h-4 w-4 ${
            star <= rating
              ? "fill-amber-400 text-amber-400"
              : "text-muted-foreground/25"
          }`}
          aria-hidden="true"
        />
      ))}
    </div>
  );
};

const ReviewCard = ({
  review,
  onOpenVisit,
}: {
  review: FeedbackReview;
  onOpenVisit?: (feedbackId: string) => void;
}) => {
  const { t, i18n } = useTranslation();
  const date = new Intl.DateTimeFormat(i18n.language, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(review.createdAt));

  return (
    <article className="rounded-xl border border-border/70 bg-background/70 p-3 sm:p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <ReviewStars rating={review.rating} />
        <div className="flex items-center gap-2">
          <span className="rounded-full bg-primary/10 px-2 py-1 text-[10px] font-bold uppercase tracking-wide text-primary">
            {review.source === "GOOGLE"
              ? "Google"
              : t("analytics.reviewInbox.local", { defaultValue: "Local" })}
          </span>
          <time
            dateTime={review.createdAt}
            className="text-[11px] font-medium text-muted-foreground"
          >
            {date}
          </time>
        </div>
      </div>

      <p className="mt-3 text-sm font-medium leading-relaxed text-foreground">
        {review.comment ||
          t("analytics.reviewInbox.noComment", {
            defaultValue: "No written comment",
          })}
      </p>

      <div className="mt-3 flex flex-wrap gap-x-4 gap-y-2 text-xs text-muted-foreground">
        <span className="inline-flex items-center gap-1.5">
          <UserRound className="h-3.5 w-3.5" aria-hidden="true" />
          {review.authorName ||
            t("analytics.reviewInbox.anonymous", {
              defaultValue: "Anonymous guest",
            })}
        </span>
        {review.tableName && (
          <span className="inline-flex items-center gap-1.5">
            <Table2 className="h-3.5 w-3.5" aria-hidden="true" />
            {review.tableName}
          </span>
        )}
        {review.payment && (
          <span className="inline-flex items-center gap-1.5">
            <CreditCard className="h-3.5 w-3.5" aria-hidden="true" />
            {formatPaymentProvider(review.payment.provider, t)}
            {" · "}
            {formatPaymentAmount(
              review.payment.amount,
              review.payment.currency,
              i18n.language,
            )}
          </span>
        )}
        {!review.payment && review.orderTotal !== null && (
          <span className="inline-flex items-center gap-1.5">
            <ReceiptText className="h-3.5 w-3.5" aria-hidden="true" />
            {t("analytics.reviewInbox.order", { defaultValue: "Order" })}
            {" · "}
            {formatPaymentAmount(review.orderTotal, "EUR", i18n.language)}
          </span>
        )}
        {review.googleReviewClickedAt && (
          <span className="inline-flex items-center gap-1.5 text-emerald-600 dark:text-emerald-400">
            <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
            {t("analytics.reviewInbox.googleLinkOpened", {
              defaultValue: "Google link opened",
            })}
          </span>
        )}
      </div>

      {/* Only offered when the review is actually traceable to a session —
          Google-sourced reviews and orphaned rows have nothing to open. */}
      {review.sessionId && onOpenVisit && (
        <button
          type="button"
          onClick={() => onOpenVisit(review.id)}
          className="mt-3 inline-flex items-center gap-1 text-xs font-semibold text-primary transition hover:gap-2"
        >
          {t("analytics.reviewInbox.viewVisit", {
            defaultValue: "View the visit",
          })}
          <ChevronRight className="h-3.5 w-3.5" aria-hidden="true" />
        </button>
      )}
    </article>
  );
};

export const ReviewInbox = ({ restaurantId }: ReviewInboxProps) => {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [visitFeedbackId, setVisitFeedbackId] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [rating, setRating] = useState<number>();
  const [commentsOnly, setCommentsOnly] = useState(false);
  const [sort, setSort] = useState<"NEWEST" | "OLDEST">("NEWEST");
  const { data, isLoading, isError } = useQuery({
    queryKey: ["feedbackReviews", "preview", restaurantId],
    queryFn: () =>
      getFeedbackReviews({
        restaurantId,
        page: 1,
        limit: 3,
      }),
    enabled: Boolean(restaurantId),
    staleTime: 60_000,
  });
  const {
    data: inboxData,
    isLoading: inboxLoading,
    isError: inboxError,
  } = useQuery({
    queryKey: [
      "feedbackReviews",
      "inbox",
      restaurantId,
      page,
      rating,
      commentsOnly,
      sort,
    ],
    queryFn: () =>
      getFeedbackReviews({
        restaurantId,
        page,
        limit: 10,
        ...(rating ? { rating } : {}),
        ...(commentsOnly ? { hasComment: true } : {}),
        ...(sort === "OLDEST" ? { sort } : {}),
      }),
    enabled: open && Boolean(restaurantId),
    staleTime: 60_000,
  });

  if (isLoading) {
    return (
      <div
        className="space-y-2"
        aria-label={t("analytics.reviewInbox.loading", {
          defaultValue: "Loading reviews",
        })}
      >
        {[1, 2].map((item) => (
          <div
            key={item}
            className="h-24 animate-pulse rounded-xl bg-muted/60"
          />
        ))}
      </div>
    );
  }

  if (isError) {
    return (
      <p className="rounded-xl border border-destructive/20 bg-destructive/5 p-3 text-xs text-destructive">
        {t("analytics.reviewInbox.loadFailed", {
          defaultValue: "Reviews could not be loaded.",
        })}
      </p>
    );
  }

  if (!data || data.data.length === 0) return null;

  return (
    <div className="mt-5 space-y-3 border-t border-border/70 pt-5">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <MessageSquareText
            className="h-4 w-4 text-primary"
            aria-hidden="true"
          />
          <h3 className="text-xs font-black uppercase tracking-wider text-foreground">
            {t("analytics.reviewInbox.recent", {
              defaultValue: "Recent reviews",
            })}
          </h3>
        </div>
        <DashboardButton
          density="compact"
          className="min-h-9 border border-border bg-background px-3 text-xs text-foreground hover:bg-muted"
          onClick={() => {
            setPage(1);
            setRating(undefined);
            setCommentsOnly(false);
            setSort("NEWEST");
            setOpen(true);
          }}
        >
          {t("analytics.reviewInbox.viewAll", { defaultValue: "View all" })}
          <ChevronRight className="h-3.5 w-3.5" aria-hidden="true" />
        </DashboardButton>
      </div>
      <div className="space-y-2">
        {data.data.map((review) => (
          <ReviewCard
            key={review.id}
            review={review}
            onOpenVisit={setVisitFeedbackId}
          />
        ))}
      </div>

      <Modal
        open={open}
        onOpenChange={setOpen}
        title={t("analytics.reviewInbox.allReviews", {
          defaultValue: "All reviews",
        })}
        description={t("analytics.reviewInbox.allReviewsDescription", {
          defaultValue:
            "Private feedback collected after completed table visits.",
        })}
        dashboardUi
        titleClassName="text-xl sm:text-2xl"
        contentClassName="w-[calc(100vw-1rem)] max-w-4xl max-h-[calc(100dvh-1rem)] overflow-hidden rounded-2xl p-3 sm:p-5"
      >
        <div className="max-h-[calc(100dvh-10rem)] space-y-3 overflow-y-auto pr-1">
          <div className="grid grid-cols-1 gap-2 rounded-xl border border-border bg-muted/30 p-2 sm:grid-cols-2 sm:items-end sm:p-3 lg:grid-cols-[minmax(0,160px)_minmax(0,180px)_auto_1fr]">
            <label className="space-y-1">
              <span className="block text-[11px] font-bold text-muted-foreground">
                {t("analytics.reviewInbox.ratingFilter", {
                  defaultValue: "Rating",
                })}
              </span>
              <select
                value={rating ?? ""}
                onChange={(event) => {
                  setRating(
                    event.target.value ? Number(event.target.value) : undefined,
                  );
                  setPage(1);
                }}
                className="h-11 w-full rounded-lg border border-border bg-background px-3 text-sm font-semibold text-foreground outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/15"
              >
                <option value="">
                  {t("analytics.reviewInbox.allRatings", {
                    defaultValue: "All ratings",
                  })}
                </option>
                {[5, 4, 3, 2, 1].map((value) => (
                  <option key={value} value={value}>
                    {t("analytics.reviewInbox.starFilter", {
                      defaultValue: `${value} stars`,
                      count: value,
                    })}
                  </option>
                ))}
              </select>
            </label>

            <label className="space-y-1">
              <span className="block text-[11px] font-bold text-muted-foreground">
                {t("analytics.reviewInbox.sort", {
                  defaultValue: "Sort",
                })}
              </span>
              <select
                value={sort}
                onChange={(event) => {
                  setSort(event.target.value as "NEWEST" | "OLDEST");
                  setPage(1);
                }}
                className="h-11 w-full rounded-lg border border-border bg-background px-3 text-sm font-semibold text-foreground outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/15"
              >
                <option value="NEWEST">
                  {t("analytics.reviewInbox.newest", {
                    defaultValue: "Newest first",
                  })}
                </option>
                <option value="OLDEST">
                  {t("analytics.reviewInbox.oldest", {
                    defaultValue: "Oldest first",
                  })}
                </option>
              </select>
            </label>

            <label className="flex min-h-11 cursor-pointer items-center gap-2 rounded-lg border border-border bg-background px-3 text-sm font-semibold text-foreground">
              <input
                type="checkbox"
                checked={commentsOnly}
                onChange={(event) => {
                  setCommentsOnly(event.target.checked);
                  setPage(1);
                }}
                className="h-4 w-4 rounded border-border text-primary focus:ring-primary/20"
              />
              {t("analytics.reviewInbox.commentsOnly", {
                defaultValue: "Comments only",
              })}
            </label>

            <div className="flex min-h-11 items-center justify-between gap-3 rounded-lg bg-primary/5 px-3 text-xs">
              <span className="font-bold text-primary">
                {t("analytics.reviewInbox.localReviews", {
                  defaultValue: "Local reviews",
                })}
              </span>
              <span className="font-semibold text-muted-foreground">
                {inboxData?.total ?? 0}
              </span>
            </div>
          </div>

          {inboxLoading && (
            <div className="space-y-2">
              {[1, 2, 3].map((item) => (
                <div
                  key={item}
                  className="h-28 animate-pulse rounded-xl bg-muted/60"
                />
              ))}
            </div>
          )}
          {inboxError && (
            <p className="rounded-xl border border-destructive/20 bg-destructive/5 p-3 text-sm text-destructive">
              {t("analytics.reviewInbox.loadFailed", {
                defaultValue: "Reviews could not be loaded.",
              })}
            </p>
          )}
          {inboxData && inboxData.data.length === 0 && (
            <div className="rounded-xl border border-dashed border-border p-8 text-center">
              <MessageSquareText
                className="mx-auto h-6 w-6 text-muted-foreground/50"
                aria-hidden="true"
              />
              <p className="mt-2 text-sm font-semibold text-muted-foreground">
                {t("analytics.reviewInbox.noMatches", {
                  defaultValue: "No reviews match these filters.",
                })}
              </p>
            </div>
          )}
          {inboxData?.data.map((review) => (
            <ReviewCard
              key={review.id}
              review={review}
              onOpenVisit={setVisitFeedbackId}
            />
          ))}
          {inboxData && inboxData.totalPages > 1 && (
            <div className="flex items-center justify-between gap-3 border-t border-border pt-3">
              <DashboardButton
                density="compact"
                className="min-h-10 border border-border bg-background px-3 text-xs"
                disabled={page <= 1}
                onClick={() => setPage((current) => Math.max(1, current - 1))}
              >
                {t("analytics.reviewInbox.previous", {
                  defaultValue: "Previous",
                })}
              </DashboardButton>
              <span className="text-xs font-semibold text-muted-foreground">
                {t("analytics.reviewInbox.page", {
                  defaultValue: `Page ${page} of ${inboxData.totalPages}`,
                  page,
                  totalPages: inboxData.totalPages,
                })}
              </span>
              <DashboardButton
                density="compact"
                className="min-h-10 border border-border bg-background px-3 text-xs"
                disabled={page >= inboxData.totalPages}
                onClick={() =>
                  setPage((current) =>
                    Math.min(inboxData.totalPages, current + 1),
                  )
                }
              >
                {t("analytics.reviewInbox.next", { defaultValue: "Next" })}
              </DashboardButton>
            </div>
          )}
        </div>
      </Modal>

      <VisitDetailDrawer
        feedbackId={visitFeedbackId}
        onClose={() => setVisitFeedbackId(null)}
      />
    </div>
  );
};
