"use client";
import { Activity, Flag, HardDrive, MessageSquare, Trash2, Users } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useApi } from "@/lib/admin/useApi";
import { Card, ErrorState, PageHeader, Skeleton, Stagger, StaggerItem } from "@/components/admin/ui";

interface Stats { users: number; active7d: number; openReports: number; pendingDeletion: number; messages24h: number; mediaCount: number; signups: { day: string; count: number }[] }

/** Irányítópult (A02): csak számok, tartalom és felhasználóhoz köthető üzenetadat nélkül. */
export default function Dashboard() {
  const { t } = useTranslation();
  const { data, error, loading, reload } = useApi<Stats>("/api/admin/stats");
  const cards = data && [
    { k: "users", v: data.users, Icon: Users },
    { k: "active", v: data.active7d, Icon: Activity },
    { k: "openReports", v: data.openReports, Icon: Flag },
    { k: "pending", v: data.pendingDeletion, Icon: Trash2 },
    { k: "messages", v: data.messages24h, Icon: MessageSquare },
    { k: "media", v: data.mediaCount, Icon: HardDrive },
  ];
  const max = Math.max(1, ...(data?.signups.map((s) => s.count) ?? [1]));
  return (
    <>
      <PageHeader title={t("nav.dashboard")} />
      {error && <ErrorState message={t("common.error")} onRetry={reload} />}
      {loading && !data && <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">{Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-28" />)}</div>}
      {cards && (
        <Stagger className="grid grid-cols-2 gap-3 lg:grid-cols-3">
          {cards.map((c) => (
            <StaggerItem key={c.k}>
              <Card>
                <c.Icon size={22} className="mb-2 text-accent" aria-hidden="true" />
                <p className="font-display text-3xl font-bold">{c.v.toLocaleString()}</p>
                <p className="text-sm text-muted">{t(`dashboard.${c.k}`)}</p>
              </Card>
            </StaggerItem>
          ))}
        </Stagger>
      )}
      {data && (
        <Card className="mt-4">
          <p className="mb-3 text-sm text-muted">{t("dashboard.signups")}</p>
          {data.signups.length === 0 ? (
            <p className="text-sm text-muted">{t("common.none")}</p>
          ) : (
            <div className="flex h-32 gap-2" role="img" aria-label={t("dashboard.signups")}>
              {data.signups.map((s) => (
                <div key={s.day} className="flex h-full flex-1 flex-col items-center gap-1" title={`${s.day}: ${s.count}`}>
                  <div className="flex min-h-0 w-full flex-1 items-end">
                    <div className="w-full rounded-t-md bg-accent" style={{ height: `${Math.max(6, (s.count / max) * 100)}%` }} />
                  </div>
                  <span className="text-[10px] text-muted">{s.day.slice(5)}</span>
                </div>
              ))}
            </div>
          )}
          <p className="mt-3 text-xs text-muted">{t("dashboard.countsOnly")}</p>
        </Card>
      )}
    </>
  );
}
