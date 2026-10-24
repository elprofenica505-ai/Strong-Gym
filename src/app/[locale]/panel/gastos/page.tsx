import { isFinanceRole } from "@/lib/auth/current-user";
import { MovementForm } from "@/components/admin/movement-form";
import { FinanceUnavailable } from "@/components/admin/finance-unavailable";
import { readFinance } from "@/lib/finance/read-result";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Receipt, Wallet } from "lucide-react";
import {
  getCashierPermissions,
  getCurrentUser,
  getExpenseCategories,
} from "@/lib/data/queries";
import { DEMO_MODE } from "@/lib/supabase/env";

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
  if (DEMO_MODE) {
    return (
      <Placeholder
        title="Gastos"
        message="Conectá Supabase para registrar alquiler, sueldos, servicios y mantener el P&L al día."
        locale={locale}
      />
    );
  }
  const user = await getCurrentUser();
  if (!user || !isFinanceRole(user.role)) {
    redirect(`/${locale}/mi-cuenta`);
  }

  const permissionResult = await readFinance(() => getCashierPermissions());
  if (!permissionResult.ok)
    return (
      <FinanceUnavailable
        locale={locale}
        code={permissionResult.code}
        message={permissionResult.message}
      />
    );
  if (!permissionResult.data.expenses) {
    return (
      <Placeholder
        title="Gastos"
        message="El administrador todavía no activó los gastos para caja. Hasta que lo active, no podés abrir ni registrar gastos desde aquí."
        locale={locale}
      />
    );
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
            Gastos y comprobantes
          </h1>
        </div>
      </div>

      <p className="max-w-2xl text-[0.875rem] leading-relaxed text-fog">
        Registrá un egreso con categoría, cuenta, método y moneda. El registro
        actualiza el saldo y guarda su comprobante en una misma operación. No lo
        uses para transferencias entre cuentas.
      </p>

      <MovementForm kind="expense" locale={locale} />
      <details className="rounded-xl border border-line p-4">
        <summary className="cursor-pointer text-brand-300">
          Ver categorías disponibles
        </summary>
        <ul className="mt-3 grid gap-2.5 sm:grid-cols-2">
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
      </details>
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
