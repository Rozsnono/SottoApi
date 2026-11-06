"use client";
import { Search, Smartphone, Flag, Trash2, UserX } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useApi } from "@/lib/admin/useApi";
import { Card, EmptyState, ErrorState, PageHeader, Pager, Pill, Skeleton, Stagger, StaggerItem } from "@/components/admin/ui";

export interface UserRow { id: string; username: string; status: string; createdAt: string; lastSeenAt: string | null; purgeAt: string | null; daysLeft: number | null; devices: number; reports: number }
interface List { page: number; size: number; total: number; items: UserRow[] }

export const statusTone = (s: string) => (s === "active" ? "success" : s === "suspended" ? "danger" : s === "deleted_pending" ? "warning" : "neutral") as "success" | "danger" | "warning" | "neutral";
export const fmt = (d: string | null) => (d ? new Date(d).toLocaleString() : "—");

/** Felhasználók (A03 + A05 szűrővel): metaadat, kártyalista mobilon és asztalon is. */
export default function UsersPage() {
  const { t } = useTranslation();
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("");
  const [page, setPage] = useState(1);
  const params = new URLSearchParams({ page: String(page), ...(q ? { q } : {}), ...(status ? { status } : {}) });
  const { data, error, loading, reload } = useApi<List>(`/api/admin/users?${params}`);
  return (
    <>
      <PageHeader title={t("users.title")} right={<Link href="/admin/users/pending-purge" aria-label={t("users.pending")} title={t("users.pending")} className="grid size-11 place-items-center rounded-xl border border-line bg-surface hover:bg-alt"><Trash2 size={20} /></Link>} />
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="relative min-w-52 flex-1">
          <Search size={18} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted" aria-hidden="true" />
          <input aria-label={t("common.search")} placeholder={t("users.searchPh")} value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }} className="h-12 w-full rounded-xl border border-line bg-surface pl-10 pr-3" />
        </div>
        <select aria-label={t("users.status")} value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }} className="h-12 rounded-xl border border-line bg-surface px-3">
          <option value="">{t("common.all")}</option>
          {["active", "suspended", "deleted_pending"].map((s) => <option key={s} value={s}>{t(`status.${s}`)}</option>)}
        </select>
      </div>
      {error && <ErrorState message={t("common.error")} onRetry={reload} />}
      {loading && !data && <div className="flex flex-col gap-2">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-16" />)}</div>}
      {data && data.items.length === 0 && <EmptyState icon={<UserX size={28} />} text={t("common.empty")} />}
      {data && data.items.length > 0 && (
        <>
          {/* Asztali táblázat */}
          <div className="hidden overflow-hidden rounded-2xl border border-line md:block">
            <table className="w-full text-left text-sm">
              <thead className="bg-alt text-xs text-muted"><tr>
                <th className="p-3">{t("users.title")}</th><th className="p-3">{t("users.status")}</th><th className="p-3">{t("users.created")}</th><th className="p-3">{t("users.lastSeen")}</th>
                <th className="p-3"><Smartphone size={16} aria-label={t("users.devices")} /></th><th className="p-3"><Flag size={16} aria-label={t("users.reports")} /></th>
              </tr></thead>
              <tbody>{data.items.map((u) => (
                <tr key={u.id} className="border-t border-line bg-surface hover:bg-alt">
                  <td className="p-3 font-medium"><Link href={`/admin/users/${u.id}`} className="break-all text-accent underline-offset-2 hover:underline">{u.username}</Link></td>
                  <td className="p-3"><Pill tone={statusTone(u.status)}>{t(`status.${u.status}`)}</Pill></td>
                  <td className="p-3 text-muted">{fmt(u.createdAt)}</td><td className="p-3 text-muted">{fmt(u.lastSeenAt)}</td>
                  <td className="p-3">{u.devices}</td><td className="p-3">{u.reports}</td>
                </tr>))}</tbody>
            </table>
          </div>
          {/* Mobil kártyalista */}
          <Stagger className="flex flex-col gap-2 md:hidden">
            {data.items.map((u) => (
              <StaggerItem key={u.id}>
                <Link href={`/admin/users/${u.id}`}><Card className="flex items-center justify-between gap-3">
                  <div className="min-w-0"><p className="break-all font-semibold">{u.username}</p><p className="text-xs text-muted">{fmt(u.lastSeenAt)}</p></div>
                  <div className="flex items-center gap-2 text-sm text-muted"><Smartphone size={14} />{u.devices}<Flag size={14} />{u.reports}<Pill tone={statusTone(u.status)}>{t(`status.${u.status}`)}</Pill></div>
                </Card></Link>
              </StaggerItem>))}
          </Stagger>
          <Pager page={data.page} size={data.size} total={data.total} onPage={setPage} />
        </>
      )}
    </>
  );
}
