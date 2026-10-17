import { FinanceUnavailable } from "@/components/admin/finance-unavailable";
import { readFinance } from "@/lib/finance/read-result";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Plus, Receipt, Wallet } from "lucide-react";
import { getCurrentUser, getExpenseCategories } from "@/lib/data/queries";
import { isSupabaseConfigured } from "@/lib/supabase/env";

export async function generateMetadata(): Promise<Metadata> {
  return {
    title: "Gastos",
    robots: { index: false, follow: false },
  };
}

export default async function GastosPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!isSupabaseConfigured) {
    return (
      <Placeholder
        title="Gastos"
        message="Conectá Supabase para registrar alquiler, sueldos, servicios y mantener el P&L al día."
        locale={locale}
      />
    );
  }
  const user = await getCurrentUser();
  if (!user || (user.role !== "admin" && user.role !== "staff")) {
    redirect(`/${locale}/mi-cuenta`);
  }

  const result = await readFinance(() => getExpenseCategories());
  if (!result.ok)
    return (
      <FinanceUnavailable
        locale={locale}
        code={result.code}
        message={result.message}
      />
    );
  const categories = result.data;

  return (
    <div className="container-x min-w-0 space-y-6 py-6">
      <div className="flex items-center gap-3">
        <Link
          href={`/${locale}/panel`}
          className="grid size-10 place-items-center rounded-full border border-line text-mist transition-colors hover:border-brand hover:text-ink"
        >
          <ArrowLeft className="size-4" />
        </Link>
        <div>
          <span className="eyebrow">
            <span className="h-px w-6 bg-brand" aria-hidden="true" />
            Caja · Gastos
          </span>
          <h1 className="display-xl mt-2 text-[1.75rem] sm:text-[2.25rem]">
            Categorías de gastos
          </h1>
        </div>
      </div>

      <p className="max-w-2xl text-[0.875rem] leading-relaxed text-fog">
        Cuando registrás un egreso desde el panel, lo encajás en una de estas
        categorías. Cada una alimenta los reportes mensuales para que sepas a
        dónde se va la plata.
      </p>

      <ul className="grid gap-2.5 sm:grid-cols-2">
        {categories.map((c) => (
          <li
            key={c.id}
            className="flex items-center gap-3 rounded-2xl border border-line bg-card p-4"
          >
            <span className="grid size-10 place-items-center rounded-xl bg-brand-soft text-brand-300">
              <Receipt className="size-4" />
            </span>
            <div className="min-w-0">
              <p className="break-words text-[0.875rem] font-semibold text-ink">
                {c.nameEs}
              </p>
              <p className="break-all text-[0.6875rem] text-fog uppercase tracking-wider">
                {c.slug}
              </p>
            </div>
          </li>
        ))}
      </ul>

      <div className="rounded-2xl border border-dashed border-line bg-card-2 p-6 text-center">
        <Plus className="mx-auto size-6 text-fog" />
        <p className="mt-2 text-[0.8125rem] text-fog">
          El formulario para registrar gastos todavía no está implementado en
          esta pantalla. Tener Supabase conectado no lo habilita
          automáticamente.
        </p>
      </div>
    </div>
  );
}

function Placeholder({
  title,
  message,
  locale,
}: {
  title: string;
  message: string;
  locale: string;
}) {
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <Link
          href={`/${locale}/panel`}
          className="grid size-10 place-items-center rounded-full border border-line text-mist transition-colors hover:border-brand hover:text-ink"
        >
          <ArrowLeft className="size-4" />
        </Link>
        <h1 className="display-xl text-[1.75rem] sm:text-[2.25rem]">{title}</h1>
      </div>
      <div className="rounded-2xl border border-dashed border-brand/35 bg-brand-soft p-6 text-center">
        <Wallet className="mx-auto size-8 text-brand-300" />
        <p className="mt-3 text-[0.875rem] text-fog">{message}</p>
      </div>
    </div>
  );
}
