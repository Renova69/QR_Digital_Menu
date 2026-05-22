import { useState } from "react";
import { Outlet, NavLink } from "react-router-dom";
import { LayoutDashboard, Building2, LogOut, Menu, X, ShieldCheck, Shield, MessageCircleQuestion } from "lucide-react";
import { useAuth } from "../../context/AuthContext";

const NAV_ITEMS = [
  { to: "/super-admin", icon: LayoutDashboard, label: "Overview", end: true },
  { to: "/super-admin/tenants", icon: Building2, label: "Tenants" },
  { to: "/super-admin/legal", icon: ShieldCheck, label: "Legal & GDPR" },
  { to: "/super-admin/help", icon: MessageCircleQuestion, label: "Help Center" },
];

function SidebarContent({ onClose }: { onClose: () => void }) {
  const { user, logout } = useAuth();

  return (
    <aside className="w-64 bg-[#0d1117] flex flex-col h-full border-r border-slate-800/60">
      {/* Brand */}
      <div className="px-5 py-5 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-emerald-500/15 border border-emerald-500/25 flex items-center justify-center shrink-0">
            <Shield className="w-4 h-4 text-emerald-400" />
          </div>
          <div>
            <p className="text-sm font-bold text-white leading-none tracking-tight">QR Menu Admin</p>
            <p className="text-[10px] text-slate-500 mt-0.5 uppercase tracking-widest font-medium">Platform Control</p>
          </div>
        </div>
        <button
          onClick={onClose}
          className="md:hidden text-slate-500 hover:text-white transition-colors p-1 rounded"
          aria-label="Close sidebar"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      <div className="mx-4 h-px bg-slate-800/60" />

      {/* Nav */}
      <nav className="flex-1 p-3 pt-4 space-y-0.5">
        {NAV_ITEMS.map(({ to, icon: Icon, label, end }) => (
          <NavLink
            key={to}
            to={to}
            end={end}
            onClick={onClose}
            className={({ isActive }) =>
              `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-150 border ${
                isActive
                  ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20"
                  : "text-slate-400 hover:bg-slate-800/60 hover:text-slate-200 border-transparent"
              }`
            }
          >
            <Icon className="w-4 h-4 shrink-0" />
            {label}
          </NavLink>
        ))}
      </nav>

      {/* User footer */}
      <div className="p-4 border-t border-slate-800/60">
        <div className="flex items-center gap-3 mb-3 min-w-0">
          <div className="w-7 h-7 rounded-full bg-slate-800 border border-slate-700 flex items-center justify-center shrink-0">
            <span className="text-xs font-bold text-slate-300">
              {user?.name?.[0]?.toUpperCase() ?? user?.email?.[0]?.toUpperCase() ?? "A"}
            </span>
          </div>
          <div className="min-w-0">
            {user?.name && (
              <p className="text-xs font-semibold text-slate-200 truncate leading-none mb-0.5">{user.name}</p>
            )}
            {user?.email && (
              <p className="text-[10px] text-slate-500 truncate">{user.email}</p>
            )}
          </div>
        </div>
        <button
          onClick={logout}
          className="flex items-center gap-2 text-xs text-slate-500 hover:text-slate-300 transition-colors"
        >
          <LogOut className="w-3.5 h-3.5" />
          Sign out
        </button>
      </div>
    </aside>
  );
}

export default function SuperAdminLayout() {
  const [sidebarOpen, setSidebarOpen] = useState(false);

  return (
    <div className="flex min-h-screen bg-slate-950">
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
        <div className="md:hidden flex items-center gap-3 px-4 py-3 bg-[#0d1117] border-b border-slate-800/60">
          <button
            onClick={() => setSidebarOpen(true)}
            aria-label="Open sidebar"
            className="text-slate-400 hover:text-white transition-colors p-1 rounded"
          >
            <Menu className="w-5 h-5" />
          </button>
          <div className="flex items-center gap-2">
            <Shield className="w-4 h-4 text-emerald-400" />
            <span className="text-sm font-bold text-white">QR Menu Admin</span>
          </div>
        </div>

        <main className="flex-1 bg-slate-950 overflow-auto">
          <div className="p-6 max-w-6xl mx-auto">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
}
