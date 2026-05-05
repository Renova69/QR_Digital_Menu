import React from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
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
  const { i18n } = useTranslation();

  if (location.pathname.startsWith('/menu/public')) {
    return null;
  }

  const handleLogout = () => {
    logout();
    navigate('/');
  };

  return (
    <div className="fixed top-0 left-0 right-0 z-50 pt-4 px-4 sm:px-6 pointer-events-none">
      <header className="max-w-5xl mx-auto glass-panel rounded-2xl pointer-events-auto border-white/5 shadow-2xl">
        <nav className="px-5 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          {/* Logo */}
          <Link to="/" className="flex items-center gap-2 text-foreground font-serif font-black text-xl tracking-tight hover:text-accent transition-colors duration-200 uppercase">
             QR SaaS
          </Link>

          {/* Nav links */}
          <div className="flex items-center gap-4 sm:gap-6">
            <ThemeToggle />
            {user && (
              <select
                value={i18n.language?.slice(0, 2) ?? 'bg'}
                onChange={(e) => void i18n.changeLanguage(e.target.value)}
                aria-label="Dashboard language"
                className="bg-transparent text-foreground text-xs font-bold uppercase tracking-widest border border-border rounded-lg px-2 py-1 cursor-pointer focus:outline-none focus:ring-2 focus:ring-accent/50"
              >
                {DASHBOARD_LANGUAGES.map((l) => (
                  <option key={l.code} value={l.code}>{l.label}</option>
                ))}
              </select>
            )}
            {user ? (
              <>
                <Link
                  to="/dashboard"
                  className="text-muted-foreground hover:text-foreground text-xs font-bold uppercase tracking-widest transition-colors duration-200"
                >
                  Dashboard
                </Link>
                <button
                  onClick={handleLogout}
                  className="text-foreground text-xs font-bold uppercase tracking-widest hover:text-red-500 transition-colors cursor-pointer"
                >
                  Logout
                </button>
              </>
            ) : (
              <>
                <Link
                  to="/login"
                  className="text-muted-foreground hover:text-foreground text-xs font-bold uppercase tracking-widest transition-colors duration-200"
                >
                  Login
                </Link>
                <Link
                  to="/register"
                  className="bg-accent text-accent-foreground text-[10px] font-black uppercase tracking-widest px-5 py-2.5 rounded-xl transition-all shadow-lg hover:shadow-accent/20 hover:-translate-y-0.5"
                >
                  Get Started
                </Link>
              </>
            )}
          </div>
        </nav>
      </header>
    </div>
  );
};

export default Header;
