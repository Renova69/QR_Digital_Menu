import React from "react";
import { useTranslation } from "react-i18next";
import { AlertTriangle, Award } from "lucide-react";

const inputCls =
  "w-full px-3 py-2 border border-border rounded-lg bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-accent/50 transition-all";

interface LoyaltySettingsTabProps {
  isLoyaltyEnabled: boolean;
  setIsLoyaltyEnabled: (v: boolean) => void;
  loyaltySignupBonus: number;
  setLoyaltySignupBonus: (v: number) => void;
  loyaltyExchangeRate: number;
  setLoyaltyExchangeRate: (v: number) => void;
  loyaltyRedeemRate: number;
  setLoyaltyRedeemRate: (v: number) => void;
  loyaltyPointExpiryDays: number;
  setLoyaltyPointExpiryDays: (v: number) => void;
  loyaltyExpiryReminderDays: number;
  setLoyaltyExpiryReminderDays: (v: number) => void;
  loyaltySilverThreshold: number;
  setLoyaltySilverThreshold: (v: number) => void;
  loyaltyGoldThreshold: number;
  setLoyaltyGoldThreshold: (v: number) => void;
  loyaltySilverMultiplier: number;
  setLoyaltySilverMultiplier: (v: number) => void;
  loyaltyGoldMultiplier: number;
  setLoyaltyGoldMultiplier: (v: number) => void;
  happyHourEnable: boolean;
  setHappyHourEnable: (v: boolean) => void;
  happyHourStartTime: string;
  setHappyHourStartTime: (v: string) => void;
  happyHourEndTime: string;
  setHappyHourEndTime: (v: string) => void;
  happyHourMultiplier: number;
  setHappyHourMultiplier: (v: number) => void;
  notifyAllStaffOnPayment: boolean;
  setNotifyAllStaffOnPayment: (v: boolean) => void;
  paymentsEnabled: boolean;
}

const LoyaltySettingsTab: React.FC<LoyaltySettingsTabProps> = ({
  isLoyaltyEnabled,
  setIsLoyaltyEnabled,
  loyaltySignupBonus,
  setLoyaltySignupBonus,
  loyaltyExchangeRate,
  setLoyaltyExchangeRate,
  loyaltyRedeemRate,
  setLoyaltyRedeemRate,
  loyaltyPointExpiryDays,
  setLoyaltyPointExpiryDays,
  loyaltyExpiryReminderDays,
  setLoyaltyExpiryReminderDays,
  loyaltySilverThreshold,
  setLoyaltySilverThreshold,
  loyaltyGoldThreshold,
  setLoyaltyGoldThreshold,
  loyaltySilverMultiplier,
  setLoyaltySilverMultiplier,
  loyaltyGoldMultiplier,
  setLoyaltyGoldMultiplier,
  happyHourEnable,
  setHappyHourEnable,
  happyHourStartTime,
  setHappyHourStartTime,
  happyHourEndTime,
  setHappyHourEndTime,
  happyHourMultiplier,
  setHappyHourMultiplier,
  notifyAllStaffOnPayment,
  setNotifyAllStaffOnPayment,
  paymentsEnabled,
}) => {
  const { t } = useTranslation();

  return (
    <>
      {/* ── Loyalty & Rewards ── */}
      <div className="border-b border-border pb-6">
        <h3 className="text-lg font-medium text-foreground mb-4">
          {t('loyaltySettings.sectionTitle')}
        </h3>

        <div className="mb-6 p-4 bg-accent/5 border border-accent/20 rounded-xl flex items-center justify-between">
          <div>
            <p className="font-bold text-accent">{t('loyaltySettings.enableLoyalty')}</p>
            <p className="text-xs text-muted-foreground mt-1">
              {t('loyaltySettings.enableLoyaltyDesc')}
            </p>
          </div>
          <label className="relative inline-flex items-center cursor-pointer">
            <input
              type="checkbox"
              className="sr-only peer"
              checked={isLoyaltyEnabled}
              onChange={(e) => setIsLoyaltyEnabled(e.target.checked)}
            />
            <div className="w-11 h-6 bg-zinc-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-accent"></div>
          </label>
        </div>

        {isLoyaltyEnabled && (
          <div className="space-y-6">
            {/* Points economy */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="block text-sm font-medium text-foreground/80 mb-1">
                  {t('loyaltySettings.signupBonus')}
                </label>
                <input
                  type="number"
                  min={0}
                  value={loyaltySignupBonus}
                  onChange={(e) => setLoyaltySignupBonus(Number(e.target.value))}
                  className={inputCls}
                />
                <p className="text-[10px] text-muted-foreground mt-1">
                  {t('loyaltySettings.signupBonusDesc')}
                </p>
              </div>
              <div>
                <label className="block text-sm font-medium text-foreground/80 mb-1">
                  {t('loyaltySettings.earnRate')}
                </label>
                <input
                  type="number"
                  min={1}
                  max={100}
                  value={loyaltyExchangeRate}
                  onChange={(e) => setLoyaltyExchangeRate(Number(e.target.value))}
                  className={inputCls}
                />
                <p className="text-[10px] text-muted-foreground mt-1">
                  {t('loyaltySettings.earnRateDesc')}
                </p>
              </div>
              <div>
                <label className="block text-sm font-medium text-foreground/80 mb-1">
                  {t('loyaltySettings.redeemRate')}
                </label>
                <input
                  type="number"
                  min={1}
                  value={loyaltyRedeemRate}
                  onChange={(e) => setLoyaltyRedeemRate(Number(e.target.value))}
                  className={inputCls}
                />
                <p className="text-[10px] text-muted-foreground mt-1">
                  {t('loyaltySettings.redeemRateDesc')}
                </p>
              </div>
            </div>

            {/* Live cashback preview */}
            <div className="text-xs text-muted-foreground bg-accent/5 border border-accent/10 rounded-lg px-3 py-2">
              <span className={`font-semibold ${(loyaltyExchangeRate / loyaltyRedeemRate) > 0.15 ? "text-yellow-500" : "text-accent"}`}>
                {t('loyaltySettings.cashbackInfo', { pct: ((loyaltyExchangeRate / loyaltyRedeemRate) * 100).toFixed(1) })}
              </span>
              {(loyaltyExchangeRate / loyaltyRedeemRate) > 0.15 && (
                <span className="ml-2 text-yellow-500"><AlertTriangle className="inline-block w-3 h-3 mr-1" />{t('loyaltySettings.cashbackWarning')}</span>
              )}
            </div>

            {/* Expiry */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-foreground/80 mb-1">
                  {t('loyaltySettings.expiryDays')}
                </label>
                <input
                  type="number"
                  min={1}
                  value={loyaltyPointExpiryDays}
                  onChange={(e) => setLoyaltyPointExpiryDays(Number(e.target.value))}
                  className={inputCls}
                />
                <p className="text-[10px] text-muted-foreground mt-1">
                  {t('loyaltySettings.expiryDaysDesc')}
                </p>
              </div>
              <div>
                <label className="block text-sm font-medium text-foreground/80 mb-1">
                  {t('loyaltySettings.reminderDays')}
                </label>
                <input
                  type="number"
                  min={1}
                  value={loyaltyExpiryReminderDays}
                  onChange={(e) => setLoyaltyExpiryReminderDays(Number(e.target.value))}
                  className={inputCls}
                />
                <p className="text-[10px] text-muted-foreground mt-1">
                  {t('loyaltySettings.reminderDaysDesc')}
                </p>
              </div>
            </div>

            {/* VIP Tiers */}
            <div className="pt-4 border-t border-white/5">
              <p className="font-bold text-foreground mb-1">{t('loyaltySettings.vipTiers')}</p>
              <p className="text-xs text-muted-foreground mb-4">
                {t('loyaltySettings.vipTiersDesc')}
              </p>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div>
                  <label className="block text-sm font-medium text-foreground/80 mb-1">
                    <Award className="inline-block w-3.5 h-3.5 mr-1 text-slate-400" />{t('loyaltySettings.silverThreshold')}
                  </label>
                  <input
                    type="number"
                    min={1}
                    value={loyaltySilverThreshold}
                    onChange={(e) => setLoyaltySilverThreshold(Number(e.target.value))}
                    className={inputCls}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-foreground/80 mb-1">
                    <Award className="inline-block w-3.5 h-3.5 mr-1 text-amber-400" />{t('loyaltySettings.goldThreshold')}
                  </label>
                  <input
                    type="number"
                    min={2}
                    value={loyaltyGoldThreshold}
                    onChange={(e) => setLoyaltyGoldThreshold(Number(e.target.value))}
                    className={inputCls}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-foreground/80 mb-1">
                    <Award className="inline-block w-3.5 h-3.5 mr-1 text-slate-400" />{t('loyaltySettings.silverMultiplier')}
                  </label>
                  <input
                    type="number"
                    min={1.0}
                    max={5.0}
                    step={0.1}
                    value={loyaltySilverMultiplier}
                    onChange={(e) => setLoyaltySilverMultiplier(Number(e.target.value))}
                    className={inputCls}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-foreground/80 mb-1">
                    <Award className="inline-block w-3.5 h-3.5 mr-1 text-amber-400" />{t('loyaltySettings.goldMultiplier')}
                  </label>
                  <input
                    type="number"
                    min={1.0}
                    max={5.0}
                    step={0.1}
                    value={loyaltyGoldMultiplier}
                    onChange={(e) => setLoyaltyGoldMultiplier(Number(e.target.value))}
                    className={inputCls}
                  />
                </div>
              </div>
              {loyaltySilverThreshold >= loyaltyGoldThreshold && (
                <p className="text-xs text-red-500 mt-2">
                  {t('loyaltySettings.silverMustBeLower')}
                </p>
              )}
            </div>

            {/* Happy Hour */}
            <div className="pt-4 border-t border-white/5">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <p className="font-bold text-foreground">{t('loyaltySettings.happyHour')}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {t('loyaltySettings.happyHourDesc')}
                  </p>
                </div>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    className="sr-only peer"
                    checked={happyHourEnable}
                    onChange={(e) => setHappyHourEnable(e.target.checked)}
                  />
                  <div className="w-11 h-6 bg-zinc-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-accent"></div>
                </label>
              </div>

              {happyHourEnable && (
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-foreground/80 mb-1">
                      {t('loyaltySettings.happyHourStart')}
                    </label>
                    <input
                      type="time"
                      value={happyHourStartTime}
                      onChange={(e) => setHappyHourStartTime(e.target.value)}
                      className={inputCls}
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-foreground/80 mb-1">
                      {t('loyaltySettings.happyHourEnd')}
                    </label>
                    <input
                      type="time"
                      value={happyHourEndTime}
                      onChange={(e) => setHappyHourEndTime(e.target.value)}
                      className={inputCls}
                    />
                    <p className="text-[10px] text-muted-foreground mt-1">
                      {t('loyaltySettings.happyHourEndDesc')}
                    </p>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-foreground/80 mb-1">
                      {t('loyaltySettings.happyHourMultiplier')}
                    </label>
                    <input
                      type="number"
                      min={1.0}
                      max={10.0}
                      step={0.1}
                      value={happyHourMultiplier}
                      onChange={(e) => setHappyHourMultiplier(Number(e.target.value))}
                      className={inputCls}
                    />
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {paymentsEnabled && (
          <div className="pt-4 border-t border-white/5">
            <div className="flex items-center justify-between">
              <div>
                <p className="font-bold text-foreground">
                  Payment Notifications
                </p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  When enabled, all staff see payment notifications. When disabled, only the owner sees them.
                </p>
              </div>
              <label className="relative inline-flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  className="sr-only peer"
                  checked={notifyAllStaffOnPayment}
                  onChange={(e) => setNotifyAllStaffOnPayment(e.target.checked)}
                />
                <div className="w-11 h-6 bg-zinc-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-accent"></div>
              </label>
            </div>
          </div>
        )}
      </div>
    </>
  );
};

export default LoyaltySettingsTab;
