"use client";
import { Logo } from "./Logo";
import { LayoutDashboard, Users, Flag, ScrollText, ShieldCheck, HardDrive, MoreHorizontal, LogOut, Globe } from "lucide-react";
import { motion } from "framer-motion";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { api } from "@/lib/admin/api";
import { cx, IconButton, Modal } from "./ui";

const ITEMS = [
  { href: "/admin", key: "dashboard", Icon: LayoutDashboard, exact: true },
  { href: "/admin/users", key: "users", Icon: Users },
  { href: "/admin/reports", key: "reports", Icon: Flag },
  { href: "/admin/audit", key: "audit", Icon: ScrollText },
  { href: "/admin/moderation-log", key: "moderationLog", Icon: ShieldCheck },
  { href: "/admin/settings/media", key: "media", Icon: HardDrive },
] as const;

/** Nyelv megjegyzése sütiben (a szerver ebből választja a kezdő nyelvet) és a dokumentum `lang` attribútuma. */
function persistLang(l: "hu" | "en"): void {
  document.cookie = `sotto_lang=${l}; Path=/; Max-Age=31536000; SameSite=Lax`;
  document.documentElement.lang = l;
}

/**
 * Admin keret (design 05): asztalon ikonsín (tooltip + aria-label), mobilon alsó tab bar 4 ikon + „Több”.
 * A nyelvváltó és a kijelentkezés a fejlécben/„Több” menüben van.
 */
export function Shell({ children }: { children: ReactNode }) {
  const { t, i18n } = useTranslation();
  const path = usePathname();
  const router = useRouter();
  const [more, setMore] = useState(false);

  const active = (i: (typeof ITEMS)[number]) => ("exact" in i && i.exact ? path === i.href : path.startsWith(i.href));
  const setLang = (l: "hu" | "en") => {
    persistLang(l);
    void i18n.changeLanguage(l);
  };
  const logout = async () => {
    try { await api("/api/admin/logout", { method: "POST", body: {} }); } finally { router.replace("/admin/login"); }
  };
  const LangToggle = (
    <div role="group" aria-label={t("common.language")} className="inline-flex items-center gap-1 rounded-xl border border-line bg-surface p-1 text-sm font-semibold">
      <Globe size={16} className="mx-1 text-muted" aria-hidden="true" />
      {(["hu", "en"] as const).map((l) => (
        <button key={l} type="button" onClick={() => setLang(l)} aria-pressed={i18n.language === l} className={cx("h-9 min-w-9 rounded-lg px-2", i18n.language === l ? "bg-accent text-onaccent" : "text-muted hover:bg-alt")}>{l.toUpperCase()}</button>
      ))}
    </div>
  );

  return (
    <div className="min-h-dvh lg:pl-[76px]">
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-[70] focus:rounded-lg focus:bg-accent focus:px-3 focus:py-2 focus:text-onaccent">Skip</a>
      {/* Asztali ikonsín */}
      <nav aria-label="Admin" className="fixed inset-y-0 left-0 z-30 hidden w-[76px] flex-col items-center gap-2 border-r border-line bg-surface py-4 lg:flex">
        <Logo size={40} className="mb-3" />
        {ITEMS.map((i) => (
          <Link key={i.href} href={i.href} aria-label={t(`nav.${i.key}`)} title={t(`nav.${i.key}`)} aria-current={active(i) ? "page" : undefined} className={cx("relative grid size-12 place-items-center rounded-xl", active(i) ? "bg-soft text-accent" : "text-muted hover:bg-alt")}>
            <i.Icon size={22} strokeWidth={active(i) ? 2.25 : 1.75} />
          </Link>
        ))}
        <div className="mt-auto">
          <IconButton label={t("common.logout")} onClick={logout}><LogOut size={20} /></IconButton>
        </div>
      </nav>

      <header className="sticky top-0 z-20 flex items-center justify-end gap-2 border-b border-line bg-bg/90 px-4 py-2 backdrop-blur lg:px-8">
        <span className="mr-auto font-display text-lg font-bold text-accent lg:hidden" aria-hidden="true">sotto</span>
        <div className="hidden sm:block">{LangToggle}</div>
      </header>

      <main id="main" className="mx-auto w-full max-w-6xl px-4 pb-28 pt-5 lg:px-8 lg:pb-10">
        <motion.div key={path} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.22, ease: [0.2, 0, 0, 1] }}>
          {children}
        </motion.div>
      </main>

      {/* Mobil alsó tab bar */}
      <nav aria-label="Admin" className="fixed inset-x-0 bottom-0 z-30 flex border-t border-line bg-surface pb-[env(safe-area-inset-bottom)] lg:hidden">
        {ITEMS.slice(0, 4).map((i) => (
          <Link key={i.href} href={i.href} aria-label={t(`nav.${i.key}`)} aria-current={active(i) ? "page" : undefined} className={cx("flex min-h-14 flex-1 flex-col items-center justify-center gap-1", active(i) ? "text-accent" : "text-muted")}>
            <i.Icon size={22} strokeWidth={active(i) ? 2.25 : 1.75} />
            {active(i) && <span className="size-1 rounded-full bg-accent" />}
          </Link>
        ))}
        <button type="button" aria-label="…" onClick={() => setMore(true)} className="flex min-h-14 flex-1 items-center justify-center text-muted"><MoreHorizontal size={22} /></button>
      </nav>

      <Modal open={more} onClose={() => setMore(false)} title="Sotto">
        <div className="flex flex-col gap-2">
          {ITEMS.slice(4).map((i) => (
            <Link key={i.href} href={i.href} onClick={() => setMore(false)} className="flex h-12 items-center gap-3 rounded-xl border border-line px-3"><i.Icon size={20} className="text-accent" />{t(`nav.${i.key}`)}</Link>
          ))}
          <div className="py-2">{LangToggle}</div>
          <button type="button" onClick={logout} className="flex h-12 items-center gap-3 rounded-xl border border-line px-3 text-danger"><LogOut size={20} />{t("common.logout")}</button>
        </div>
      </Modal>
    </div>
  );
}
