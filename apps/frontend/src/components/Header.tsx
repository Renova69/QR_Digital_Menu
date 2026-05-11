import React from 'react';
import { Link, useNavigate, useLocation, useSearchParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useTranslation } from 'react-i18next';
import { ThemeToggle } from './ui/ThemeToggle';

const DASHBOARD_LANGUAGES = [
  { code: 'bg', label: 'BG' },
  { code: 'en', label: 'EN' },
  { code: 'ro', label: 'RO' },
];

const Header: React.FC = () => {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const { i18n, t } = useTranslation();

  if (location.pathname.startsWith('/menu/public')) {
    return null;
  }

  const isProfile = location.pathname === '/profile';
  const returnTo = searchParams.get('returnTo');

  const handleLogout = () => {
    const isCustomer = user?.role === 'CUSTOMER';
    const menuUrl = isCustomer ? localStorage.getItem('customerMenuUrl') : null;
    logout();
    localStorage.removeItem('customerMenuUrl');
    navigate(menuUrl || '/');
  };

  const pill = "h-9 flex items-center px-3 rounded-xl border border-border/50 bg-secondary/50 hover:bg-secondary text-xs font-bold uppercase tracking-widest text-foreground transition-all cursor-pointer";
  const pillMuted = `${pill} text-muted-foreground hover:text-foreground`;

  return (
    <div className="fixed top-0 left-0 right-0 z-50 pt-4 px-4 sm:px-6 pointer-events-none">
      <header className="max-w-5xl mx-auto glass-panel rounded-2xl pointer-events-auto border-white/5 shadow-2xl">
        <nav className="px-4 sm:px-6 h-14 flex items-center justify-center gap-2">
          <ThemeToggle size="sm" />

          {user && (
            <select
              value={i18n.language?.slice(0, 2) ?? 'bg'}
              onChange={(e) => void i18n.changeLanguage(e.target.value)}
              aria-label="Dashboard language"
              className={pill}
            >
              {DASHBOARD_LANGUAGES.map((l) => (
                <option key={l.code} value={l.code}>{l.label}</option>
              ))}
            </select>
          )}

          {user ? (
            <>
              {isProfile ? (
                returnTo && (
                  <Link to={returnTo} className={pillMuted}>
                    ← {t('nav.menu', 'Menu')}
                  </Link>
                )
              ) : (
                <Link to="/dashboard" className={pillMuted}>
                  {t('nav.dashboard')}
                </Link>
              )}
              <button onClick={handleLogout} className={`${pill} hover:border-red-500/50 hover:text-red-500 hover:bg-red-500/5`}>
                {t('nav.logout')}
              </button>
            </>
          ) : (
            <>
              <Link to="/login" className={pillMuted}>
                {t('nav.login')}
              </Link>
              <Link
                to="/register"
                className="h-9 flex items-center bg-accent text-accent-foreground text-[10px] font-black uppercase tracking-widest px-4 rounded-xl transition-all shadow-lg hover:shadow-accent/20 hover:-translate-y-0.5"
              >
                {t('nav.getStarted')}
              </Link>
            </>
          )}
        </nav>
      </header>
    </div>
  );
};

export default Header;
