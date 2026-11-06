"use client";
import { Flag, KeyRound } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useApi } from "@/lib/admin/useApi";
import { Card, EmptyState, ErrorState, PageHeader, Pager, Pill, Skeleton, Stagger, StaggerItem } from "@/components/admin/ui";
import { fmt } from "../users/page";

export interface ReportRow { id: string; reason: string; status: string; createdAt: string; reporter: string | null; target: string | null; grant: "none" | "valid" | "expired"; grantExpiresAt: string | null }
export const reportTone = (s: string) => (s === "open" ? "warning" : s === "actioned" ? "danger" : "neutral") as "warning" | "danger" | "neutral";
export const grantTone = (g: string) => (g === "valid" ? "success" : g === "expired" ? "danger" : "neutral") as "success" | "danger" | "neutral";

/** Jelentések sora (A06). */
export default function ReportsPage() {
  const { t } = useTranslation();
  const [status, setStatus] = useState("open");
  const [page, setPage] = useState(1);
  const { data, error, loading, reload } = useApi<{ page: number; size: number; total: number; items: ReportRow[] }>(`/api/admin/reports?page=${page}${status ? `&status=${status}` : ""}`);
  return (
    <>
      <PageHeader title={t("reports.title")} right={
        <select aria-label={t("users.status")} value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }} className="h-11 rounded-xl border border-line bg-surface px-3">
          <option value="">{t("common.all")}</option>
          {["open", "reviewed", "dismissed", "actioned"].map((s) => <option key={s} value={s}>{t(`status.${s}`)}</option>)}
        </select>} />
      {error && <ErrorState message={t("common.error")} onRetry={reload} />}
      {loading && !data && <div className="flex flex-col gap-2">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-16" />)}</div>}
      {data && data.items.length === 0 && <EmptyState icon={<Flag size={28} />} text={t("common.empty")} />}
      {data && data.items.length > 0 && (
        <>
          <Stagger className="flex flex-col gap-2">
            {data.items.map((r) => (
              <StaggerItem key={r.id}>
                <Link href={`/admin/reports/${r.id}`}>
                  <Card className="flex flex-wrap items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-semibold">#{r.id.slice(-6)} · {r.reason}</p>
                      <p className="break-all text-sm text-muted">{r.reporter ?? "—"} → {r.target ?? "—"} · {fmt(r.createdAt)}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Pill tone={grantTone(r.grant)} icon={<KeyRound size={12} />}>{t(`status.${r.grant === "valid" ? "valid" : r.grant === "expired" ? "expired" : "none"}`)}</Pill>
                      <Pill tone={reportTone(r.status)}>{t(`status.${r.status}`)}</Pill>
                    </div>
                  </Card>
                </Link>
              </StaggerItem>
            ))}
          </Stagger>
          <Pager page={data.page} size={data.size} total={data.total} onPage={setPage} />
        </>
      )}
    </>
  );
}
