import { notFound, redirect } from "next/navigation";
import { isLocale } from "@/i18n/config";

/** Alias histórico: siempre pasa por el mismo guard que /panel. */
export default async function AdminAlias({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  redirect(`/${locale}/panel`);
}
