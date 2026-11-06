"use client";
import { Activity, Check, FolderOpen, KeyRound, Link2, RotateCw, Smartphone, ShieldAlert } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { api, ApiClientError } from "@/lib/admin/api";
import { useApi } from "@/lib/admin/useApi";
import { Button, Card, ErrorState, Field, Modal, PageHeader, Pill, Skeleton, useToast } from "@/components/admin/ui";

interface Media { configured: boolean; baseUrl: string | null; folder: string | null; phoneKeyMask: string | null; serverKeyMask: string | null; phoneKeyExpiresAt: string | null; version: number; devicesReceived: number; devicesTotal: number }
interface Health { ok: boolean; detail: string; keyFolder?: string | null; keyExpiresAt?: string | null }

/**
 * Média API beállítások (A10). A kulcsok csak írhatók: mentés után maszkoltan látszanak, és sosem jönnek vissza.
 * A telefonos kulcsot a szerver az eszközök publikus kulcsára zárva osztja ki.
 */
export default function MediaSettings() {
  const { t } = useTranslation();
  const toast = useToast();
  const { data, error, loading, reload } = useApi<Media>("/api/admin/settings/media");
  const [baseUrl, setBaseUrl] = useState("");
  const [folder, setFolder] = useState("sotto/media");
  const [phoneKey, setPhoneKey] = useState("");
  const [serverKey, setServerKey] = useState("");
  const [busy, setBusy] = useState(false);
  const [health, setHealth] = useState<Health | null>(null);
  const [rotate, setRotate] = useState(false);
  const [newKey, setNewKey] = useState("");

  // Az űrlap egyszeri előtöltése a mentett értékekkel (render közbeni állapot-igazítás).
  const [seeded, setSeeded] = useState(false);
  if (data?.configured && !seeded) {
    setSeeded(true);
    setBaseUrl(data.baseUrl ?? "");
    setFolder(data.folder ?? "sotto/media");
  }

  async function save() {
    setBusy(true);
    try {
      await api("/api/admin/settings/media", { method: "PUT", body: { baseUrl, folder, ...(phoneKey ? { phoneKey } : {}), ...(serverKey ? { serverKey } : {}) } });
      setPhoneKey(""); setServerKey(""); toast("success", t("media.saved")); reload();
    } catch (e) { toast("error", e instanceof ApiClientError ? e.message : t("common.error")); }
    finally { setBusy(false); }
  }
  async function test() {
    setBusy(true); setHealth(null);
    try { setHealth(await api<Health>("/api/admin/settings/media/test", { body: {} })); }
    catch (e) { setHealth({ ok: false, detail: e instanceof ApiClientError ? e.message : t("media.testFailed") }); }
    finally { setBusy(false); }
  }
  async function doRotate() {
    setBusy(true);
    try { await api("/api/admin/settings/media/rotate", { body: { phoneKey: newKey } }); setNewKey(""); setRotate(false); toast("success", t("media.rotated")); reload(); }
    catch (e) { toast("error", e instanceof ApiClientError ? e.message : t("common.error")); }
    finally { setBusy(false); }
  }

  return (
    <>
      <PageHeader title={t("media.title")} />
      {error && <ErrorState message={t("common.error")} onRetry={reload} />}
      {loading && !data && <Skeleton className="h-64" />}
      {data && (
        <div className="grid gap-3 lg:grid-cols-[1fr_320px]">
          <Card className="flex flex-col gap-4">
            <div role="note" className="flex items-start gap-2 rounded-xl border border-warning/40 bg-alt p-3 text-sm">
              <ShieldAlert size={20} className="mt-0.5 shrink-0 text-warning" aria-hidden="true" /><span>{t("media.scopeWarning")}</span>
            </div>
            {!data.configured && <p className="text-sm text-muted">{t("media.notConfigured")}</p>}
            <Field label={t("media.url")} icon={<Link2 size={16} />} type="url" placeholder="https://…" value={baseUrl} onChange={(e) => setBaseUrl(e.target.value)} />
            <Field label={t("media.folder")} icon={<FolderOpen size={16} />} value={folder} onChange={(e) => setFolder(e.target.value)} />
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label={`${t("media.phoneKey")}${data.phoneKeyMask ? ` (${data.phoneKeyMask})` : ""}`} icon={<Smartphone size={16} />} type="password" autoComplete="off" value={phoneKey} onChange={(e) => setPhoneKey(e.target.value)} hint={t("media.keyHint")} />
              <Field label={`${t("media.serverKey")}${data.serverKeyMask ? ` (${data.serverKeyMask})` : ""}`} icon={<KeyRound size={16} />} type="password" autoComplete="off" value={serverKey} onChange={(e) => setServerKey(e.target.value)} />
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Button icon={<Check size={18} />} loading={busy} disabled={!baseUrl || !folder || (!data.configured && (!phoneKey || !serverKey))} onClick={save}>{t("common.save")}</Button>
              <Button tone="secondary" icon={<Activity size={18} />} disabled={!data.configured || busy} onClick={test}>{t("media.test")}</Button>
              <Button tone="secondary" icon={<RotateCw size={18} />} disabled={!data.configured || busy} onClick={() => setRotate(true)}>{t("media.rotate")}</Button>
            </div>
            {health && (
              <p role="status" className={`flex items-center gap-2 text-sm ${health.ok ? "text-success" : "text-danger"}`}>
                {health.ok ? <Check size={16} /> : <ShieldAlert size={16} />}{health.ok ? t("media.testOk") : health.detail}
              </p>
            )}
          </Card>
          <Card className="flex flex-col gap-3 text-sm">
            <div className="flex items-center justify-between"><span className="text-muted">{t("media.version")}</span><Pill tone="accent">v{data.version}</Pill></div>
            <div className="flex items-center gap-2"><Smartphone size={16} className="text-accent" /><span>{t("media.distributed", { n: data.devicesReceived, total: data.devicesTotal })}</span></div>
            {data.phoneKeyExpiresAt && <div className="flex justify-between"><span className="text-muted">{t("media.expires")}</span><span>{new Date(data.phoneKeyExpiresAt).toLocaleDateString()}</span></div>}
          </Card>
        </div>
      )}
      <Modal open={rotate} onClose={() => setRotate(false)} title={t("media.rotateTitle")}>
        <div className="flex flex-col gap-3">
          <Field label={t("media.phoneKey")} type="password" autoComplete="off" value={newKey} onChange={(e) => setNewKey(e.target.value)} />
          <div className="flex justify-end gap-2"><Button tone="secondary" onClick={() => setRotate(false)}>{t("common.cancel")}</Button><Button loading={busy} disabled={newKey.length < 8} onClick={doRotate}>{t("common.confirm")}</Button></div>
        </div>
      </Modal>
    </>
  );
}
