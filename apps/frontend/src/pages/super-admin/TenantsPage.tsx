import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { getSuperAdminTenants } from "../../lib/api";
import {
  Search,
  ChevronRight,
  Building2,
  CheckCircle2,
  XCircle,
  RefreshCw,
  Download,
} from "lucide-react";
import { useDebouncedValue } from "../../hooks/useDebouncedValue";
import { useTranslation } from "react-i18next";

function exportTenantsCsv(tenants: any[]) {
  const BOM = "﻿";
  const header = [
    "ID",
    "Name",
    "Tier",
    "Force Tier",
    "Active",
    "Stripe",
    "Created",
  ].join(",");
  const rows = tenants.map((t) =>
    [
      t.id,
      `"${(t.name ?? "").replace(/"/g, '""')}"`,
      t.tier,
      t.forceTier ?? "",
      t.isActive ? "Yes" : "No",
      t.stripeOnboarded ? "Yes" : "No",
      new Date(t.createdAt).toISOString().slice(0, 10),
    ].join(","),
  );
  const csv = BOM + [header, ...rows].join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `tenants-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

const PAGE_SIZE = 20;

const TIER_STYLES: Record<string, string> = {
  ENTERPRISE: "bg-violet-500/15 text-violet-400 border-violet-500/25",
  PROFESSIONAL: "bg-blue-500/15 text-blue-400 border-blue-500/25",
  STARTER: "bg-emerald-500/15 text-emerald-400 border-emerald-500/25",
  FREE: "bg-slate-700/30 text-slate-400 border-slate-700/40",
};

export default function TenantsPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [page, setPage] = useState(1);
  const [searchInput, setSearchInput] = useState("");
  const [tierFilter, setTierFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [subscriptionFilter, setSubscriptionFilter] = useState("");

  const search = useDebouncedValue(searchInput, 300);

  const { data, isLoading, isError, isFetching, refetch } = useQuery({
    queryKey: [
      "super-admin",
      "tenants",
      page,
      search,
      tierFilter,
      statusFilter,
      subscriptionFilter,
    ],
    queryFn: () =>
      getSuperAdminTenants({
        page,
        limit: PAGE_SIZE,
        ...(search && { search }),
        ...(tierFilter && { tier: tierFilter }),
        ...(statusFilter && { status: statusFilter }),
        ...(subscriptionFilter && { subscription: subscriptionFilter }),
      }),
    staleTime: 30_000,
    refetchInterval: 60_000,
  });

  const totalPages = data ? Math.ceil(data.meta.total / PAGE_SIZE) : 0;
  const totalCount = data?.meta.total ?? 0;

  return (
    <div className="space-y-6">
      {/* Page header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-white tracking-tight">
            {t("auto.tenants", "Tenants")}
          </h2>
          <p className="text-slate-500 text-sm mt-1">
            {totalCount > 0
              ? `${totalCount} restaurants on the platform`
              : "Manage all platform restaurants"}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => data?.data && exportTenantsCsv(data.data)}
            disabled={!data?.data?.length}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-slate-800 border border-slate-700 text-sm text-slate-300 hover:bg-slate-700 hover:text-white disabled:opacity-40 transition-colors"
          >
            <Download className="w-4 h-4" />
            Export CSV
          </button>
          <button
            onClick={() => refetch()}
            disabled={isFetching}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-slate-800 border border-slate-700 text-sm text-slate-300 hover:bg-slate-700 hover:text-white disabled:opacity-40 transition-colors"
          >
            <RefreshCw
              className={`w-4 h-4 ${isFetching ? "animate-spin" : ""}`}
            />
            {isFetching ? "Refreshing…" : "Refresh"}
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        <div className="relative flex-1 min-w-[220px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500 pointer-events-none" />
          <input
            type="text"
            placeholder={t(
              "auto.searchByNameOrEmail",
              "Search by name or email…",
            )}
            value={searchInput}
            onChange={(e) => {
              setSearchInput(e.target.value);
              setPage(1);
            }}
            className="w-full pl-9 pr-3 py-2.5 rounded-lg bg-slate-900 border border-slate-800 text-slate-200 text-sm placeholder-slate-600 focus:outline-none focus:border-slate-600 transition-colors"
          />
        </div>

        <select
          value={tierFilter}
          onChange={(e) => {
            setTierFilter(e.target.value);
            setPage(1);
          }}
          className="px-3 py-2.5 rounded-lg bg-slate-900 border border-slate-800 text-slate-300 text-sm focus:outline-none focus:border-slate-600 transition-colors cursor-pointer"
        >
          <option value="">{t("auto.allTiers", "All Tiers")}</option>
          <option value="FREE">{t("auto.fREE", "FREE")}</option>
          <option value="STARTER">{t("auto.sTARTER", "STARTER")}</option>
          <option value="PROFESSIONAL">
            {t("auto.pROFESSIONAL", "PROFESSIONAL")}
          </option>
          <option value="ENTERPRISE">
            {t("auto.eNTERPRISE", "ENTERPRISE")}
          </option>
        </select>

        <select
          value={statusFilter}
          onChange={(e) => {
            setStatusFilter(e.target.value);
            setPage(1);
          }}
          className="px-3 py-2.5 rounded-lg bg-slate-900 border border-slate-800 text-slate-300 text-sm focus:outline-none focus:border-slate-600 transition-colors cursor-pointer"
        >
          <option value="">{t("auto.allStatus", "All Status")}</option>
          <option value="active">{t("auto.active", "Active")}</option>
          <option value="suspended">{t("auto.suspended", "Suspended")}</option>
          <option value="deleted">{t("auto.deleted", "Deleted")}</option>
        </select>

        <select
          value={subscriptionFilter}
          onChange={(e) => {
            setSubscriptionFilter(e.target.value);
            setPage(1);
          }}
          className="px-3 py-2.5 rounded-lg bg-slate-900 border border-slate-800 text-slate-300 text-sm focus:outline-none focus:border-slate-600 transition-colors cursor-pointer"
        >
          <option value="">
            {t("auto.allSubscriptions", "All Subscriptions")}
          </option>
          <option value="active">{t("auto.subscribed", "Subscribed")}</option>
          <option value="none">
            {t("auto.noSubscription", "No Subscription")}
          </option>
        </select>
      </div>

      {/* Table */}
      {isLoading ? (
        <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
          {[...Array(6)].map((_, i) => (
            <div
              key={i}
              className="flex items-center gap-4 px-5 py-4 border-b border-slate-800/60 last:border-0"
            >
              <div className="h-4 rounded bg-slate-800 animate-pulse w-40" />
              <div className="h-4 rounded bg-slate-800 animate-pulse flex-1 hidden md:block" />
              <div className="h-6 rounded-md bg-slate-800 animate-pulse w-20" />
              <div className="h-6 rounded-md bg-slate-800 animate-pulse w-16 hidden lg:block" />
              <div className="h-6 rounded-md bg-slate-800 animate-pulse w-16 hidden lg:block" />
              <div className="h-6 rounded-md bg-slate-800 animate-pulse w-16" />
            </div>
          ))}
        </div>
      ) : isError ? (
        <div className="bg-slate-900 border border-slate-800 rounded-xl flex flex-col items-center justify-center py-16">
          <p className="text-slate-400 text-sm">
            {t("auto.failedToLoadTenants", "Failed to load tenants")}
          </p>
        </div>
      ) : (
        <>
          <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
            <table className="w-full">
              <thead>
                <tr className="border-b border-slate-800">
                  <th className="text-left px-5 py-3.5 text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
                    {t("auto.restaurant", "Restaurant")}
                  </th>
                  <th className="text-left px-5 py-3.5 text-[11px] font-semibold text-slate-500 uppercase tracking-wider hidden md:table-cell">
                    {t("auto.owner", "Owner")}
                  </th>
                  <th className="text-left px-5 py-3.5 text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
                    {t("auto.tier", "Tier")}
                  </th>
                  <th className="text-left px-5 py-3.5 text-[11px] font-semibold text-slate-500 uppercase tracking-wider hidden lg:table-cell">
                    {t("auto.override", "Override")}
                  </th>
                  <th className="text-left px-5 py-3.5 text-[11px] font-semibold text-slate-500 uppercase tracking-wider hidden lg:table-cell">
                    {t("auto.connect", "Connect")}
                  </th>
                  <th className="text-left px-5 py-3.5 text-[11px] font-semibold text-slate-500 uppercase tracking-wider hidden lg:table-cell">
                    {t("auto.subscription", "Subscription")}
                  </th>
                  <th className="text-left px-5 py-3.5 text-[11px] font-semibold text-slate-500 uppercase tracking-wider hidden xl:table-cell">
                    {t("auto.payments", "Payments")}
                  </th>
                  <th className="text-left px-5 py-3.5 text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
                    {t("auto.status", "Status")}
                  </th>
                  <th className="w-10 px-3 py-3.5" />
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {(data?.data ?? []).map((tenant) => (
                  <tr
                    key={tenant.id}
                    onClick={() =>
                      navigate(`/super-admin/tenants/${tenant.id}`)
                    }
                    className="hover:bg-slate-800/40 cursor-pointer transition-colors group"
                  >
                    <td className="px-5 py-4">
                      <span className="text-sm font-semibold text-slate-100">
                        {tenant.name}
                      </span>
                    </td>
                    <td className="px-5 py-4 hidden md:table-cell">
                      <span className="text-sm text-slate-400">
                        {tenant.owner.email}
                      </span>
                    </td>
                    <td className="px-5 py-4">
                      <span
                        className={`inline-flex px-2.5 py-1 rounded-md text-[11px] font-bold border ${TIER_STYLES[tenant.tier] ?? "bg-slate-700/30 text-slate-400 border-slate-700/40"}`}
                      >
                        {tenant.tier}
                      </span>
                    </td>
                    <td className="px-5 py-4 hidden lg:table-cell">
                      {tenant.forceTier ? (
                        <span className="inline-flex px-2.5 py-1 rounded-md text-[11px] font-bold border bg-amber-500/10 text-amber-400 border-amber-500/20">
                          {tenant.forceTier}
                        </span>
                      ) : (
                        <span className="text-xs text-slate-700">—</span>
                      )}
                    </td>
                    <td className="px-5 py-4 hidden lg:table-cell">
                      {tenant.stripeOnboarded ? (
                        <span className="flex items-center gap-1.5">
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 inline-block" />
                          <span className="text-xs text-emerald-400 font-medium">
                            {t("auto.connected", "Connected")}
                          </span>
                        </span>
                      ) : (
                        <span className="text-xs text-slate-700">—</span>
                      )}
                    </td>
                    <td className="px-5 py-4 hidden lg:table-cell">
                      {tenant.stripeSubscriptionId ? (
                        <span className="flex items-center gap-1.5">
                          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                          <span className="text-xs text-emerald-400 font-medium">
                            {t("auto.active", "Active")}
                          </span>
                        </span>
                      ) : (
                        <span className="flex items-center gap-1.5">
                          <XCircle className="w-3.5 h-3.5 text-slate-600 shrink-0" />
                          <span className="text-xs text-slate-600 font-medium">
                            {t("auto.none", "None")}
                          </span>
                        </span>
                      )}
                    </td>
                    <td className="px-5 py-4 hidden xl:table-cell">
                      {tenant.paymentsEnabled ? (
                        <span className="flex items-center gap-1.5">
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 inline-block" />
                          <span className="text-xs text-emerald-400 font-medium">
                            {t("auto.enabled", "Enabled")}
                          </span>
                        </span>
                      ) : (
                        <span className="text-xs text-slate-700">
                          {t("auto.disabled", "Disabled")}
                        </span>
                      )}
                    </td>
                    <td className="px-5 py-4">
                      {tenant.deletedAt ? (
                        <span className="inline-flex px-2.5 py-1 rounded-md text-[11px] font-bold border bg-slate-700/20 text-slate-500 border-slate-700/30">
                          {t("auto.deleted", "Deleted")}
                        </span>
                      ) : tenant.isActive ? (
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-bold border bg-emerald-500/10 text-emerald-400 border-emerald-500/20">
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                          {t("auto.active", "Active")}
                        </span>
                      ) : (
                        <span className="inline-flex px-2.5 py-1 rounded-md text-[11px] font-bold border bg-red-500/10 text-red-400 border-red-500/20">
                          {t("auto.suspended", "Suspended")}
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-4">
                      <ChevronRight className="w-4 h-4 text-slate-700 group-hover:text-slate-400 transition-colors" />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            {(data?.data ?? []).length === 0 && (
              <div className="py-20 flex flex-col items-center justify-center gap-3">
                <Building2 className="w-8 h-8 text-slate-700" />
                <p className="text-slate-500 text-sm">
                  {t("auto.noTenantsFound", "No tenants found")}
                </p>
              </div>
            )}
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between">
              <p className="text-xs text-slate-500 tabular-nums">
                {t("auto.page", "Page")}
                {page} {t("auto.of", "of")}
                {totalPages} {t("auto.Middot", "&middot;")}
                {totalCount} {t("auto.total", "total")}
              </p>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page === 1}
                  className="px-4 py-2 rounded-lg text-sm font-medium bg-slate-900 border border-slate-800 text-slate-300 hover:bg-slate-800 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                >
                  {t("auto.previous", "Previous")}
                </button>
                <button
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  disabled={page === totalPages}
                  className="px-4 py-2 rounded-lg text-sm font-medium bg-slate-900 border border-slate-800 text-slate-300 hover:bg-slate-800 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                >
                  {t("auto.next", "Next")}
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
