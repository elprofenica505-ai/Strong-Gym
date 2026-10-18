import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import {
  ArrowRight,
  Database,
  FileSpreadsheet,
  Trash2,
  Upload,
} from "lucide-react";
import { getCurrentUser } from "@/lib/data/queries";
import { DEMO_MODE } from "@/lib/supabase/env";

export async function generateMetadata(): Promise<Metadata> {
  return {
    title: "Herramientas",
    robots: { index: false, follow: false },
  };
}

export default async function HerramientasPage({
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
      <div>
        <span className="eyebrow">
          <span className="h-px w-6 bg-brand" aria-hidden="true" />
          Panel · Herramientas
        </span>
        <h1 className="display-xl mt-3 text-[1.75rem] sm:text-[2.25rem]">
          Carga y entrega de datos
        </h1>
        <p className="mt-2 max-w-2xl text-[0.875rem] leading-relaxed text-fog">
          Cuando el dueño te pase los datos reales, desde acá los cargás al
          sistema. La limpieza de los datos de ejemplo se prepara con respaldo y
          SQL revisado, sólo al terminar las pruebas y con aprobación del dueño.
        </p>
      </div>

      {isDemo && (
        <div className="rounded-2xl border border-brand/35 bg-brand-soft p-4 text-[0.875rem] text-brand-300">
          Estás en <strong>modo demo</strong>. La importación se activa cuando
          Supabase está conectado. En modo demo los datos viven en el navegador
          y no se tocan.
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-2">
        <ToolCard
          href={`/${locale}/panel/importar`}
          Icon={FileSpreadsheet}
          title="Importar clientes desde CSV"
          description="Cargá todos los clientes del gimnasio de una sola vez. Bajá la plantilla, llenala y subila."
          cta="Abrir importador"
        />
        <ToolCard
          href={`/${locale}/panel/reset`}
          Icon={Trash2}
          title="Preparar limpieza final"
          description="Revisá los requisitos para retirar datos de prueba sin borrar el sistema ni alterar saldos reales."
          cta="Ver requisitos de entrega"
        />
        <ToolCard
          href={`/${locale}/panel/ayuda`}
          Icon={Upload}
          title="Guía paso a paso"
          description="Recibí los datos del dueño, armá el Excel/CSV, importá, y empezá a usar el sistema."
          cta="Ver la guía"
        />
        <ToolCard
          href={`/${locale}/panel`}
          Icon={Database}
          title="Volver al panel"
          description="Resumen, reservas, mensajes, caja y cuentas."
          cta="Ir al panel"
        />
      </div>
    </div>
  );
}

function ToolCard({
  href,
  Icon,
  title,
  description,
  cta,
}: {
  href: string;
  Icon: React.ComponentType<{ className?: string }>;
  title: string;
  description: string;
  cta: string;
}) {
  return (
    <Link
      href={href}
      className="group flex flex-col gap-3 rounded-2xl border border-line bg-card p-5 transition-colors hover:border-brand"
    >
      <span className="grid size-10 place-items-center rounded-xl bg-brand-soft text-brand-300">
        <Icon className="size-5" />
      </span>
      <h2 className="text-[1.0625rem] font-semibold text-ink">{title}</h2>
      <p className="text-[0.8125rem] leading-relaxed text-fog">{description}</p>
      <span className="mt-auto inline-flex items-center gap-1.5 text-[0.8125rem] font-semibold text-brand-300">
        {cta}
        <ArrowRight className="size-3.5 transition-transform group-hover:translate-x-0.5" />
      </span>
    </Link>
  );
}
