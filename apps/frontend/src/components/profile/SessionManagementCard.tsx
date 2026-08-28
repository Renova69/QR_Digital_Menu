import {
  useMutation,
  useInfiniteQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { Laptop, Loader2, LogOut, ShieldCheck, Smartphone } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useAuth } from "../../context/AuthContext";
import {
  getAuthSessions,
  revokeAuthSession,
  signOutEverywhere,
  type AuthSession,
} from "../../lib/api";
import { Button } from "../ui/button";

function describeDevice(session: AuthSession, unknown: string): string {
  const ua = session.userAgent ?? "";
  const browser = /Edg\//i.test(ua)
    ? "Edge"
    : /Firefox\//i.test(ua)
      ? "Firefox"
      : /CriOS|Chrome\//i.test(ua)
        ? "Chrome"
        : /Safari\//i.test(ua)
          ? "Safari"
          : "";
  const platform = /Android/i.test(ua)
    ? "Android"
    : /iPhone|iPad/i.test(ua)
      ? "iOS"
      : /Windows/i.test(ua)
        ? "Windows"
        : /Macintosh|Mac OS/i.test(ua)
          ? "macOS"
          : /Linux/i.test(ua)
            ? "Linux"
            : "";

  if (browser && platform) return `${browser} · ${platform}`;
  return browser || platform || unknown;
}

export function SessionManagementCard() {
  const { t, i18n } = useTranslation();
  const { user, logout } = useAuth();
  const queryClient = useQueryClient();
  const queryKey = ["auth-sessions", user?.id] as const;
  const sessions = useInfiniteQuery({
    queryKey,
    queryFn: ({ pageParam }) => getAuthSessions(pageParam),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (page) => page.nextCursor ?? undefined,
    enabled: Boolean(user?.id),
  });
  const rows = sessions.data?.pages.flatMap((page) => page.sessions);

  const revoke = useMutation({
    mutationFn: revokeAuthSession,
    onSuccess: async (result) => {
      if (result.current) {
        await logout();
        return;
      }
      await queryClient.invalidateQueries({ queryKey });
    },
  });

  const revokeAll = useMutation({
    mutationFn: signOutEverywhere,
    onSuccess: async () => {
      await logout();
    },
  });

  const confirmAll = () => {
    if (window.confirm(t("sessions.signOutAllConfirm"))) {
      revokeAll.mutate();
    }
  };

  return (
    <section className="space-y-4 rounded-xl border border-border bg-background p-4">
      <div className="flex flex-col items-start justify-between gap-3 sm:flex-row">
        <div>
          <h3 className="flex items-center gap-2 text-sm font-semibold text-foreground">
            <ShieldCheck className="h-4 w-4 text-primary" />
            {t("sessions.title")}
          </h3>
          <p className="mt-1 text-xs text-muted-foreground">
            {t("sessions.description")}
          </p>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={confirmAll}
          disabled={revokeAll.isPending || revoke.isPending || !user}
          className="shrink-0 text-destructive hover:text-destructive"
        >
          {revokeAll.isPending ? (
            <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
          ) : (
            <LogOut className="mr-2 h-3.5 w-3.5" />
          )}
          {t("sessions.signOutAll")}
        </Button>
      </div>

      {sessions.isLoading && (
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
          {t("common.loading")}
        </div>
      )}

      {sessions.isError && (
        <div role="alert" className="text-xs text-destructive">
          <p>{t("sessions.loadError")}</p>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => void sessions.refetch()}
          >
            {t("sessions.retry")}
          </Button>
        </div>
      )}

      {rows?.length === 0 && (
        <p className="text-xs text-muted-foreground">{t("sessions.empty")}</p>
      )}
      {sessions.data?.pages[0].legacyCurrentSession && (
        <p className="text-xs text-muted-foreground">{t("sessions.legacy")}</p>
      )}

      <div className="space-y-2">
        {rows?.map((session) => {
          const DeviceIcon = session.authMethod === "PIN" ? Smartphone : Laptop;
          return (
            <div
              key={session.id}
              className="flex flex-col items-start justify-between gap-3 rounded-lg border border-border bg-muted/30 p-3 sm:flex-row sm:items-center"
            >
              <div className="flex min-w-0 items-start gap-3">
                <DeviceIcon className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="truncate text-sm font-medium text-foreground">
                      {describeDevice(session, t("sessions.unknownDevice"))}
                    </p>
                    {session.current && (
                      <span className="rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] font-semibold text-emerald-600 dark:text-emerald-400">
                        {t("sessions.current")}
                      </span>
                    )}
                  </div>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {t(`sessions.methods.${session.authMethod}`)} ·{" "}
                    {t("sessions.signedIn", {
                      date: new Intl.DateTimeFormat(i18n.language, {
                        dateStyle: "medium",
                        timeStyle: "short",
                      }).format(new Date(session.createdAt)),
                    })}
                  </p>
                  <p className="text-[11px] text-muted-foreground/80">
                    {t("sessions.expires", {
                      date: new Intl.DateTimeFormat(i18n.language, {
                        dateStyle: "medium",
                        timeStyle: "short",
                      }).format(new Date(session.expiresAt)),
                    })}
                    {session.ipAddress
                      ? ` · ${t("sessions.ipAddress", { ip: session.ipAddress })}`
                      : ""}
                  </p>
                </div>
              </div>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => revoke.mutate(session.id)}
                disabled={revoke.isPending || revokeAll.isPending}
                className="shrink-0 text-destructive hover:text-destructive"
              >
                {t("sessions.signOut")}
              </Button>
            </div>
          );
        })}
      </div>

      {sessions.hasNextPage && (
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => void sessions.fetchNextPage()}
          disabled={sessions.isFetchingNextPage}
        >
          {t("sessions.loadMore")}
        </Button>
      )}

      {(revoke.isError || revokeAll.isError) && (
        <p className="text-xs text-destructive" role="alert">
          {t("sessions.actionError")}
        </p>
      )}
    </section>
  );
}
