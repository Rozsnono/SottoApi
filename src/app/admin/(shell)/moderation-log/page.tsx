"use client";
import { ShieldCheck } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useApi } from "@/lib/admin/useApi";
import { Card, EmptyState, ErrorState, PageHeader, Pager, Pill, Skeleton } from "@/components/admin/ui";
import { fmt } from "../users/page";

interface Row { id: string; at: string; decision: string; reason: string; adminId: string; reportId: string | null; userId: string | null }

/** Moderációs napló (A09): tartós, nincs IP és nincs tartalom. */
export default function ModerationLogPage() {
  const { t } = useTranslation();
  const [page, setPage] = useState(1);
  const { data, error, loading, reload } = useApi<{ page: number; size: number; total: number; items: Row[] }>(`/api/admin/moderation-log?page=${page}`);
  return (
    <>
      <PageHeader title={t("mod.title")} />
      {error && <ErrorState message={t("common.error")} onRetry={reload} />}
      {loading && !data && <Skeleton className="h-32" />}
      {data && data.items.length === 0 && <EmptyState icon={<ShieldCheck size={28} />} text={t("common.empty")} />}
      <div className="flex flex-col gap-2">
        {data?.items.map((r) => (
          <Card key={r.id} className="text-sm">
            <div className="flex flex-wrap items-center justify-between gap-2"><Pill tone="accent">{r.decision}</Pill><span className="text-muted">{fmt(r.at)} · {r.adminId}</span></div>
            <p className="mt-2">{r.reason}</p>
          </Card>
        ))}
      </div>
      {data && data.items.length > 0 && <Pager page={data.page} size={data.size} total={data.total} onPage={setPage} />}
    </>
  );
}
