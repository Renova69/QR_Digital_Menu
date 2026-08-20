import {
  Plus,
  Monitor,
  Languages,
  LucideIcon,
  ExternalLink,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import { buildMenuReturnUrl } from "../../../lib/menuUrl";

interface QuickActionsRowProps {
  restaurantId: string;
  restaurantSlug?: string | null;
}

interface QuickAction {
  label: string;
  description: string;
  Icon: LucideIcon;
  href: string;
  external?: boolean;
  colorClass: string;
  bgClass: string;
}

const QuickActionsRow = ({
  restaurantId,
  restaurantSlug,
}: QuickActionsRowProps) => {
  const { t } = useTranslation();

  const actions: QuickAction[] = [
    {
      label: t("dashboard.viewMenu", "View Menu"),
      description: t("dashboard.viewMenuDesc", "Public digital menu"),
      Icon: ExternalLink,
      href: buildMenuReturnUrl(restaurantId, "1", null, restaurantSlug),
      external: true,
      colorClass: "text-blue-500",
      bgClass: "bg-blue-500/10 border-blue-500/15",
    },
    {
      label: t("dashboard.addItem", "Add Item"),
      description: t("dashboard.addItemDesc", "Update your catalog"),
      Icon: Plus,
      href: "/dashboard/menu",
      colorClass: "text-emerald-500",
      bgClass: "bg-emerald-500/10 border-emerald-500/15",
    },
    {
      label: t("dashboard.openPos", "Open POS"),
      description: t("dashboard.openPosDesc", "Manage live orders"),
      Icon: Monitor,
      href: "/staff/pos",
      colorClass: "text-violet-500",
      bgClass: "bg-violet-500/10 border-violet-500/15",
    },
    {
      label: t("dashboard.translateMenu", "Translate"),
      description: t("dashboard.translateDesc", "Manage languages"),
      Icon: Languages,
      href: "/dashboard?tab=settings",
      colorClass: "text-amber-500",
      bgClass: "bg-amber-500/10 border-amber-500/15",
    },
  ];

  return (
    <div className="glass-panel rounded-[1.5rem] p-4 sm:p-5">
      <h3 className="text-xs font-bold uppercase tracking-widest text-muted-foreground mb-3">
        {t("dashboard.quickActions", "Quick Actions")}
      </h3>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {actions.map(
          ({
            label,
            description,
            Icon,
            href,
            external,
            colorClass,
            bgClass,
          }) => {
            const content = (
              <>
                <div
                  className={`w-9 h-9 rounded-xl flex items-center justify-center border ${bgClass} group-hover:scale-110 transition-transform`}
                >
                  <Icon className={`w-4 h-4 ${colorClass}`} />
                </div>
                <div className="flex flex-col items-center mt-1.5">
                  <span className="text-xs font-semibold text-foreground leading-tight">
                    {label}
                  </span>
                  <span className="text-[10px] text-muted-foreground font-medium mt-0.5">
                    {description}
                  </span>
                </div>
              </>
            );

            const className =
              "flex flex-col items-center gap-1 p-3 rounded-xl bg-secondary/50 hover:bg-secondary transition-colors text-center group cursor-pointer";

            return external ? (
              <a
                key={label}
                href={href}
                target="_blank"
                rel="noopener noreferrer"
                className={className}
              >
                {content}
              </a>
            ) : (
              <Link key={label} to={href} className={className}>
                {content}
              </Link>
            );
          },
        )}
      </div>
    </div>
  );
};

export default QuickActionsRow;
