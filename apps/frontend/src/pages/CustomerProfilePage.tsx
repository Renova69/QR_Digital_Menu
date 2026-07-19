import React, { useEffect, useState } from "react";
import { useAuth } from "../context/AuthContext";
import api from "../lib/api";
import { useNavigate } from "react-router-dom";
import { Button } from "../components/ui/button";
import { useTranslation } from "react-i18next";
import DataPrivacyTab from "./profile/DataPrivacyTab";

export const CustomerProfilePage: React.FC = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { t, i18n } = useTranslation();

  const [history, setHistory] = useState<any[]>([]);
  const [loyaltyAccounts, setLoyaltyAccounts] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [historyLoadFailed, setHistoryLoadFailed] = useState(false);

  useEffect(() => {
    if (user) {
      let active = true;
      setIsLoading(true);
      setHistoryLoadFailed(false);

      api
        .get("/loyalty/orders/history")
        .then((historyRes) => {
          if (active) setHistory(historyRes.data || []);
        })
        .catch((err) => {
          console.error("Failed to load order history:", err);
          if (active) {
            setHistory([]);
            setHistoryLoadFailed(true);
          }
        })
        .finally(() => {
          if (active) setIsLoading(false);
        });

      api
        .get("/loyalty/accounts")
        .then((accountsRes) => {
          if (active) setLoyaltyAccounts(accountsRes.data || []);
        })
        .catch((err) => {
          console.error("Failed to load loyalty accounts:", err);
          if (active) setLoyaltyAccounts([]);
        });

      return () => {
        active = false;
      };
    } else {
      setIsLoading(false);
      setHistoryLoadFailed(false);
    }
  }, [user]);

  if (!user) {
    return (
      <div className="pt-32 text-center">
        <p>{t("profile.pleaseLogin")}</p>
        <Button onClick={() => navigate("/login")} className="mt-4">
          {t("profile.loginButton")}
        </Button>
      </div>
    );
  }

  return (
    <div className="pt-28 pb-12 px-4 sm:px-6 lg:px-8 max-w-4xl mx-auto min-h-screen">
      <div className="mb-10">
        <h1 className="text-4xl font-display font-black text-foreground tracking-tighter">
          {t("profile.title")}
        </h1>
      </div>

      <div className="glass-panel p-8 rounded-[2rem] border-white/5 mb-8">
        <h2 className="text-2xl font-bold mb-2">
          {user.name
            ? t("profile.welcome", { name: user.name })
            : t("profile.welcomeBack", "Welcome back!")}
        </h2>
        <p className="text-muted-foreground">{t("profile.subtitle")}</p>
      </div>

      {loyaltyAccounts.length > 0 && (
        <div className="glass-panel p-8 rounded-[2rem] border-white/5 mb-8">
          <h2 className="text-xl font-bold mb-6">
            {t("profile.vipTiersTitle")}
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {loyaltyAccounts.map((acc: any) => {
              const tier: string = acc.tier ?? "Bronze";
              const tierLower = tier.toLowerCase();
              const multiplier = `${acc.tierMultiplier ?? 1.0}x`;
              const nextTierName: string = acc.nextTierName ?? "Silver";
              const pointsToNext: number = acc.pointsToNextTier ?? 0;
              const progressStr = `${Math.min(100, acc.tierProgressPercent ?? 0)}%`;
              const borderColor =
                tierLower === "gold"
                  ? "border-yellow-500"
                  : tierLower === "silver"
                    ? "border-slate-400"
                    : "border-orange-700";
              const bgColor =
                tierLower === "gold"
                  ? "bg-yellow-500/10"
                  : tierLower === "silver"
                    ? "bg-slate-400/10"
                    : "bg-orange-700/10";
              const textColor =
                tierLower === "gold"
                  ? "text-yellow-500"
                  : tierLower === "silver"
                    ? "text-slate-300"
                    : "text-orange-600";
              const rewardValue: number =
                typeof acc.rewardValue === "number"
                  ? acc.rewardValue
                  : acc.points / (acc.restaurant?.loyaltyRedeemRate || 150);
              const rewardProgress: number =
                acc.firstRewardProgressPercent ?? 0;
              const pointsToFirstReward: number = acc.pointsToFirstReward ?? 0;
              const expiringSoonPoints = acc.expiringSoonPoints || 0;
              const expiringSoonValue = acc.expiringSoonValue || 0;
              const nextExpirationAt = acc.nextExpirationAt
                ? new Date(acc.nextExpirationAt)
                : null;

              return (
                <div
                  key={acc.id}
                  className={`p-6 border ${borderColor} ${bgColor} rounded-2xl`}
                >
                  <div className="flex justify-between items-center mb-4">
                    <h3 className="font-black text-lg text-foreground">
                      {acc.restaurant.name}
                    </h3>
                    <span
                      className={`px-3 py-1 rounded-full text-xs font-bold bg-background ${textColor} border ${borderColor}`}
                    >
                      {tier}
                    </span>
                  </div>

                  <div className="flex justify-between items-end mb-4">
                    <div>
                      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-widest">
                        {t("profile.currentBalance")}
                      </p>
                      <p className={`text-3xl font-black ${textColor}`}>
                        {acc.points} {t("auto.pts", "pts")}
                      </p>
                      <p className="text-sm font-bold text-muted-foreground mt-1">
                        {t("auto.valueEUR", "Value: EUR")}
                        {rewardValue.toFixed(2)}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-widest">
                        {t("profile.multiplier")}
                      </p>
                      <p className={`text-xl font-bold ${textColor}`}>
                        {multiplier}
                      </p>
                    </div>
                  </div>

                  <div className="mt-4 pt-4 border-t border-white/10">
                    <div className="flex justify-between text-xs text-muted-foreground mb-2">
                      <span>{t("profile.firstReward")}</span>
                      {pointsToFirstReward > 0 ? (
                        <span>
                          {t("profile.ptsToGo", {
                            count: pointsToFirstReward,
                          })}
                        </span>
                      ) : (
                        <span>{t("profile.readyToRedeem")}</span>
                      )}
                    </div>
                    <div className="w-full bg-black/40 rounded-full h-2">
                      <div
                        className={`h-2 rounded-full ${textColor.replace("text-", "bg-")}`}
                        style={{ width: `${rewardProgress}%` }}
                      />
                    </div>
                    <p className="text-xs text-muted-foreground mt-2">
                      {t("profile.rewardProgress", { pct: rewardProgress })}
                    </p>
                  </div>

                  {expiringSoonPoints > 0 && (
                    <div className="mt-4 rounded-xl border border-yellow-500/25 bg-yellow-500/10 p-3">
                      <p className="text-xs font-bold text-yellow-600 dark:text-yellow-400">
                        {t("profile.expiringSoonTitle", {
                          value: expiringSoonValue.toFixed(2),
                        })}
                      </p>
                      <p className="text-xs text-muted-foreground mt-1">
                        {t("profile.expiringSoonBody", {
                          count: expiringSoonPoints,
                          date: nextExpirationAt
                            ? t("profile.expiringSoonOn", {
                                date: nextExpirationAt.toLocaleDateString(
                                  i18n.language,
                                ),
                              })
                            : "",
                        })}
                      </p>
                    </div>
                  )}

                  <div className="mt-4 pt-4 border-t border-white/10">
                    <div className="flex justify-between text-xs text-muted-foreground mb-2">
                      <span>
                        {t("profile.lifetime", { pts: acc.lifetimePoints })}
                      </span>
                      {pointsToNext > 0 ? (
                        <span>
                          {t("profile.ptsToTier", {
                            count: pointsToNext,
                            tier: nextTierName,
                          })}
                        </span>
                      ) : (
                        <span>{t("profile.maxTier")}</span>
                      )}
                    </div>
                    <div className="w-full bg-black/40 rounded-full h-2">
                      <div
                        className={`h-2 rounded-full ${textColor.replace("text-", "bg-")}`}
                        style={{ width: progressStr }}
                      />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <div className="glass-panel p-8 rounded-[2rem] border-white/5">
        <h2 className="text-xl font-bold mb-6">{t("profile.pastOrders")}</h2>
        {isLoading ? (
          <p className="text-muted-foreground">{t("profile.loading")}</p>
        ) : historyLoadFailed ? (
          <div className="text-center py-10 text-muted-foreground">
            <p className="font-bold">
              {t(
                "profile.historyLoadFailed",
                "Could not load past orders. Please try again.",
              )}
            </p>
          </div>
        ) : history.length === 0 ? (
          <div className="text-center py-10 opacity-60">
            <p className="font-bold mb-2">{t("profile.noOrders")}</p>
            <p className="text-sm">{t("profile.noOrdersHint")}</p>
          </div>
        ) : (
          <ul className="space-y-6">
            {history.map((order) => (
              <li
                key={order.id}
                className="p-6 bg-primary/5 border border-primary/10 rounded-2xl flex flex-col sm:flex-row justify-between sm:items-center gap-4"
              >
                <div>
                  <h3 className="font-black text-lg">
                    {order.restaurant.name}
                  </h3>
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-widest mt-1">
                    {new Date(order.createdAt).toLocaleDateString(
                      i18n.language,
                    )}{" "}
                    {t("profile.at")}{" "}
                    {new Date(order.createdAt).toLocaleTimeString(
                      i18n.language,
                      { hour: "2-digit", minute: "2-digit", hour12: false },
                    )}
                  </p>
                  <p className="text-sm mt-3 font-medium">
                    {order.items
                      ?.map(
                        (i: any) =>
                          `${i.quantity}x ${i.menuItem?.name || t("profile.noItems")}`,
                      )
                      .join(", ") || t("profile.noItems")}
                  </p>
                </div>
                <div className="text-left sm:text-right shrink-0">
                  <p className="font-bold text-2xl">
                    €{order.totalPrice.toFixed(2)}
                  </p>
                  <div className="mt-2 inline-flex items-center gap-2 bg-green-500/10 text-green-600 px-3 py-1 rounded-full text-xs font-bold">
                    <span>
                      +{order.pointsEarned} {t("auto.pts", "Pts")}
                    </span>
                    {order.pointsRedeemed > 0 && (
                      <span className="text-red-500 ml-1">
                        (-{order.pointsRedeemed} {t("auto.pts", "Pts")})
                      </span>
                    )}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="mt-8">
        <DataPrivacyTab />
      </div>
    </div>
  );
};

export default CustomerProfilePage;
