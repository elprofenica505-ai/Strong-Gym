import type { Metadata } from "next";
import { redirect } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Clock, Mail, Phone, Wallet } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { getAccountsReceivable, getCurrentUser } from "@/lib/data/queries";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { formatMoney } from "@/components/admin/cash-panel";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  return {
    title: "Cuentas por cobrar",
    robots: { index: false, follow: false },
  };
}

export default async function CuentasPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!isSupabaseConfigured) {
    return (
      <Placeholder
        title="Cuentas por cobrar"
        message="Conectá Supabase para ver quién te debe y cuántos días lleva de mora."
        locale={locale}
      />
    );
  }
  const user = await getCurrentUser();
  if (!user || (user.role !== "admin" && user.role !== "staff")) {
    redirect(`/${locale}/mi-cuenta`);
  }

  const rows = await getAccountsReceivable();
  const totalOwed = rows.reduce((acc, r) => acc + r.totalOwedNio, 0);

  return (
    <div className="space-y-6">
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
            Caja · Cuentas por cobrar
          </span>
          <h1 className="display-xl mt-2 text-[1.75rem] sm:text-[2.25rem]">Quién te debe</h1>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <Stat label="Socios con deuda" value={String(rows.length)} />
        <Stat label="Total adeudado" value={formatMoney(totalOwed)} />
        <Stat
          label="Más antiguo"
          value={
            rows[0]
              ? `${rows[0].daysOverdue} días`
              : "—"
          }
        />
      </div>

      {rows.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-line bg-card py-12 text-center text-[0.875rem] text-fog">
          No hay cuentas pendientes. 🎉
        </p>
      ) : (
        <ul className="space-y-2.5">
          {rows.map((r) => (
            <li
              key={r.memberId}
              className="grid gap-3 rounded-2xl border border-line bg-card p-4 sm:grid-cols-[1fr,auto] sm:items-center"
            >
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="truncate text-[0.9375rem] font-semibold text-ink">{r.fullName}</p>
                  {r.daysOverdue > 0 && (
                    <Badge className="border-alert/40 bg-card text-alert">
                      {r.daysOverdue} días de mora
                    </Badge>
                  )}
                </div>
                <div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1 text-[0.75rem] text-fog">
                  <span className="inline-flex items-center gap-1">
                    <Mail className="size-3" /> {r.email}
                  </span>
                  {r.phone && (
                    <span className="inline-flex items-center gap-1">
                      <Phone className="size-3" /> {r.phone}
                    </span>
                  )}
                  <span className="inline-flex items-center gap-1">
                    <Clock className="size-3" />
                    {r.invoicesOpen} factura{r.invoicesOpen === 1 ? "" : "s"}
                  </span>
                </div>
              </div>
              <div className="text-right">
                <p className="font-mono text-[1.0625rem] font-semibold text-brand tabular-nums">
                  {formatMoney(r.totalOwedNio)}
                </p>
                <p className="mt-0.5 text-[0.6875rem] text-fog">
                  Vence: {r.oldestDue ?? "—"}
                </p>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-line bg-card p-4">
      <p className="text-[0.6875rem] font-semibold tracking-[0.14em] text-fog uppercase">{label}</p>
      <p className="display-xl mt-2 text-[1.375rem] leading-none text-brand">{value}</p>
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
