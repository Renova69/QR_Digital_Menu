import { useEffect } from "react";
import { Outlet } from "react-router-dom";
import { useTranslation } from "react-i18next";

export default function PosLayout() {
  const { i18n } = useTranslation();

  useEffect(() => {
    const prev = i18n.language;
    i18n.changeLanguage("bg");
    return () => { i18n.changeLanguage(prev); };
  }, [i18n]);

  return (
    <div className="h-dvh flex flex-col text-foreground" style={{ background: 'hsl(245 40% 7%)' }}>
      <Outlet />
    </div>
  );
}
