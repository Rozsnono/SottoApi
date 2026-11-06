"use client";
import { Clock, Trash2 } from "lucide-react";
import Link from "next/link";
import { useTranslation } from "react-i18next";
import { useApi } from "@/lib/admin/useApi";
import { Card, EmptyState, ErrorState, PageHeader, Pill, Skeleton } from "@/components/admin/ui";
import { fmt, type UserRow } from "../page";

/** Törlésre váró fiókok (A05): csak megtekintés – a végleges törlést az automatikus purge végzi, kézi törlés nincs. */
export default function PendingPurge() {
  const { t } = useTranslation();
  const { data, error, loading, reload } = useApi<{ items: UserRow[] }>("/api/admin/users?status=deleted_pending&size=100");
  return (
    <>
      <PageHeader title={t("users.pending")} back="/admin/users" />
      {error && <ErrorState message={t("common.error")} onRetry={reload} />}
      {loading && !data && <Skeleton className="h-20" />}
      {data && data.items.length === 0 && <EmptyState icon={<Trash2 size={28} />} text={t("common.empty")} />}
      <div className="flex flex-col gap-2">
        {data?.items.map((u) => (
          <Card key={u.id} className="flex items-center justify-between gap-3">
            <Link href={`/admin/users/${u.id}`} className="break-all font-semibold text-accent">{u.username}</Link>
            <div className="flex items-center gap-2 text-sm text-muted"><Clock size={14} />{fmt(u.purgeAt)}<Pill tone="warning">{t("users.daysLeft", { n: u.daysLeft ?? 0 })}</Pill></div>
          </Card>
        ))}
      </div>
    </>
  );
}
