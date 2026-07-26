import { useState } from "react";
import { Outlet, NavLink } from "react-router-dom";
import {
  LayoutDashboard,
  Building2,
  LogOut,
  Menu,
  X,
  ShieldCheck,
  MessageCircleQuestion,
  TrendingUp,
  FileText,
} from "lucide-react";
import { useAuth } from "../../context/AuthContext";
import { useTranslation } from "react-i18next";
import { RenovaMark } from "../../components/brand/RenovaBrand";

const NAV_ITEMS = [
  { to: "/super-admin", icon: LayoutDashboard, label: "Overview", end: true },
  { to: "/super-admin/tenants", icon: Building2, label: "Tenants" },
  { to: "/super-admin/revenue", icon: TrendingUp, label: "Revenue" },
  { to: "/super-admin/data-requests", icon: FileText, label: "Data Requests" },
  { to: "/super-admin/legal", icon: ShieldCheck, label: "Legal & GDPR" },
  {
    to: "/super-admin/help",
    icon: MessageCircleQuestion,
    label: "Help Center",
  },
];

function SidebarContent({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation();
  const { user, logout } = useAuth();

  return (
    <aside
      className="w-64 flex flex-col h-full border-r border-white/10"
      style={{ background: "hsl(248 38% 9%)" }}
    >
      {/* Danger accent bar */}
      <div
        className="h-1 w-full shrink-0"
        style={{
          background:
            "linear-gradient(90deg, hsl(0 80% 55%) 0%, hsl(25 90% 55%) 100%)",
        }}
      />

      {/* Brand */}
      <div className="px-5 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <RenovaMark className="h-8 w-8 shrink-0" inverse />
          <div>
            <p className="text-sm font-bold text-white leading-none tracking-tight">
              {t("auto.qRMenuAdmin", "Renova Admin")}
            </p>
            <p className="text-[10px] text-white/40 mt-0.5 uppercase tracking-widest font-medium">
              {t("auto.platformControl", "Platform Control")}
            </p>
          </div>
        </div>
        <button
          onClick={onClose}
          className="md:hidden text-white/40 hover:text-white transition-colors p-1 rounded"
          aria-label="Close sidebar"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      <div className="mx-4 h-px bg-white/10" />

      {/* Nav */}
      <nav className="flex-1 p-3 pt-4 space-y-0.5">
        {NAV_ITEMS.map(({ to, icon: Icon, label, end }) => (
          <NavLink
            key={to}
            to={to}
            end={end}
            onClick={onClose}
            className={({ isActive }) =>
              `flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-150 ${
                isActive
                  ? "text-white"
                  : "text-white/50 hover:bg-white/5 hover:text-white/80"
              }`
            }
            style={({ isActive }) =>
              isActive
                ? {
                    background: "var(--gradient-brand-soft)",
                    color: "#5ee7ca",
                  }
                : {}
            }
          >
            <Icon className="w-4 h-4 shrink-0" />
            {label}
          </NavLink>
        ))}
      </nav>

      {/* User footer */}
      <div className="p-4 border-t border-white/10">
        <div className="flex items-center gap-3 mb-3 min-w-0">
          <div
            className="w-7 h-7 rounded-full border border-white/20 flex items-center justify-center shrink-0"
            style={{ background: "var(--gradient-brand-soft)" }}
          >
            <span className="text-xs font-bold text-white/80">
              {user?.name?.[0]?.toUpperCase() ??
                user?.email?.[0]?.toUpperCase() ??
                "A"}
            </span>
          </div>
          <div className="min-w-0">
            {user?.name && (
              <p className="text-xs font-semibold text-white/80 truncate leading-none mb-0.5">
                {user.name}
              </p>
            )}
            {user?.email && (
              <p className="text-[10px] text-white/40 truncate">{user.email}</p>
            )}
          </div>
        </div>
        <button
          onClick={logout}
          className="flex items-center gap-2 text-xs text-white/40 hover:text-white/70 transition-colors"
        >
          <LogOut className="w-3.5 h-3.5" />
          {t("auto.signOut", "Sign out")}
        </button>
      </div>
    </aside>
  );
}

export default function SuperAdminLayout() {
  const { t } = useTranslation();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  return (
    <div
      className="flex min-h-screen"
      style={{ background: "hsl(245 40% 7%)" }}
    >
      {/* Mobile overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black/70 z-20 md:hidden backdrop-blur-sm"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <div
        className={`fixed inset-y-0 left-0 z-30 md:static md:z-auto md:flex md:shrink-0 transition-transform duration-200 ${
          sidebarOpen ? "translate-x-0" : "-translate-x-full md:translate-x-0"
        }`}
      >
        <SidebarContent onClose={() => setSidebarOpen(false)} />
      </div>

      {/* Main */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Mobile topbar */}
        <div
          className="md:hidden flex items-center gap-3 px-4 py-3 border-b border-white/10"
          style={{ background: "hsl(248 35% 10%)" }}
        >
          <button
            onClick={() => setSidebarOpen(true)}
            aria-label="Open sidebar"
            className="text-white/40 hover:text-white transition-colors p-1 rounded"
          >
            <Menu className="w-5 h-5" />
          </button>
          <div className="flex items-center gap-2">
            <RenovaMark className="h-5 w-5" inverse />
            <span className="text-sm font-bold text-white">
              {t("auto.qRMenuAdmin", "Renova Admin")}
            </span>
          </div>
        </div>

        <main
          className="flex-1 overflow-auto"
          style={{ background: "hsl(245 40% 8%)" }}
        >
          <div className="p-6 max-w-6xl mx-auto">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
}
