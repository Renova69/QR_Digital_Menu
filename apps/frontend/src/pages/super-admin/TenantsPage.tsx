import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { getSuperAdminTenants } from "../../lib/api";
import { Search } from "lucide-react";
import { useDebouncedValue } from "../../hooks/useDebouncedValue";

const PAGE_SIZE = 20;

export default function TenantsPage() {
  const navigate = useNavigate();
  const [page, setPage] = useState(1);
  const [searchInput, setSearchInput] = useState("");
  const [tierFilter, setTierFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");

  const search = useDebouncedValue(searchInput, 300);

  const { data, isLoading, isError } = useQuery({
    queryKey: ["super-admin", "tenants", page, search, tierFilter, statusFilter],
    queryFn: () =>
      getSuperAdminTenants({
        page,
        limit: PAGE_SIZE,
        ...(search && { search }),
        ...(tierFilter && { tier: tierFilter }),
        ...(statusFilter && { status: statusFilter }),
      }),
    staleTime: 30_000,
  });

  const totalPages = data ? Math.ceil(data.meta.total / PAGE_SIZE) : 0;

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold">Tenants</h2>

      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input
            type="text"
            placeholder="Search by name or email..."
            value={searchInput}
            onChange={(e) => {
              setSearchInput(e.target.value);
              setPage(1);
            }}
            className="w-full pl-9 pr-3 py-2 rounded-lg border border-border bg-background text-sm"
          />
        </div>

        <select
          value={tierFilter}
          onChange={(e) => { setTierFilter(e.target.value); setPage(1); }}
          className="px-3 py-2 rounded-lg border border-border bg-background text-sm"
        >
          <option value="">All Tiers</option>
          <option value="FREE">FREE</option>
          <option value="STARTER">STARTER</option>
          <option value="PROFESSIONAL">PROFESSIONAL</option>
          <option value="ENTERPRISE">ENTERPRISE</option>
        </select>

        <select
          value={statusFilter}
          onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}
          className="px-3 py-2 rounded-lg border border-border bg-background text-sm"
        >
          <option value="">All Status</option>
          <option value="active">Active</option>
          <option value="suspended">Suspended</option>
          <option value="deleted">Deleted</option>
        </select>
      </div>

      {/* Table */}
      {isLoading ? (
        <div className="space-y-3">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="h-12 rounded-lg glass-panel animate-pulse" />
          ))}
        </div>
      ) : isError ? (
        <p className="text-muted-foreground text-center py-8">Failed to load tenants.</p>
      ) : (
        <>
          <div className="glass-panel rounded-xl overflow-hidden">
            <table className="w-full">
              <thead>
                <tr className="border-b border-border">
                  <th className="text-left px-4 py-3 text-sm font-medium text-muted-foreground">Name</th>
                  <th className="text-left px-4 py-3 text-sm font-medium text-muted-foreground">Owner</th>
                  <th className="text-left px-4 py-3 text-sm font-medium text-muted-foreground">Tier</th>
                  <th className="text-left px-4 py-3 text-sm font-medium text-muted-foreground">Override</th>
                  <th className="text-left px-4 py-3 text-sm font-medium text-muted-foreground">Stripe</th>
                  <th className="text-left px-4 py-3 text-sm font-medium text-muted-foreground">Status</th>
                </tr>
              </thead>
              <tbody>
                {(data?.data ?? []).map((t) => (
                  <tr
                    key={t.id}
                    onClick={() => navigate(`/super-admin/tenants/${t.id}`)}
                    className="border-b border-border/50 hover:bg-accent/5 cursor-pointer transition-colors"
                  >
                    <td className="px-4 py-3 text-sm font-medium">{t.name}</td>
                    <td className="px-4 py-3 text-sm text-muted-foreground">{t.owner.email}</td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex px-2 py-0.5 rounded text-xs font-medium ${
                        t.tier === 'ENTERPRISE' ? 'bg-violet-500/10 text-violet-500' :
                        t.tier === 'PROFESSIONAL' ? 'bg-accent/10 text-accent' :
                        t.tier === 'STARTER' ? 'bg-green-500/10 text-green-500' :
                        'bg-muted text-muted-foreground'
                      }`}>
                        {t.tier}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      {t.forceTier ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium bg-amber-500/10 text-amber-500">
                          {t.forceTier}
                        </span>
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`text-xs ${t.stripeOnboarded ? 'text-green-500' : 'text-muted-foreground'}`}>
                        {t.stripeOnboarded ? 'Connected' : '—'}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      {t.deletedAt ? (
                        <span className="inline-flex px-2 py-0.5 rounded text-xs font-medium bg-slate-500/10 text-slate-500">
                          Deleted
                        </span>
                      ) : (
                        <span className={`inline-flex px-2 py-0.5 rounded text-xs font-medium ${
                          t.isActive ? 'bg-green-500/10 text-green-500' : 'bg-red-500/10 text-red-500'
                        }`}>
                          {t.isActive ? 'Active' : 'Suspended'}
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-center gap-2">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page === 1}
                className="px-3 py-1.5 rounded-lg text-sm border border-border disabled:opacity-40"
              >
                Previous
              </button>
              <span className="text-sm text-muted-foreground">
                Page {page} of {totalPages}
              </span>
              <button
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page === totalPages}
                className="px-3 py-1.5 rounded-lg text-sm border border-border disabled:opacity-40"
              >
                Next
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
