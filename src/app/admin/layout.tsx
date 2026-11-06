import { cookies } from "next/headers";
import { Suspense } from "react";
import { Providers } from "@/components/admin/Providers";
import type { Lang } from "@/lib/admin/i18n";

/** A nyelvet a `sotto_lang` süti adja (alap: magyar). A sütit olvasó rész Suspense-ben van (Cache Components). */
async function LangProviders({ children }: { children: React.ReactNode }) {
  const c = (await cookies()).get("sotto_lang")?.value;
  const lang: Lang = c === "en" ? "en" : "hu";
  return <Providers lang={lang}>{children}</Providers>;
}

export default function AdminRootLayout({ children }: { children: React.ReactNode }) {
  return (
    <Suspense fallback={<div className="min-h-dvh" aria-busy="true" />}>
      <LangProviders>{children}</LangProviders>
    </Suspense>
  );
}
