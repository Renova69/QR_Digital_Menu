import { QrCode, Plus, Monitor, Languages, LucideIcon } from "lucide-react";
import { useTranslation } from "react-i18next";

interface QuickActionsRowProps {
  restaurantId?: string;
}

interface QuickAction {
  label: string;
  Icon: LucideIcon;
  href: string;
  external?: boolean;
}

const QuickActionsRow = ({ restaurantId }: QuickActionsRowProps) => {
  const { t } = useTranslation();

  const actions: QuickAction[] = [
    { label: t('dashboard.generateQr', 'Generate QR'), Icon: QrCode, href: `/menu/public/${restaurantId}?table=1`, external: true },
    { label: t('dashboard.addItem', 'Add Item'), Icon: Plus, href: '/dashboard/menu' },
    { label: t('dashboard.openPos', 'Open POS'), Icon: Monitor, href: '/staff/pos' },
    { label: t('dashboard.translateMenu', 'Translate'), Icon: Languages, href: '/dashboard/settings' },
  ];

  return (
    <div className="glass-panel rounded-[1.5rem] p-5">
      <h3 className="text-xs font-bold uppercase tracking-widest text-muted-foreground mb-3">
        {t('dashboard.quickActions', 'Quick Actions')}
      </h3>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {actions.map(({ label, Icon, href, external }) => (
          <a
            key={label}
            href={href}
            target={external ? '_blank' : undefined}
            rel="noopener noreferrer"
            className="flex flex-col items-center gap-2 p-4 rounded-xl bg-secondary/50 hover:bg-secondary transition-all text-center group"
          >
            <div className="w-9 h-9 rounded-xl flex items-center justify-center bg-primary/10 border border-primary/15 group-hover:scale-110 transition-transform">
              <Icon className="w-4 h-4 text-primary" />
            </div>
            <span className="text-xs font-semibold text-foreground">{label}</span>
          </a>
        ))}
      </div>
    </div>
  );
};

export default QuickActionsRow;
