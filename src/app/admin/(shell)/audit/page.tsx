"use client";
import { ScrollText } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useApi } from "@/lib/admin/useApi";
import { Card, EmptyState, ErrorState, PageHeader, Pager, Pill, Skeleton } from "@/components/admin/ui";
import { fmt } from "../users/page";

interface Row { id: string; at: string; actorType: string; actorId: string | null; action: string; target: string | null; ip: string | null; userAgent: string | null }

/** Audit napló (A08): szűrők, lapozás; 30 napos megőrzés. */
export default function AuditPage() {
  const { t } = useTranslation();
  const [actorType, setActorType] = useState("");
  const [action, setAction] = useState("");
  const [page, setPage] = useState(1);
  const qs = new URLSearchParams({ page: String(page), ...(actorType ? { actorType } : {}), ...(action ? { action } : {}) });
  const { data, error, loading, reload } = useApi<{ page: number; size: number; total: number; items: Row[] }>(`/api/admin/audit?${qs}`);
  return (
    <>
      <PageHeader title={t("audit.title")} />
      <p className="mb-3 text-sm text-muted">{t("audit.retention")}</p>
      <div className="mb-4 flex flex-wrap gap-2">
        <select aria-label={t("audit.actor")} value={actorType} onChange={(e) => { setActorType(e.target.value); setPage(1); }} className="h-12 rounded-xl border border-line bg-surface px-3">
          <option value="">{t("common.all")}</option>{["admin", "user", "system"].map((a) => <option key={a} value={a}>{a}</option>)}
        </select>
        <input aria-label={t("audit.action")} placeholder={t("audit.filterAction")} value={action} onChange={(e) => { setAction(e.target.value); setPage(1); }} className="h-12 min-w-52 flex-1 rounded-xl border border-line bg-surface px-3" />
      </div>
      {error && <ErrorState message={t("common.error")} onRetry={reload} />}
      {loading && !data && <Skeleton className="h-40" />}
      {data && data.items.length === 0 && <EmptyState icon={<ScrollText size={28} />} text={t("common.empty")} />}
      {data && data.items.length > 0 && (
        <>
          <div className="hidden overflow-hidden rounded-2xl border border-line md:block">
            <table className="w-full text-left text-sm">
              <thead className="bg-alt text-xs text-muted"><tr><th className="p-3">{t("audit.time")}</th><th className="p-3">{t("audit.actor")}</th><th className="p-3">{t("audit.action")}</th><th className="p-3">{t("audit.target")}</th><th className="p-3">{t("audit.ip")}</th></tr></thead>
              <tbody>{data.items.map((r) => (
                <tr key={r.id} className="border-t border-line bg-surface align-top">
                  <td className="p-3 whitespace-nowrap text-muted">{fmt(r.at)}</td>
                  <td className="p-3"><Pill tone={r.actorType === "admin" ? "accent" : "neutral"}>{r.actorType}</Pill></td>
                  <td className="p-3 font-mono text-xs">{r.action}</td><td className="p-3 break-all text-muted">{r.target ?? "—"}</td><td className="p-3 text-muted">{r.ip ?? "—"}</td>
                </tr>))}</tbody>
            </table>
          </div>
          <div className="flex flex-col gap-2 md:hidden">
            {data.items.map((r) => (
              <Card key={r.id} className="text-sm">
                <div className="flex items-center justify-between gap-2"><span className="font-mono text-xs">{r.action}</span><Pill tone={r.actorType === "admin" ? "accent" : "neutral"}>{r.actorType}</Pill></div>
                <p className="mt-1 text-xs text-muted">{fmt(r.at)} · {r.ip ?? "—"}</p>
              </Card>
            ))}
          </div>
          <Pager page={data.page} size={data.size} total={data.total} onPage={setPage} />
        </>
      )}
    </>
  );
}
