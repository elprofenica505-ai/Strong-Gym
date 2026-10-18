import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { ResetTool } from "@/components/admin/import-tools";
import { getCurrentUser } from "@/lib/data/queries";
import { DEMO_MODE } from "@/lib/supabase/env";

export async function generateMetadata(): Promise<Metadata> {
  return { title: "Reset", robots: { index: false, follow: false } };
}

export default async function ResetPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const isDemo = DEMO_MODE;
  if (!isDemo) {
    const user = await getCurrentUser();
    if (!user || (user.role !== "admin" && user.role !== "staff")) {
      redirect(`/${locale}/mi-cuenta`);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Link
          href={`/${locale}/panel/herramientas`}
          className="grid size-10 place-items-center rounded-full border border-line text-mist transition-colors hover:border-brand hover:text-ink"
        >
          <ArrowLeft className="size-4" />
        </Link>
        <div>
          <span className="eyebrow">
            <span className="h-px w-6 bg-brand" aria-hidden="true" />
            Herramientas · Entrega
          </span>
          <h1 className="display-xl mt-2 text-[1.75rem] sm:text-[2.25rem]">
            Preparar limpieza final
          </h1>
        </div>
      </div>

      {isDemo ? (
        <div className="rounded-2xl border border-brand/35 bg-brand-soft p-6 text-center text-[0.875rem] text-brand-300">
          Sin una conexión a Supabase no hay datos del servidor para revisar o
          limpiar. Esta pantalla no realiza borrados.
        </div>
      ) : (
        <ResetTool />
      )}
    </div>
  );
}
