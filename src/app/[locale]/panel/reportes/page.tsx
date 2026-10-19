import { isAdminRole } from "@/lib/auth/current-user";
import { FinanceUnavailable } from "@/components/admin/finance-unavailable";
import { FinanceReports } from "@/components/admin/finance-reports";
import { loadFinanceReport } from "@/lib/reports/load";
import { managuaDay } from "@/lib/reports/finance-report";
import { readFinance } from "@/lib/finance/read-result";
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { getCurrentUser } from "@/lib/data/queries";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { DEMO_MODE } from "@/lib/supabase/env";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  return {
    title: "Reportes",
    robots: { index: false, follow: false },
  };
}

export default async function ReportesPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (DEMO_MODE) {
    return (
      <Placeholder
        title="Reportes"
        message="Conectá Supabase para ver el cierre del día, el comparativo mensual, los pagos pendientes y las comisiones. En modo demo no se muestran cifras inventadas."
        locale={locale}
      />
    );
  }
  const user = await getCurrentUser();
  if (!user || !isAdminRole(user.role)) {
    redirect(`/${locale}/mi-cuenta`);
  }

  const supabase = await getSupabaseServerClient();
  const result = supabase
    ? await readFinance(() => loadFinanceReport(supabase))
    : { ok: false as const, code: "FIN_REPORT_UNAVAILABLE", message: "No hay conexión con la base de datos." };

  return (
    <div className="container-x min-w-0 space-y-6 py-6">
      <div className="flex items-center gap-3">
        <Link
          href={`/${locale}/panel`}
          className="grid size-10 place-items-center rounded-full border border-line text-mist transition-colors hover:border-brand hover:text-ink"
          aria-label="Volver al inicio del panel"
        >
          <ArrowLeft className="size-4" />
        </Link>
        <div>
          <span className="eyebrow">
            <span className="h-px w-6 bg-brand" aria-hidden="true" />
            Finanzas · Reportes
          </span>
          <h1 className="display-xl mt-2 text-[1.75rem] sm:text-[2.25rem]">Reportes del gimnasio</h1>
        </div>
      </div>

      <p className="text-sm text-fog">
        Cada cifra sale de los movimientos guardados. Tocá cualquier ingreso, gasto, cliente o mes para ver su tarjeta de detalle.
        El botón «Exportar Excel maestro» descarga siempre el mismo libro, con todos los datos al día.
      </p>

      {result.ok ? (
        <FinanceReports data={result.data} today={managuaDay(new Date())} />
      ) : (
        <FinanceUnavailable locale={locale} code={result.code} message={result.message} />
      )}
    </div>
  );
}

function Placeholder({ title, message, locale }: { title: string; message: string; locale: string }) {
  return (
    <div className="container-x py-10">
      <Link href={`/${locale}/panel`} className="text-sm text-brand">← Volver al panel</Link>
      <h1 className="display-xl mt-4 text-2xl">{title}</h1>
      <p className="mt-3 text-fog">{message}</p>
    </div>
  );
}
