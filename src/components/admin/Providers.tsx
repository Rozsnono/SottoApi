"use client";
import { MotionConfig } from "framer-motion";
import { I18nextProvider } from "react-i18next";
import { useMemo, type ReactNode } from "react";
import { initI18n, type Lang } from "@/lib/admin/i18n";
import { ToastProvider } from "./ui";

/** Admin kliens-szolgáltatók: i18n (HU/EN), Framer Motion (reduced-motion követés), toast. */
export function Providers({ lang, children }: { lang: Lang; children: ReactNode }) {
  const i18n = useMemo(() => initI18n(lang), [lang]);
  return (
    <I18nextProvider i18n={i18n}>
      <MotionConfig reducedMotion="user">
        <ToastProvider>{children}</ToastProvider>
      </MotionConfig>
    </I18nextProvider>
  );
}
