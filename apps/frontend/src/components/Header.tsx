import React, { useState } from "react";
import {
  Link,
  useNavigate,
  useLocation,
  useSearchParams,
} from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { useTranslation } from "react-i18next";
import { ThemeToggle } from "./ui/ThemeToggle";
import { QrCode, Menu, X } from "lucide-react";

const DASHBOARD_LANGUAGES = [
  { code: "bg", label: "BG" },
  { code: "en", label: "EN" },
  { code: "ro", label: "RO" },
];

const Header: React.FC = () => {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const { i18n, t } = useTranslation();
  const [mobileOpen, setMobileOpen] = useState(false);

  if (location.pathname.startsWith("/menu/public")) return null;
  if (location.pathname.startsWith("/dashboard")) return null;
  if (location.pathname.startsWith("/staff")) return null;
  if (location.pathname.startsWith("/super-admin")) return null;

  const isProfile = location.pathname === "/profile";
  const returnTo = searchParams.get("returnTo");

  const handleLogout = () => {
    const isCustomer = user?.role === "CUSTOMER";
    const menuUrl = isCustomer ? localStorage.getItem("customerMenuUrl") : null;
    logout();
    localStorage.removeItem("customerMenuUrl");
    navigate(menuUrl || "/");
    setMobileOpen(false);
  };

  return (
    <div className="fixed top-0 left-0 right-0 z-50 px-4 sm:px-6 pt-4 pointer-events-none">
      <header className="max-w-7xl mx-auto glass-panel rounded-2xl pointer-events-auto shadow-xl">
        <nav className="px-5 h-14 flex items-center justify-between gap-4">
          {/* Wordmark */}
          <Link to="/" className="flex items-center gap-2 shrink-0">
            <div
              className="w-7 h-7 rounded-lg flex items-center justify-center"
              style={{ background: "var(--gradient-brand)" }}
            >
              <QrCode className="w-4 h-4 text-white" />
            </div>
            <span className="text-sm font-display font-bold tracking-tight brand-gradient-text">
              {t("auto.qRMENU", "QR MENU")}
            </span>
          </Link>

          {/* Center nav (desktop) */}
          <div className="hidden md:flex items-center gap-1">
            {[
              { to: "/#features", label: t("nav.features", "Features") },
              { to: "/pricing", label: t("nav.pricing", "Pricing") },
            ].map((item) => (
              <Link
                key={item.to}
                to={item.to}
                className="px-4 h-9 flex items-center text-sm font-medium text-muted-foreground hover:text-foreground rounded-xl hover:bg-muted transition-all"
              >
                {item.label}
              </Link>
            ))}
          </div>

          {/* Right side */}
          <div className="flex items-center gap-2">
            <ThemeToggle size="sm" />

            <select
              value={i18n.language?.slice(0, 2) ?? "en"}
              onChange={(e) => void i18n.changeLanguage(e.target.value)}
              aria-label={t("publicMenu.selectLanguage") as string}
              className="hidden sm:flex h-9 items-center px-3 rounded-xl border border-border/50 bg-secondary/50 hover:bg-secondary text-xs font-bold uppercase tracking-widest text-foreground transition-all cursor-pointer"
            >
              {DASHBOARD_LANGUAGES.map((l) => (
                <option key={l.code} value={l.code}>
                  {l.label}
                </option>
              ))}
            </select>

            {user ? (
              <>
                {isProfile ? (
                  returnTo && (
                    <Link
                      to={returnTo}
                      className="hidden sm:flex h-9 items-center px-4 rounded-xl border border-border/50 bg-transparent hover:bg-muted text-xs font-bold uppercase tracking-widest text-muted-foreground transition-all"
                    >
                      ← {t("nav.menu", "Menu")}
                    </Link>
                  )
                ) : (
                  <Link
                    to="/dashboard"
                    className="hidden sm:flex h-9 items-center px-4 rounded-xl bg-secondary text-secondary-foreground text-xs font-bold uppercase tracking-widest hover:bg-secondary/80 transition-all"
                  >
                    {t("nav.dashboard")}
                  </Link>
                )}
                <button
                  onClick={handleLogout}
                  className="hidden sm:flex h-9 items-center px-4 rounded-xl border border-border/50 bg-transparent hover:border-destructive/50 hover:text-destructive hover:bg-destructive/5 text-xs font-bold uppercase tracking-widest text-muted-foreground transition-all"
                >
                  {t("nav.logout")}
                </button>
              </>
            ) : (
              <>
                <Link
                  to="/login"
                  className="hidden sm:flex h-9 items-center px-4 rounded-xl border border-border/50 bg-transparent hover:bg-muted text-xs font-bold uppercase tracking-widest text-muted-foreground transition-all"
                >
                  {t("nav.login")}
                </Link>
                <Link
                  to="/register"
                  className="h-9 flex items-center brand-cta text-[10px] font-black uppercase tracking-widest px-5 rounded-xl"
                >
                  {t("nav.getStarted", "Start Free")}
                </Link>
              </>
            )}

            {/* Mobile hamburger */}
            <button
              className="md:hidden h-9 w-9 flex items-center justify-center rounded-xl border border-border/50 hover:bg-muted transition-all"
              onClick={() => setMobileOpen(!mobileOpen)}
              aria-label="Toggle menu"
            >
              {mobileOpen ? (
                <X className="w-4 h-4" />
              ) : (
                <Menu className="w-4 h-4" />
              )}
            </button>
          </div>
        </nav>

        {/* Mobile drawer */}
        {mobileOpen && (
          <div className="md:hidden border-t border-border/30 px-4 py-4 flex flex-col gap-2">
            <Link
              to="/#features"
              onClick={() => setMobileOpen(false)}
              className="px-4 py-2.5 rounded-xl text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-muted transition-all"
            >
              {t("nav.features", "Features")}
            </Link>
            <Link
              to="/pricing"
              onClick={() => setMobileOpen(false)}
              className="px-4 py-2.5 rounded-xl text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-muted transition-all"
            >
              {t("nav.pricing", "Pricing")}
            </Link>
            {user ? (
              <>
                <Link
                  to="/dashboard"
                  onClick={() => setMobileOpen(false)}
                  className="px-4 py-2.5 rounded-xl text-sm font-medium text-muted-foreground hover:bg-muted transition-all"
                >
                  {t("nav.dashboard")}
                </Link>
                <button
                  onClick={handleLogout}
                  className="px-4 py-2.5 rounded-xl text-sm font-medium text-left text-destructive hover:bg-destructive/5 transition-all"
                >
                  {t("nav.logout")}
                </button>
              </>
            ) : (
              <>
                <Link
                  to="/login"
                  onClick={() => setMobileOpen(false)}
                  className="px-4 py-2.5 rounded-xl text-sm font-medium text-muted-foreground hover:bg-muted transition-all"
                >
                  {t("nav.login")}
                </Link>
                <Link
                  to="/register"
                  onClick={() => setMobileOpen(false)}
                  className="brand-cta text-white text-sm font-bold px-4 py-2.5 rounded-xl text-center"
                >
                  {t("nav.getStarted", "Start Free Trial")}
                </Link>
              </>
            )}
          </div>
        )}
      </header>
    </div>
  );
};

export default Header;
