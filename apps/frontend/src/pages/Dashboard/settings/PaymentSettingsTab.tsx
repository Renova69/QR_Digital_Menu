import React, { useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "../../../components/ui/button";
import { generateStripeConnectLink, disconnectStripe } from "../../../lib/api";

interface PaymentSettingsTabProps {
  activeRestaurant: any;
  paymentsEnabled: boolean;
  setPaymentsEnabled: (v: boolean) => void;
  tipsEnabled: boolean;
  setTipsEnabled: (v: boolean) => void;
  tipOptions: number[];
  setTipOptions: React.Dispatch<React.SetStateAction<number[]>>;
  stripeOnboarded: boolean;
  setStripeOnboarded: (v: boolean) => void;
  onSave: () => Promise<void>;
  saving: boolean;
}

const PaymentSettingsTab: React.FC<PaymentSettingsTabProps> = ({
  activeRestaurant,
  paymentsEnabled,
  setPaymentsEnabled,
  tipsEnabled,
  setTipsEnabled,
  tipOptions,
  setTipOptions,
  stripeOnboarded,
  setStripeOnboarded,
  onSave,
  saving,
}) => {
  const { t } = useTranslation();
  const [stripeLoading, setStripeLoading] = useState(false);
  const [newTipOption, setNewTipOption] = useState('');

  return (
    <div className="space-y-6">
      {/* Enable payments toggle */}
      <div className="p-4 border border-border rounded-lg space-y-2">
        <div className="flex items-center justify-between">
          <div>
            <p className="font-medium">{t('payment.settings.acceptPayments')}</p>
            <p className="text-sm text-muted-foreground">{t('payment.settings.acceptPaymentsDesc')}</p>
          </div>
          <button
            type="button"
            onClick={() => setPaymentsEnabled(!paymentsEnabled)}
            className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${paymentsEnabled ? 'bg-primary' : 'bg-muted'}`}
            role="switch"
            aria-checked={paymentsEnabled}
          >
            <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${paymentsEnabled ? 'translate-x-6' : 'translate-x-1'}`} />
          </button>
        </div>
        {paymentsEnabled && !stripeOnboarded && (
          <p className="text-sm text-amber-600 bg-amber-50 dark:bg-amber-950 p-2 rounded">
            {t('payment.settings.connectStripeWarning')}
          </p>
        )}
      </div>

      {/* Stripe Connect — only shown when payments are enabled */}
      {paymentsEnabled && <div className="p-4 border border-border rounded-lg space-y-3">
        <p className="font-medium">{t('payment.settings.stripeConnect')}</p>
        {stripeOnboarded ? (
          <div className="flex items-center justify-between">
            <span className="text-sm text-green-600 font-medium">✓ {t('payment.settings.stripeConnected')}</span>
            <button
              type="button"
              onClick={async () => {
                if (!activeRestaurant?.id) return;
                if (!window.confirm(t('payment.settings.disconnectConfirm'))) return;
                await disconnectStripe(activeRestaurant.id);
                setStripeOnboarded(false);
              }}
              className="text-sm text-red-500 hover:underline"
            >
              {t('payment.settings.disconnect')}
            </button>
          </div>
        ) : (
          <Button
            variant="outline"
            type="button"
            disabled={stripeLoading}
            onClick={async () => {
              if (!activeRestaurant?.id) return;
              setStripeLoading(true);
              try {
                const { url } = await generateStripeConnectLink(activeRestaurant.id);
                window.location.href = url;
              } catch {
                setStripeLoading(false);
              }
            }}
          >
            {stripeLoading ? t('payment.settings.connecting') : t('payment.settings.connectStripe')}
          </Button>
        )}
      </div>}

      {/* Tips */}
      {paymentsEnabled && (
        <div className="p-4 border border-border rounded-lg space-y-3">
          <div className="flex items-center justify-between">
            <p className="font-medium">{t('payment.settings.tips')}</p>
            <button
              type="button"
              onClick={() => setTipsEnabled(!tipsEnabled)}
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${tipsEnabled ? 'bg-primary' : 'bg-muted'}`}
              role="switch"
              aria-checked={tipsEnabled}
            >
              <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${tipsEnabled ? 'translate-x-6' : 'translate-x-1'}`} />
            </button>
          </div>
          {tipsEnabled && (
            <div className="space-y-2">
              <p className="text-sm text-muted-foreground">{t('payment.settings.quickTipOptions')}</p>
              <div className="flex flex-wrap gap-2">
                {tipOptions.map((pct) => (
                  <span key={pct} className="flex items-center gap-1 px-2 py-1 bg-muted rounded text-sm">
                    {pct}%
                    <button
                      type="button"
                      onClick={() => setTipOptions(tipOptions.filter((o) => o !== pct))}
                      className="text-muted-foreground hover:text-red-500 ml-1"
                      aria-label={`Remove ${pct}%`}
                    >
                      ×
                    </button>
                  </span>
                ))}
              </div>
              <div className="flex gap-2">
                <input
                  type="number"
                  min="1"
                  max="100"
                  value={newTipOption}
                  onChange={(e) => setNewTipOption(e.target.value)}
                  placeholder="e.g. 15"
                  className="w-24 px-2 py-1 border border-border rounded text-sm bg-background"
                />
                <Button
                  variant="outline"
                  size="sm"
                  type="button"
                  onClick={() => {
                    const v = parseInt(newTipOption);
                    if (v > 0 && v <= 100 && !tipOptions.includes(v)) {
                      setTipOptions([...tipOptions, v].sort((a, b) => a - b));
                      setNewTipOption('');
                    }
                  }}
                >
                  {t('payment.settings.addTipOption')}
                </Button>
              </div>
            </div>
          )}
        </div>
      )}

      <Button type="button" onClick={onSave} disabled={saving}>
        {saving ? t('settings.saving') : t('settings.saveSettings')}
      </Button>
    </div>
  );
};

export default PaymentSettingsTab;
