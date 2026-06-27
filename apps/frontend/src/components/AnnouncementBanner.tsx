import { useState, useEffect } from "react";
import { X, Info, AlertTriangle, Wrench } from "lucide-react";
import { getPublicLegalSettings } from "../lib/api";

interface BannerSettings {
  announcementBannerEnabled: boolean;
  announcementBannerText: string | null;
  announcementBannerType: string;
}

const TYPE_STYLES = {
  info: {
    container: "bg-blue-600/90 border-blue-500/40",
    icon: Info,
    text: "text-white",
  },
  warning: {
    container: "bg-amber-500/90 border-amber-400/40",
    icon: AlertTriangle,
    text: "text-white",
  },
  maintenance: {
    container: "bg-slate-700/95 border-slate-600/40",
    icon: Wrench,
    text: "text-white",
  },
};

const DISMISS_KEY = "announcement-banner-dismissed";

export default function AnnouncementBanner() {
  const [settings, setSettings] = useState<BannerSettings | null>(null);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    getPublicLegalSettings()
      .then((s: BannerSettings) => {
        setSettings(s);
        // Reset dismissed state if banner text changed
        const key = `${DISMISS_KEY}-${s.announcementBannerText}`;
        if (localStorage.getItem(key)) setDismissed(true);
      })
      .catch(() => {});
  }, []);

  if (
    !settings?.announcementBannerEnabled ||
    !settings.announcementBannerText ||
    dismissed
  )
    return null;

  const type = settings.announcementBannerType ?? "info";
  const styles =
    TYPE_STYLES[type as keyof typeof TYPE_STYLES] ?? TYPE_STYLES.info;
  const Icon = styles.icon;

  const handleDismiss = () => {
    const key = `${DISMISS_KEY}-${settings.announcementBannerText}`;
    localStorage.setItem(key, "1");
    setDismissed(true);
  };

  return (
    <div
      className={`w-full border-b px-4 py-2.5 flex items-center gap-3 backdrop-blur-sm ${styles.container}`}
    >
      <Icon className={`h-4 w-4 shrink-0 ${styles.text}`} />
      <p className={`flex-1 text-center text-sm font-medium ${styles.text}`}>
        {settings.announcementBannerText}
      </p>
      <button
        onClick={handleDismiss}
        className={`shrink-0 rounded p-0.5 opacity-70 hover:opacity-100 transition-opacity ${styles.text}`}
        aria-label="Dismiss"
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}
