import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import * as AlertDialog from "@radix-ui/react-alert-dialog";
import {
  getPublicLegalSettings,
  exportUserData,
  deleteUserAccount,
  getAuthSessions,
} from "../../lib/api";
import { getApiError } from "../../lib/apiError";
import { useAuth } from "../../context/AuthContext";

export default function DataPrivacyTab() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { logout } = useAuth();
  const [exportError, setExportError] = useState<string | null>(null);

  const { data: settings } = useQuery({
    queryKey: ["public-legal-settings"],
    queryFn: getPublicLegalSettings,
    staleTime: 5 * 60 * 1000,
  });

  const exportMutation = useMutation({
    mutationFn: exportUserData,
    onSuccess: (data) => {
      const blob = new Blob([JSON.stringify(data, null, 2)], {
        type: "application/json",
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `my-data-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
      setExportError(null);
    },
    onError: () =>
      setExportError(
        t("gdpr.exportError", {
          defaultValue: "Export failed. Please try again.",
        }),
      ),
  });

  const deleteMutation = useMutation({
    mutationFn: async () => {
      // Check freshness without consuming the destructive endpoint's hourly
      // attempt. The server guard remains authoritative for the deletion.
      const { sessions } = await getAuthSessions();
      const session = sessions.find((candidate) => candidate.current);
      const age = session ? Date.now() - Date.parse(session.createdAt) : NaN;
      const expiresAt = session ? Date.parse(session.expiresAt) : NaN;
      if (
        !session ||
        !["PASSWORD", "GOOGLE", "OTP"].includes(session.authMethod) ||
        !Number.isFinite(age) ||
        age < 0 ||
        age >= 4 * 60_000 ||
        !Number.isFinite(expiresAt) ||
        expiresAt <= Date.now()
      ) {
        throw Object.assign(new Error("STEP_UP_REQUIRED"), {
          response: { data: { code: "STEP_UP_REQUIRED" } },
        });
      }
      return deleteUserAccount();
    },
    onSuccess: () => {
      logout();
      navigate("/");
    },
  });

  if (!settings?.gdprEnabled) return null;
  if (!settings?.erasureEndpointEnabled && !settings?.dataExportEndpointEnabled)
    return null;

  return (
    <div className="rounded-xl border border-gray-200 dark:border-white/10 p-4 space-y-3">
      <h3 className="text-base font-semibold">{t("gdpr.dataPrivacyTab")}</h3>

      <div className="flex flex-wrap items-center gap-3">
        {settings.dataExportEndpointEnabled && (
          <button
            onClick={() => exportMutation.mutate()}
            disabled={exportMutation.isPending}
            className="px-4 py-2 rounded-lg bg-gray-100 dark:bg-white/10 text-sm font-medium hover:bg-gray-200 dark:hover:bg-white/20 disabled:opacity-50 transition-colors"
          >
            {exportMutation.isPending ? "Downloading…" : t("gdpr.downloadData")}
          </button>
        )}

        {settings.erasureEndpointEnabled && (
          <AlertDialog.Root>
            <AlertDialog.Trigger asChild>
              <button className="px-4 py-2 rounded-lg bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 text-sm font-medium hover:bg-red-100 dark:hover:bg-red-900/40 transition-colors">
                {t("gdpr.deleteAccount")}
              </button>
            </AlertDialog.Trigger>

            <AlertDialog.Portal>
              <AlertDialog.Overlay className="fixed inset-0 bg-black/50 z-50" />
              <AlertDialog.Content className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-50 w-full max-w-sm rounded-xl bg-white dark:bg-gray-900 border border-gray-200 dark:border-white/10 p-6 shadow-2xl">
                <AlertDialog.Title className="text-base font-semibold mb-2">
                  {t("gdpr.deleteAccountConfirmTitle")}
                </AlertDialog.Title>
                <AlertDialog.Description className="text-sm text-gray-500 dark:text-gray-400 mb-6">
                  {t("gdpr.deleteAccountConfirmBody")}
                </AlertDialog.Description>
                <div className="flex gap-3 justify-end">
                  <AlertDialog.Cancel asChild>
                    <button className="px-4 py-2 rounded-lg text-sm text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-white/10 transition-colors">
                      {t("gdpr.deleteAccountCancel")}
                    </button>
                  </AlertDialog.Cancel>
                  <AlertDialog.Action asChild>
                    <button
                      onClick={() => deleteMutation.mutate()}
                      disabled={deleteMutation.isPending}
                      className="px-4 py-2 rounded-lg bg-red-600 text-white text-sm font-medium hover:bg-red-700 disabled:opacity-50 transition-colors"
                    >
                      {deleteMutation.isPending
                        ? "Deleting…"
                        : t("gdpr.deleteAccountConfirm")}
                    </button>
                  </AlertDialog.Action>
                </div>
              </AlertDialog.Content>
            </AlertDialog.Portal>
          </AlertDialog.Root>
        )}
      </div>

      {exportError && <p className="text-xs text-red-500">{exportError}</p>}
      {deleteMutation.isError && (
        <div role="alert" className="text-sm text-red-500 space-y-2">
          <p>{t(getApiError(deleteMutation.error))}</p>
          {getApiError(deleteMutation.error) === "apiErrors.stepUpRequired" && (
            <button
              className="underline font-medium"
              onClick={async () => {
                await logout();
                navigate("/login");
              }}
            >
              {t("profile.loginButton")}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
