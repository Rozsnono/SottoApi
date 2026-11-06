"use client";
import { Ban, RotateCcw, Trash2, Smartphone, Users, ShieldOff } from "lucide-react";
import { useParams, useRouter } from "next/navigation";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { api, ApiClientError } from "@/lib/admin/api";
import { useApi } from "@/lib/admin/useApi";
import { Button, Card, ErrorState, Field, Modal, PageHeader, Pill, Skeleton, useToast } from "@/components/admin/ui";
import { fmt, statusTone } from "../page";

interface Detail { id: string; username: string; status: string; suspendedReason: string | null; createdAt: string; lastSeenAt: string | null; deletedAt: string | null; counts: { friends: number; blocks: number; reportsAgainst: number }; devices: { deviceName: string; lastSeenAt: string | null; revoked: boolean }[] }

/** Felhasználó (A04): metaadat + felfüggesztés/visszaállítás indoklással; üzenet-/ismerős-tartalom nincs. */
export default function UserDetail() {
  const { t } = useTranslation();
  const toast = useToast();
  const router = useRouter();
  const { id } = useParams<{ id: string }>();
  const { data, error, loading, reload } = useApi<Detail>(`/api/admin/users/${id}`);
  const [modal, setModal] = useState<"suspend" | "restore" | "delete" | null>(null);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [confirmName, setConfirmName] = useState("");

  async function submit() {
    if (!modal) return;
    setBusy(true);
    try {
      await api(`/api/admin/users/${id}/${modal}`, { body: { reason } });
      setModal(null); setReason(""); setConfirmName("");
      if (modal === "delete") router.push("/admin/users"); else reload();
    } catch (e) {
      toast("error", e instanceof ApiClientError ? e.message : t("common.error"));
    } finally { setBusy(false); }
  }

  return (
    <>
      <PageHeader title={data?.username ?? t("users.title")} back="/admin/users" right={
        data && data.status !== "purged" ? (
          <div className="flex gap-2">
            {data.status === "active" ? <Button tone="danger" icon={<Ban size={18} />} onClick={() => setModal("suspend")}>{t("users.suspend")}</Button>
            : data.status === "suspended" ? <Button tone="secondary" icon={<RotateCcw size={18} />} onClick={() => setModal("restore")}>{t("users.restore")}</Button> : null}
            <Button tone="danger" icon={<Trash2 size={18} />} onClick={() => setModal("delete")}>{t("users.delete")}</Button>
          </div>
        ) : null
      } />
      {error && <ErrorState message={error.status === 404 ? t("common.empty") : t("common.error")} onRetry={reload} />}
      {loading && !data && <Skeleton className="h-40" />}
      {data && (
        <div className="grid gap-3 md:grid-cols-2">
          <Card className="flex flex-col gap-2 text-sm">
            <div className="flex items-center justify-between"><span className="text-muted">{t("users.status")}</span><Pill tone={statusTone(data.status)}>{t(`status.${data.status}`)}</Pill></div>
            {data.suspendedReason && <div className="flex items-center justify-between gap-3"><span className="text-muted">{t("users.suspendedReason")}</span><span className="text-right">{data.suspendedReason}</span></div>}
            <div className="flex justify-between"><span className="text-muted">{t("users.created")}</span><span>{fmt(data.createdAt)}</span></div>
            <div className="flex justify-between"><span className="text-muted">{t("users.lastSeen")}</span><span>{fmt(data.lastSeenAt)}</span></div>
            <div className="mt-2 flex gap-4 border-t border-line pt-3">
              <span className="flex items-center gap-1.5" title={t("users.friends")}><Users size={16} className="text-accent" />{data.counts.friends}</span>
              <span className="flex items-center gap-1.5" title={t("users.blocks")}><ShieldOff size={16} className="text-accent" />{data.counts.blocks}</span>
              <span className="flex items-center gap-1.5" title={t("users.reports")}><Ban size={16} className="text-accent" />{data.counts.reportsAgainst}</span>
            </div>
            <p className="text-xs text-muted">{t("users.noContent")}</p>
          </Card>
          <Card>
            <p className="mb-2 flex items-center gap-2 text-sm text-muted"><Smartphone size={16} />{t("users.devices")}</p>
            <ul className="flex flex-col gap-2 text-sm">
              {data.devices.map((d, i) => (
                <li key={i} className="flex items-center justify-between gap-2"><span className="break-all">{d.deviceName}</span><span className="text-muted">{fmt(d.lastSeenAt)}</span>{d.revoked && <Pill tone="danger">{t("users.deviceRevoked")}</Pill>}</li>
              ))}
            </ul>
          </Card>
        </div>
      )}
      <Modal open={modal !== null} onClose={() => setModal(null)} title={modal === "suspend" ? t("users.suspendTitle") : modal === "delete" ? t("users.deleteTitle") : t("users.restoreTitle")}>
        <div className="flex flex-col gap-3">
          {modal === "delete" && <p className="flex items-start gap-2 text-sm text-danger"><Trash2 size={18} className="mt-0.5 shrink-0" />{t("users.deleteWarn")}</p>}
          {modal === "delete" && <Field label={t("users.deleteConfirmName")} value={confirmName} onChange={(e) => setConfirmName(e.target.value)} autoComplete="off" placeholder={data?.username} />}
          <Field label={t("common.reason")} value={reason} onChange={(e) => setReason(e.target.value)} maxLength={300} />
          <div className="flex justify-end gap-2">
            <Button tone="secondary" onClick={() => { setModal(null); setConfirmName(""); }}>{t("common.cancel")}</Button>
            <Button tone={modal === "suspend" || modal === "delete" ? "danger" : "primary"} loading={busy} disabled={reason.trim().length < 3 || (modal === "delete" && confirmName !== data?.username)} onClick={submit}>{t("common.confirm")}</Button>
          </div>
        </div>
      </Modal>
    </>
  );
}
