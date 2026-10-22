import type { Metadata } from "next";
import { LegalDocumentView } from "@/components/legal/legal-document";
import { TERMS } from "@/lib/legal/texts";
import { isLocale, type Locale } from "@/i18n/config";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale: raw } = await params;
  const locale: Locale = isLocale(raw) ? raw : "es";
  return { title: TERMS[locale].title, robots: { index: true, follow: true } };
}

export default async function TermsPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale: raw } = await params;
  const locale: Locale = isLocale(raw) ? raw : "es";
  return <LegalDocumentView doc={TERMS[locale]} locale={locale} />;
}
