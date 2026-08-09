import { useEffect, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { Monitor, Smartphone, X } from "lucide-react";
import { useTranslation } from "react-i18next";
import { getFeedbackVisit } from "../../../lib/api";
import { formatPaymentAmount, formatPaymentProvider } from "./reviewFormatting";

type VisitDetailDrawerProps = {
  feedbackId: string | null;
  onClose: () => void;
};

/**
 * The visit behind a review: what was ordered, by which channel, and how it was
 * paid. A rating on its own tells an owner that something went wrong but not
 * what — this is the context that makes it actionable.
 */
export const VisitDetailDrawer = ({
  feedbackId,
  onClose,
}: VisitDetailDrawerProps) => {
  const { t, i18n } = useTranslation();
  const closeRef = useRef<HTMLButtonElement>(null);

  const { data, isLoading, isError } = useQuery({
    queryKey: ["feedback-visit", feedbackId],
    queryFn: () => getFeedbackVisit(feedbackId as string),
    enabled: Boolean(feedbackId),
  });

  const isOpen = Boolean(feedbackId);

  useEffect(() => {
    if (!isOpen) return;
    closeRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const formatTime = (value: string) =>
    new Intl.DateTimeFormat(i18n.language, { timeStyle: "short" }).format(
      new Date(value),
    );

  const formatDate = (value: string) =>
    new Intl.DateTimeFormat(i18n.language, { dateStyle: "medium" }).format(
      new Date(value),
    );

  return (
    <div className="fixed inset-0 z-[60] flex justify-end">
      <button
        type="button"
        aria-label={t("analytics.visitDrawer.close", {
          defaultValue: "Close",
        })}
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={onClose}
        tabIndex={-1}
      />

      <aside
        role="dialog"
        aria-modal="true"
        aria-label={t("analytics.visitDrawer.title", {
          defaultValue: "Visit detail",
        })}
        className="relative flex h-full w-full max-w-md flex-col overflow-y-auto border-l border-border bg-background shadow-2xl"
      >
        <header className="sticky top-0 z-10 flex items-start justify-between gap-3 border-b border-border bg-background/95 px-5 py-4 backdrop-blur">
          <div>
            <h2 className="text-lg font-bold text-foreground">
              {data?.session.tableName ??
                t("analytics.visitDrawer.title", {
                  defaultValue: "Visit detail",
                })}
            </h2>
            {data && (
              <p className="mt-0.5 text-xs text-muted-foreground">
                {formatDate(data.session.openedAt)} ·{" "}
                {formatTime(data.session.openedAt)}
                {data.session.paidAt
                  ? ` – ${formatTime(data.session.paidAt)}`
                  : ""}
                {" · "}
                {/* Plain interpolation, not i18next's `count` — plural rules
                    across 12 locales (Arabic has six forms) buy nothing here
                    when the label can be phrased neutrally instead. */}
                {t("analytics.visitDrawer.orderCount", {
                  defaultValue: "Orders: {{n}}",
                  n: data.orders.length,
                })}
              </p>
            )}
          </div>
          <button
            ref={closeRef}
            type="button"
            onClick={onClose}
            aria-label={t("analytics.visitDrawer.close", {
              defaultValue: "Close",
            })}
            className="rounded-lg p-1.5 text-muted-foreground transition hover:bg-muted hover:text-foreground"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </header>

        <div className="flex-1 px-5 py-4">
          {isLoading && (
            <div className="space-y-3" aria-busy="true">
              {[1, 2, 3].map((row) => (
                <div
                  key={row}
                  className="h-16 animate-pulse rounded-xl bg-muted/60"
                />
              ))}
            </div>
          )}

          {isError && (
            <p className="text-sm text-red-500" role="alert">
              {t("analytics.visitDrawer.error", {
                defaultValue: "Could not load this visit.",
              })}
            </p>
          )}

          {data && (
            <>
              {data.orders.length === 0 && (
                <p className="text-sm text-muted-foreground">
                  {t("analytics.visitDrawer.noOrders", {
                    defaultValue: "No orders were recorded for this visit.",
                  })}
                </p>
              )}

              {data.orders.map((order, index) => (
                <section key={order.id} className="mb-5">
                  <div className="mb-2 flex items-center justify-between gap-2">
                    <h3 className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
                      {t("analytics.visitDrawer.orderLabel", {
                        defaultValue: "Order {{number}}",
                        number: index + 1,
                      })}
                      {" · "}
                      {formatTime(order.createdAt)}
                    </h3>
                    <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-primary">
                      {order.source === "POS" ? (
                        <Monitor className="h-3 w-3" aria-hidden="true" />
                      ) : (
                        <Smartphone className="h-3 w-3" aria-hidden="true" />
                      )}
                      {order.source === "POS"
                        ? t("analytics.visitDrawer.sourcePos", {
                            defaultValue: "POS",
                          })
                        : t("analytics.visitDrawer.sourceQr", {
                            defaultValue: "QR",
                          })}
                    </span>
                  </div>

                  <ul className="rounded-xl border border-border/70 bg-background/70">
                    {order.items.map((item) => (
                      <li
                        key={item.id}
                        className="flex items-start justify-between gap-3 border-b border-border/50 px-3 py-2 text-sm last:border-b-0"
                      >
                        <span className="text-foreground">
                          <span className="font-semibold tabular-nums">
                            {item.quantity}×
                          </span>{" "}
                          {item.name}
                          {item.notes && (
                            <span className="mt-0.5 block text-xs italic text-muted-foreground">
                              {item.notes}
                            </span>
                          )}
                        </span>
                        <span className="shrink-0 font-medium tabular-nums text-foreground">
                          {formatPaymentAmount(
                            item.lineTotal,
                            "EUR",
                            i18n.language,
                          )}
                        </span>
                      </li>
                    ))}
                  </ul>
                </section>
              ))}

              {data.payments.length > 0 && (
                <section className="border-t border-border pt-4">
                  {data.payments.map((payment) => (
                    <div
                      key={payment.id}
                      className="flex items-center justify-between gap-3 py-1 text-sm"
                    >
                      <span className="text-muted-foreground">
                        {formatPaymentProvider(payment.provider, t)}
                        {payment.tipAmount > 0 && (
                          <>
                            {" · "}
                            {t("analytics.visitDrawer.tip", {
                              defaultValue: "Tip",
                            })}{" "}
                            {formatPaymentAmount(
                              payment.tipAmount,
                              payment.currency,
                              i18n.language,
                            )}
                          </>
                        )}
                      </span>
                      <span className="font-bold tabular-nums text-foreground">
                        {formatPaymentAmount(
                          payment.amount,
                          payment.currency,
                          i18n.language,
                        )}
                      </span>
                    </div>
                  ))}
                </section>
              )}
            </>
          )}
        </div>
      </aside>
    </div>
  );
};

export default VisitDetailDrawer;
