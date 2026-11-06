"use client";
import { KeyRound, LogIn, ShieldCheck } from "lucide-react";
import { motion } from "framer-motion";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { api, ApiClientError } from "@/lib/admin/api";
import { Button, Field } from "@/components/admin/ui";

/** Admin belépés (A01): jelszó + opcionális TOTP. Hibánál általános üzenet; 429-nél visszaszámláló szöveg. */
export default function LoginPage() {
  const { t } = useTranslation();
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [totp, setTotp] = useState("");
  const [showTotp, setShowTotp] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api("/api/admin/login", { body: { password, totp: totp || undefined } });
      router.replace("/admin");
    } catch (err) {
      const e2 = err as ApiClientError;
      if (e2.code === "RATE_LIMITED") setError(t("login.rateLimited", { minutes: Math.max(1, Math.ceil((e2.retryAfterSec ?? 60) / 60)) }));
      else if (e2.code === "UNAUTHORIZED") { setError(t("login.invalid")); setShowTotp(true); }
      else setError(t("common.error"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="grid min-h-dvh place-items-center px-4">
      <motion.form onSubmit={submit} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.22 }} className="w-full max-w-sm rounded-3xl border border-line bg-surface p-6" aria-labelledby="t">
        <div className="mb-5 flex items-center gap-3">
          <div className="grid size-12 place-items-center rounded-2xl bg-accent text-onaccent"><ShieldCheck size={26} /></div>
          <div>
            <p className="font-display text-xl font-bold leading-none">sotto</p>
            <h1 id="t" className="text-sm text-muted">{t("login.title")}</h1>
          </div>
        </div>
        <div className="flex flex-col gap-3">
          <Field label={t("login.password")} icon={<KeyRound size={16} />} type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required autoFocus />
          {showTotp && <Field label={t("login.totp")} inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={totp} onChange={(e) => setTotp(e.target.value)} />}
          {error && <p role="alert" className="text-sm text-danger">{error}</p>}
          <Button type="submit" loading={busy} icon={<LogIn size={18} />}>{t("login.submit")}</Button>
        </div>
      </motion.form>
    </main>
  );
}
