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

  // Force dark class on html element while POS is mounted. POS uses a dark
  // background (hsl(245 40% 7%)) — components must render dark variant to be
  // readable. The user can toggle with the theme button in PosTopBar.
  useEffect(() => {
    const root = document.documentElement;
    const hadDark = root.classList.contains("dark");
    if (!hadDark) root.classList.add("dark");
    return () => {
      if (!hadDark) root.classList.remove("dark");
    };
  }, []);

  return (
    <div className="h-dvh flex flex-col text-foreground bg-[hsl(245_40%_7%)]">
      <Outlet />
    </div>
  );
}
