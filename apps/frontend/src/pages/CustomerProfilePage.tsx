import React, { useEffect, useState } from "react";
import { useAuth } from "../context/AuthContext";
import api from "../lib/api";
import { useNavigate } from "react-router-dom";
import { Button } from "../components/ui/button";

export const CustomerProfilePage: React.FC = () => {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [history, setHistory] = useState<any[]>([]);
  const [loyaltyAccounts, setLoyaltyAccounts] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (user) {
      setIsLoading(true);
      Promise.all([
        api.get("/loyalty/orders/history"),
        api.get("/loyalty/accounts"),
      ])
        .then(([historyRes, accountsRes]) => {
          setHistory(historyRes.data || []);
          setLoyaltyAccounts(accountsRes.data || []);
        })
        .catch((err) => {
          console.error("Failed to load profile data:", err);
          setHistory([]);
          setLoyaltyAccounts([]);
        })
        .finally(() => setIsLoading(false));
    } else {
      setIsLoading(false);
    }
  }, [user]);

  if (!user) {
    return (
      <div className="pt-32 text-center">
        <p>Please log in to view your profile.</p>
        <Button onClick={() => navigate("/login")} className="mt-4">
          Login
        </Button>
      </div>
    );
  }

  return (
    <div className="pt-28 pb-12 px-4 sm:px-6 lg:px-8 max-w-4xl mx-auto min-h-screen">
      <div className="flex justify-between items-center mb-10">
        <h1 className="text-4xl font-serif font-black text-foreground tracking-tighter">
          My Profile
        </h1>
        <Button variant="outline" onClick={logout}>
          Sign Out
        </Button>
      </div>

      <div className="glass-panel p-8 rounded-[2rem] border-white/5 mb-8">
        <h2 className="text-2xl font-bold mb-2">
          Welcome back, {user.name || user.email.split("@")[0]}!
        </h2>
        <p className="text-muted-foreground">
          View your order history and earned loyalty points.
        </p>
      </div>

      {loyaltyAccounts.length > 0 && (
        <div className="glass-panel p-8 rounded-[2rem] border-white/5 mb-8">
          <h2 className="text-xl font-bold mb-6">Your VIP Tiers & Points</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {loyaltyAccounts.map((acc: any) => {
              // Tier info is computed by the backend (single source of truth).
              // tierConfig thresholds vary per restaurant, so we never hardcode them.
              const tier: string = acc.tier ?? (acc.lifetimePoints >= 2000 ? "Gold" : acc.lifetimePoints >= 500 ? "Silver" : "Bronze");
              const multiplier = `${acc.tierMultiplier ?? 1.0}x`;
              const nextTierName: string = acc.nextTierName ?? "Silver";
              const pointsToNext: number = acc.pointsToNextTier ?? 0;
              const progressStr = `${Math.min(100, acc.tierProgressPercent ?? 0)}%`;
              const borderColor =
                acc.lifetimePoints >= 2000
                  ? "border-yellow-500"
                  : acc.lifetimePoints >= 500
                    ? "border-slate-400"
                    : "border-orange-700";
              const bgColor =
                acc.lifetimePoints >= 2000
                  ? "bg-yellow-500/10"
                  : acc.lifetimePoints >= 500
                    ? "bg-slate-400/10"
                    : "bg-orange-700/10";
              const textColor =
                acc.lifetimePoints >= 2000
                  ? "text-yellow-500"
                  : acc.lifetimePoints >= 500
                    ? "text-slate-300"
                    : "text-orange-600";
              const rewardValue: number =
                typeof acc.rewardValue === "number"
                  ? acc.rewardValue
                  : acc.points / (acc.restaurant?.loyaltyRedeemRate || 150);
              const rewardProgress: number = acc.firstRewardProgressPercent ?? 0;
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
                        Current Balance
                      </p>
                      <p className={`text-3xl font-black ${textColor}`}>
                        {acc.points} pts
                      </p>
                      <p className="text-sm font-bold text-muted-foreground mt-1">
                        Value: EUR {rewardValue.toFixed(2)}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-widest">
                        Multiplier
                      </p>
                      <p className={`text-xl font-bold ${textColor}`}>
                        {multiplier}
                      </p>
                    </div>
                  </div>

                  <div className="mt-4 pt-4 border-t border-white/10">
                    <div className="flex justify-between text-xs text-muted-foreground mb-2">
                      <span>First EUR 1 reward</span>
                      {pointsToFirstReward > 0 ? (
                        <span>{pointsToFirstReward} pts to go</span>
                      ) : (
                        <span>Ready to redeem</span>
                      )}
                    </div>
                    <div className="w-full bg-black/40 rounded-full h-2">
                      <div
                        className={`h-2 rounded-full ${textColor.replace("text-", "bg-")}`}
                        style={{ width: `${rewardProgress}%` }}
                      ></div>
                    </div>
                    <p className="text-xs text-muted-foreground mt-2">
                      {rewardProgress}% of the way to your first EUR 1 reward.
                    </p>
                  </div>

                  {expiringSoonPoints > 0 && (
                    <div className="mt-4 rounded-xl border border-yellow-500/25 bg-yellow-500/10 p-3">
                      <p className="text-xs font-bold text-yellow-600 dark:text-yellow-400">
                        EUR {expiringSoonValue.toFixed(2)} in rewards expires
                        soon
                      </p>
                      <p className="text-xs text-muted-foreground mt-1">
                        {expiringSoonPoints} points expire
                        {nextExpirationAt
                          ? ` on ${nextExpirationAt.toLocaleDateString()}`
                          : " soon"}
                        . Come back before they disappear.
                      </p>
                    </div>
                  )}

                  <div className="mt-4 pt-4 border-t border-white/10">
                    <div className="flex justify-between text-xs text-muted-foreground mb-2">
                      <span>Lifetime: {acc.lifetimePoints} pts</span>
                      {pointsToNext > 0 ? (
                        <span>
                          {pointsToNext} pts to {nextTierName}
                        </span>
                      ) : (
                        <span>Max Tier Reached</span>
                      )}
                    </div>
                    <div className="w-full bg-black/40 rounded-full h-2">
                      <div
                        className={`h-2 rounded-full ${textColor.replace("text-", "bg-")}`}
                        style={{ width: progressStr }}
                      ></div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <div className="glass-panel p-8 rounded-[2rem] border-white/5">
        <h2 className="text-xl font-bold mb-6">Past Orders</h2>
        {isLoading ? (
          <p className="text-muted-foreground">Loading history...</p>
        ) : history.length === 0 ? (
          <div className="text-center py-10 opacity-60">
            <p className="font-bold mb-2">No orders yet</p>
            <p className="text-sm">
              When you order from participating restaurants, they'll appear
              here.
            </p>
          </div>
        ) : (
          <ul className="space-y-6">
            {history.map((order) => (
              <li
                key={order.id}
                className="p-6 bg-accent/5 border border-accent/10 rounded-2xl flex flex-col sm:flex-row justify-between sm:items-center gap-4"
              >
                <div>
                  <h3 className="font-black text-lg">
                    {order.restaurant.name}
                  </h3>
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-widest mt-1">
                    {new Date(order.createdAt).toLocaleDateString()} at{" "}
                    {new Date(order.createdAt).toLocaleTimeString()}
                  </p>
                  <p className="text-sm mt-3 font-medium">
                    {order.items
                      ?.map(
                        (i: any) =>
                          `${i.quantity}x ${i.menuItem?.name || "Item"}`,
                      )
                      .join(", ") || "No items"}
                  </p>
                </div>
                <div className="text-left sm:text-right shrink-0">
                  <p className="font-bold text-2xl">
                    €{order.totalPrice.toFixed(2)}
                  </p>
                  <div className="mt-2 inline-flex items-center gap-2 bg-green-500/10 text-green-600 px-3 py-1 rounded-full text-xs font-bold">
                    <span>+{order.pointsEarned} Pts</span>
                    {order.pointsRedeemed > 0 && (
                      <span className="text-red-500 ml-1">
                        (-{order.pointsRedeemed} Pts)
                      </span>
                    )}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
};

export default CustomerProfilePage;
