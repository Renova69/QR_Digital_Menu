import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { FileText, ChevronDown } from "lucide-react";
import {
  superAdminGetDataRequests,
  superAdminUpdateDataRequest,
} from "../../lib/api";
import type { DataRequest, PaginatedResponse } from "../../types";

const STATUS_STYLES: Record<string, string> = {
  PENDING: "bg-amber-500/10 text-amber-400 border-amber-500/20",
  IN_PROGRESS: "bg-blue-500/10 text-blue-400 border-blue-500/20",
  COMPLETED: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
  REJECTED: "bg-red-500/10 text-red-400 border-red-500/20",
};

const TYPE_STYLES: Record<string, string> = {
  ERASURE: "bg-red-500/10 text-red-400 border-red-500/20",
  EXPORT: "bg-purple-500/10 text-purple-400 border-purple-500/20",
};

const NEXT_STATUS: Record<string, string> = {
  PENDING: "IN_PROGRESS",
  IN_PROGRESS: "COMPLETED",
};

export default function DataRequestsPage() {
  const qc = useQueryClient();
  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState("");
  const [typeFilter, setTypeFilter] = useState("");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [editNotes, setEditNotes] = useState<Record<string, string>>({});

  const { data, isLoading } = useQuery<PaginatedResponse<DataRequest>>({
    queryKey: ["super-admin-data-requests", page, statusFilter, typeFilter],
    queryFn: () =>
      superAdminGetDataRequests({
        page,
        limit: 20,
        ...(statusFilter ? { status: statusFilter } : {}),
        ...(typeFilter ? { type: typeFilter } : {}),
      }),
  });

  const updateMutation = useMutation({
    mutationFn: ({
      id,
      patch,
    }: {
      id: string;
      patch: {
        status?: string;
        notes?: string;
        confirmation?: "CONFIRM";
      };
    }) => superAdminUpdateDataRequest(id, patch),
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: ["super-admin-data-requests"] }),
  });

  const requests = data?.data ?? [];
  const total = data?.meta.total ?? 0;
  const totalPages = Math.ceil(total / 20);
  const updateStatus = (
    id: string,
    status: string,
    notes: string | undefined,
  ) => {
    const isTerminal = status === "COMPLETED" || status === "REJECTED";
    if (
      isTerminal &&
      !window.confirm(
        `Confirm marking this GDPR data request as ${status.toLowerCase()}? This action is recorded in the audit log.`,
      )
    ) {
      return;
    }

    updateMutation.mutate({
      id,
      patch: {
        status,
        notes,
        ...(isTerminal ? { confirmation: "CONFIRM" as const } : {}),
      },
    });
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold text-white">GDPR Data Requests</h1>
        <p className="mt-1 text-sm text-slate-500">
          Erasure and export requests submitted by users.
        </p>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        <select
          value={statusFilter}
          onChange={(e) => {
            setStatusFilter(e.target.value);
            setPage(1);
          }}
          className="rounded-lg border border-slate-700 bg-slate-800 px-3 py-1.5 text-sm text-slate-300 focus:outline-none focus:ring-1 focus:ring-violet-500"
        >
          <option value="">All statuses</option>
          <option value="PENDING">Pending</option>
          <option value="IN_PROGRESS">In Progress</option>
          <option value="COMPLETED">Completed</option>
          <option value="REJECTED">Rejected</option>
        </select>

        <select
          value={typeFilter}
          onChange={(e) => {
            setTypeFilter(e.target.value);
            setPage(1);
          }}
          className="rounded-lg border border-slate-700 bg-slate-800 px-3 py-1.5 text-sm text-slate-300 focus:outline-none focus:ring-1 focus:ring-violet-500"
        >
          <option value="">All types</option>
          <option value="ERASURE">Erasure</option>
          <option value="EXPORT">Export</option>
        </select>

        <span className="ml-auto text-xs text-slate-500 self-center">
          {total} total
        </span>
      </div>

      {isLoading ? (
        <div className="py-16 text-center text-sm text-slate-500">Loading…</div>
      ) : requests.length === 0 ? (
        <div className="flex flex-col items-center gap-3 py-20">
          <FileText className="h-8 w-8 text-slate-700" />
          <p className="text-sm text-slate-500">No data requests found.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {requests.map((req) => {
            const isOpen = expandedId === req.id;
            const notes = editNotes[req.id] ?? req.notes ?? "";

            return (
              <div
                key={req.id}
                className="rounded-lg border border-slate-800 bg-slate-900 overflow-hidden"
              >
                <button
                  onClick={() => setExpandedId(isOpen ? null : req.id)}
                  className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-slate-800/40 transition-colors"
                >
                  <span
                    className={`shrink-0 rounded border px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${TYPE_STYLES[req.type]}`}
                  >
                    {req.type}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-slate-200">
                      {req.user.email}
                    </p>
                    <p className="text-xs text-slate-500">
                      {new Date(req.requestedAt).toLocaleString([], {
                        hour12: false,
                      })}
                    </p>
                  </div>
                  <span
                    className={`shrink-0 rounded border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${STATUS_STYLES[req.status]}`}
                  >
                    {req.status.replace("_", " ")}
                  </span>
                  <ChevronDown
                    className={`h-4 w-4 shrink-0 text-slate-500 transition-transform ${isOpen ? "rotate-180" : ""}`}
                  />
                </button>

                {isOpen && (
                  <div className="border-t border-slate-800 px-4 py-4 space-y-3">
                    <div className="text-xs text-slate-500 space-y-1">
                      <p>
                        User:{" "}
                        <span className="text-slate-300">
                          {req.user.name ?? req.user.email}
                        </span>
                      </p>
                      {req.processedAt && (
                        <p>
                          Processed:{" "}
                          <span className="text-slate-300">
                            {new Date(req.processedAt).toLocaleString([], {
                              hour12: false,
                            })}
                          </span>
                        </p>
                      )}
                    </div>

                    <div>
                      <label className="text-xs text-slate-500 mb-1 block">
                        Notes
                      </label>
                      <textarea
                        value={notes}
                        onChange={(e) =>
                          setEditNotes((prev) => ({
                            ...prev,
                            [req.id]: e.target.value,
                          }))
                        }
                        rows={2}
                        className="w-full rounded-md border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-200 focus:outline-none focus:ring-1 focus:ring-violet-500 resize-none"
                        placeholder="Internal notes…"
                      />
                    </div>

                    <div className="flex flex-wrap gap-2">
                      {NEXT_STATUS[req.status] && (
                        <button
                          onClick={() =>
                            updateStatus(
                              req.id,
                              NEXT_STATUS[req.status],
                              notes || undefined,
                            )
                          }
                          disabled={updateMutation.isPending}
                          className="rounded-lg bg-violet-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-violet-500 disabled:opacity-50 transition-colors"
                        >
                          Mark as {NEXT_STATUS[req.status].replace("_", " ")}
                        </button>
                      )}

                      {req.status !== "REJECTED" &&
                        req.status !== "COMPLETED" && (
                          <button
                            onClick={() =>
                              updateStatus(
                                req.id,
                                "REJECTED",
                                notes || undefined,
                              )
                            }
                            disabled={updateMutation.isPending}
                            className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-1.5 text-xs font-medium text-red-400 hover:bg-red-500/20 disabled:opacity-50 transition-colors"
                          >
                            Reject
                          </button>
                        )}

                      {notes !== (req.notes ?? "") && (
                        <button
                          onClick={() =>
                            updateMutation.mutate({
                              id: req.id,
                              patch: { notes },
                            })
                          }
                          disabled={updateMutation.isPending}
                          className="rounded-lg border border-slate-600 px-3 py-1.5 text-xs font-medium text-slate-300 hover:bg-slate-700 disabled:opacity-50 transition-colors"
                        >
                          Save notes
                        </button>
                      )}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between text-sm">
          <button
            disabled={page <= 1}
            onClick={() => setPage((p) => p - 1)}
            className="rounded-lg border border-slate-700 px-3 py-1.5 text-slate-400 hover:bg-slate-800 disabled:opacity-40 transition-colors"
          >
            Previous
          </button>
          <span className="text-slate-500">
            Page {page} of {totalPages}
          </span>
          <button
            disabled={page >= totalPages}
            onClick={() => setPage((p) => p + 1)}
            className="rounded-lg border border-slate-700 px-3 py-1.5 text-slate-400 hover:bg-slate-800 disabled:opacity-40 transition-colors"
          >
            Next
          </button>
        </div>
      )}
    </div>
  );
}
