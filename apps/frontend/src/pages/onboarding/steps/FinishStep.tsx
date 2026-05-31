import { Rocket } from 'lucide-react';
import { useTranslation } from 'react-i18next';

interface Props {
  restaurantName: string;
  onDone: () => void;
}

export default function FinishStep({ restaurantName, onDone }: Props) {
  const { t } = useTranslation();

  const tips = [
    t('onboarding.finish.tipCategories'),
    t('onboarding.finish.tipQrCodes'),
    t('onboarding.finish.tipStaff'),
    t('onboarding.finish.tipBranding'),
  ];

  return (
    <div className="flex flex-col items-center gap-6 py-12 text-center max-w-md mx-auto">
      <div className="w-20 h-20 rounded-full bg-primary/10 flex items-center justify-center">
        <Rocket className="w-10 h-10 text-primary" />
      </div>
      <div className="space-y-2">
        <h2 className="text-3xl font-display font-bold text-foreground">{t('onboarding.finish.title')}</h2>
        <p className="text-muted-foreground">
          {t('onboarding.finish.subtitle', { restaurantName })}
        </p>
      </div>
      <div className="space-y-2 text-sm text-muted-foreground">
        <p>{t('onboarding.finish.nextSteps')}</p>
        <ul className="space-y-1 text-left list-none">
          {tips.map((tip) => (
            <li key={tip} className="flex items-center gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-primary shrink-0" />
              {tip}
            </li>
          ))}
        </ul>
      </div>
      <button
        onClick={onDone}
        className="mt-4 px-8 py-3 rounded-xl bg-primary text-primary-foreground text-sm font-bold hover:bg-primary/90 transition-all shadow-lg hover:shadow-primary/30"
      >
        {t('onboarding.finish.cta')}
      </button>
    </div>
  );
}
