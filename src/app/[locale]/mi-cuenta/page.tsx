import { readData } from "@/lib/data/read-result";
import { DataUnavailable } from "@/components/ui/data-unavailable";
import { ClientPass } from "@/components/crm/client-pass";
import type { Metadata } from "next";
import { AccountDashboard } from "@/components/account/account-dashboard";
import { SectionHeading } from "@/components/ui/section";
import { getDictionary } from "@/i18n/dictionaries";
import { isLocale, type Locale } from "@/i18n/config";
import { getCurrentUser, getMyBookings, getPlans, getMyAssignedPlan } from "@/lib/data/queries";
import { getMyProgress } from "@/lib/data/progress-queries";
import { MyProgress } from "@/components/account/my-progress";
import { MfaSetup } from "@/components/auth/mfa-setup";
import { isStaffRole } from "@/lib/auth/current-user";
import { ButtonLink } from "@/components/ui/button";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  if (!isLocale(locale)) return {};
  const dict = getDictionary(locale);

  return {
    title: dict.account.title,
    description: dict.account.subtitle,
    robots: { index: false, follow: false },
  };
}

export default async function AccountPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale: rawLocale } = await params;
  const locale: Locale = isLocale(rawLocale) ? rawLocale : "es";
  const dict = getDictionary(locale);

  const user = await getCurrentUser();
  const result = await readData(() =>
    Promise.all([
      user ? getMyBookings(user.id) : Promise.resolve([]),
      getPlans(),
    ]),
  );
  if (!result.ok)
    return (
      <section className="container-x py-12">
        <DataUnavailable locale={locale} code={result.code} />
      </section>
    );
  const [bookings, plans] = result.data;
  // Lectura separada: un fallo de plan no convierte el dato en «sin plan»
  // ni impide consultar reservas. El RPC sólo consulta la identidad de la sesión.
  const assignedPlan = user ? await readData(getMyAssignedPlan) : null;
  // Progreso propio (00040). Si la consulta falla, el cliente ve un aviso, no «sin datos».
  const myProgress = user && !isStaffRole(user.role) ? await readData(getMyProgress) : null;

  return (
    <>
      <section className="relative overflow-hidden border-b border-brand/25 bg-cloud pt-12 pb-10 sm:pt-16 sm:pb-12 lg:pt-20">
        <div
          className="absolute inset-0 bg-grid opacity-50"
          aria-hidden="true"
        />
        <div className="container-x relative">
          <SectionHeading
            eyebrow={dict.nav.account}
            title={dict.account.title}
            subtitle={dict.account.subtitle}
          />
        </div>
      </section>

      {user && isStaffRole(user.role) && user.mfa !== "ok" && (
        <section className="container-x pt-10">
          <MfaSetup locale={locale} role={user.role ?? ""} initialState={user.mfa} />
        </section>
      )}

      {user && isStaffRole(user.role) ? (
        // El personal (entrenador, caja, administración) no es cliente: no ve pase, reservas ni plan de socio.
        <section className="py-10 sm:py-12 lg:py-14">
          <div className="container-x">
            <div className="flex max-w-xl flex-col gap-4 rounded-2xl border border-line bg-card p-6">
              <h2 className="text-[1.0625rem] font-semibold text-ink">Cuenta de personal</h2>
              <p className="text-[0.875rem] leading-relaxed text-mist">
                Tu cuenta es de personal, no de cliente: no tiene pase ni reservas.{user.role === "trainer" ? " Tus clientes asignados y su asistencia están en Mis clientes." : " Tu acceso está en el panel de gestión."}
              </p>
              <div>
                <ButtonLink href={`/${locale}${user.role === "trainer" ? "/panel/entrenador" : "/panel"}`} size="lg">
                  {user.role === "trainer" ? "Ir a Mis clientes" : "Ir al panel"}
                </ButtonLink>
              </div>
            </div>
          </div>
        </section>
      ) : (
        <>
          <ClientPass />
          <section className="py-10 sm:py-12 lg:py-14">
            <div className="container-x">
              <AccountDashboard initialBookings={bookings} plans={plans}
                accountPlan={user && assignedPlan ? { userId: user.id, ...assignedPlan } : null} />
            </div>
          </section>
          <section className="pb-10 sm:pb-12 lg:pb-14">
            <div className="container-x">
              {myProgress && myProgress.ok ? (
                <MyProgress data={myProgress.data} />
              ) : myProgress && !myProgress.ok ? (
                <p className="rounded-2xl border border-line bg-card p-6 text-[0.9375rem] text-mist">
                  Tu progreso no se pudo cargar en este momento. Intenta de nuevo más tarde.
                </p>
              ) : null}
            </div>
          </section>
        </>
      )}
    </>
  );
}
