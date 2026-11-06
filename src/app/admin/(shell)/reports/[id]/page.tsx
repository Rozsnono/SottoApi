"use client";
import { CheckCircle2, EyeOff, KeyRound, ShieldAlert, ShieldCheck, Unlock, X } from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";
import { useParams } from "next/navigation";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { api, ApiClientError } from "@/lib/admin/api";
import { decryptReported, type DecryptResult, type ReportedContent } from "@/lib/admin/decrypt";
import { useApi } from "@/lib/admin/useApi";
import { Button, Card, ErrorState, Field, Modal, PageHeader, Pill, Skeleton, useToast } from "@/components/admin/ui";
import { fmt } from "../../users/page";
import { grantTone, reportTone } from "../page";

interface Detail { id: string; reason: string; note: string | null; status: string; createdAt: string; resolvedAt: string | null; reporter: string | null; target: string | null; message: { type: string; sentAt: string; sizeBytes: number | null } | null; grant: "none" | "valid" | "expired"; grantExpiresAt: string | null }

/**
 * Jelentés részletei (A07). A tartalom CSAK érvényes grant esetén tölthető le (titkosítva), és a visszafejtés
 * a böngészőben történik az admin által beillesztett moderációs privát kulccsal – az sosem megy a szerverre.
 * A kulcs és a visszafejtett szöveg csak memóriában él; az ablak elhagyásakor törlődik.
 */
export default function ReportDetail() {
  const { t } = useTranslation();
  const toast = useToast();
  const { id } = useParams<{ id: string }>();
  const { data, error, loading, reload } = useApi<Detail>(`/api/admin/reports/${id}`);
  const [key, setKey] = useState("");
  const [result, setResult] = useState<DecryptResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [decision, setDecision] = useState<"reviewed" | "dismissed" | "actioned" | null>(null);
  const [reason, setReason] = useState("");
  const [suspend, setSuspend] = useState(false);
  // A kulcs és a visszafejtett tartalom csak komponens-állapotban él: az oldal elhagyásakor megszűnik.

  async function view() {
    setBusy(true);
    try {
      const content = await api<ReportedContent>(`/api/admin/reports/${id}/content`);
      setResult(decryptReported(content, key));
      setKey("");
    } catch (e) {
      if (e instanceof ApiClientError) toast("error", e.code === "GRANT_EXPIRED" ? t("reports.grantExpired") : e.message);
      else toast("error", t("reports.decryptFailed"));
      reload();
    } finally { setBusy(false); }
  }

  async function decide() {
    if (!decision) return;
    setBusy(true);
    try {
      await api(`/api/admin/reports/${id}/decision`, { body: { decision, reason, suspendTarget: decision === "actioned" && suspend } });
      setDecision(null); setReason(""); reload();
    } catch (e) { toast("error", e instanceof ApiClientError ? e.message : t("common.error")); }
    finally { setBusy(false); }
  }

  return (
    <>
      <PageHeader title={data ? `#${data.id.slice(-6)}` : t("reports.title")} back="/admin/reports" />
      {error && <ErrorState message={error.status === 404 ? t("common.empty") : t("common.error")} onRetry={reload} />}
      {loading && !data && <Skeleton className="h-48" />}
      {data && (
        <div className="grid gap-3 lg:grid-cols-2">
          <Card className="flex flex-col gap-2 text-sm">
            <div className="flex items-center justify-between"><span className="text-muted">{t("users.status")}</span><Pill tone={reportTone(data.status)}>{t(`status.${data.status}`)}</Pill></div>
            <div className="flex justify-between"><span className="text-muted">{t("reports.reporter")}</span><span className="break-all">{data.reporter ?? "—"}</span></div>
            <div className="flex justify-between"><span className="text-muted">{t("reports.target")}</span><span className="break-all">{data.target ?? "—"}</span></div>
            <div className="flex justify-between"><span className="text-muted">{t("reports.reason")}</span><span>{data.reason}</span></div>
            {data.note && <div><span className="text-muted">{t("reports.note")}</span><p className="mt-1 rounded-lg bg-alt p-2">{data.note}</p></div>}
            <div className="flex justify-between"><span className="text-muted">{t("reports.createdAt")}</span><span>{fmt(data.createdAt)}</span></div>
            {data.message && <div className="flex justify-between"><span className="text-muted">{t("reports.message")}</span><span>{data.message.type} · {fmt(data.message.sentAt)}</span></div>}
            {data.status === "open" && (
              <div className="mt-2 flex flex-wrap gap-2 border-t border-line pt-3">
                <Button tone="secondary" onClick={() => setDecision("dismissed")}>{t("reports.dismiss")}</Button>
                <Button tone="secondary" onClick={() => setDecision("reviewed")}>{t("reports.review")}</Button>
                <Button tone="danger" onClick={() => setDecision("actioned")}>{t("reports.action")}</Button>
              </div>
            )}
          </Card>

          <Card className="flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <p className="flex items-center gap-2 font-semibold"><KeyRound size={18} className="text-accent" />{t("reports.viewContent")}</p>
              <Pill tone={grantTone(data.grant)}>{t(`status.${data.grant === "valid" ? "valid" : data.grant === "expired" ? "expired" : "none"}`)}</Pill>
            </div>
            {data.grant === "none" && <p className="flex items-center gap-2 text-sm text-muted"><EyeOff size={16} />{t("reports.noGrant")}</p>}
            {data.grant === "expired" && <p className="flex items-center gap-2 text-sm text-danger"><ShieldAlert size={16} />{t("reports.grantExpired")}</p>}
            {data.grant === "valid" && !result && (
              <>
                <p className="text-sm text-muted">{t("reports.pasteKey")}</p>
                <Field label={t("reports.keyPh")} type="password" autoComplete="off" spellCheck={false} value={key} onChange={(e) => setKey(e.target.value)} />
                <p className="flex items-center gap-2 text-xs text-muted"><ShieldAlert size={14} />{t("reports.logged")}</p>
                <Button icon={<Unlock size={18} />} loading={busy} disabled={key.trim().length < 20} onClick={view}>{t("reports.decrypt")}</Button>
              </>
            )}
            <AnimatePresence>
              {result && (
                <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} transition={{ duration: 0.22 }} className="overflow-hidden">
                  <div className="rounded-xl border border-line bg-alt p-3">
                    {/* A tartalom nem másolható gombbal; csak megjelenítés. */}
                    <p className="whitespace-pre-wrap break-words select-text">{result.text}</p>
                  </div>
                  <div className="mt-2 flex items-center justify-between">
                    {result.signatureValid === true && <Pill tone="success" icon={<ShieldCheck size={14} />}>{t("reports.sigOk")}</Pill>}
                    {result.signatureValid === false && <Pill tone="danger" icon={<X size={14} />}>{t("reports.sigBad")}</Pill>}
                    <Button tone="secondary" icon={<EyeOff size={16} />} onClick={() => setResult(null)}>{t("reports.clear")}</Button>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </Card>
        </div>
      )}
      <Modal open={decision !== null} onClose={() => setDecision(null)} title={t("reports.decision")}>
        <div className="flex flex-col gap-3">
          <Field label={t("common.reason")} value={reason} onChange={(e) => setReason(e.target.value)} maxLength={300} />
          {decision === "actioned" && (
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={suspend} onChange={(e) => setSuspend(e.target.checked)} className="size-5 accent-[var(--accent)]" />{t("reports.suspendTarget")}</label>
          )}
          <div className="flex justify-end gap-2">
            <Button tone="secondary" onClick={() => setDecision(null)}>{t("common.cancel")}</Button>
            <Button loading={busy} disabled={reason.trim().length < 3} icon={<CheckCircle2 size={18} />} onClick={decide}>{t("common.confirm")}</Button>
          </div>
        </div>
      </Modal>
    </>
  );
}
