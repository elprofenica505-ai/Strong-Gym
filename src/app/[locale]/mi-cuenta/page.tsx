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
import { NutritionCalculator } from "@/components/nutrition/nutrition-calculator";
import { getClientAttendance } from "@/lib/data/attendance-queries";
import { getMyAgeStatus } from "@/lib/data/age-queries";
import { AttendanceTable } from "@/components/attendance/attendance-table";
import { MfaSetup } from "@/components/auth/mfa-setup";
import { isStaffRole } from "@/lib/auth/current-user";
import { ButtonLink } from "@/components/ui/button";
import Link from "next/link";

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
  const cliente = user ? !isStaffRole(user.role) : false;

  /*
   * Todo lo de la pantalla se pide **a la vez**, no uno detrás de otro (EX-06).
   *
   * Antes eran cinco consultas en fila: reservas y planes, después el plan
   * asignado, después el progreso, después la asistencia y al final la edad.
   * Cada una esperaba a la anterior, así que la pantalla tardaba la suma de
   * las cinco idas y vueltas. Ahora salen juntas y se espera la más lenta: el
   * cliente ve «Mi cuenta» en una sola ida y vuelta.
   *
   * Se mantiene lo que ya estaba bien: cada lectura falla por su cuenta. Un
   * problema con el plan no borra las reservas ni el progreso, y cada bloque
   * muestra su propio aviso.
   */
  const [result, assignedPlan, myProgress, myAttendance, ageResult] = await Promise.all([
    readData(() =>
      Promise.all([
        user ? getMyBookings(user.id) : Promise.resolve([]),
        getPlans(),
      ]),
    ),
    // Lectura separada: un fallo de plan no convierte el dato en «sin plan».
    user ? readData(getMyAssignedPlan) : Promise.resolve(null),
    // Progreso propio (00040). Si falla, el cliente ve un aviso, no «sin datos».
    cliente ? readData(getMyProgress) : Promise.resolve(null),
    cliente ? readData(() => getClientAttendance(null)) : Promise.resolve(null),
    // Menores de 18: cuenta activa, pero sin pase, reservas, progreso, asistencia ni calculadora (00047).
    cliente ? readData(getMyAgeStatus) : Promise.resolve(null),
  ]);

  if (!result.ok)
    return (
      <section className="container-x py-12">
        <DataUnavailable locale={locale} code={result.code} />
      </section>
    );
  const [bookings, plans] = result.data;
  const ageError = ageResult && !ageResult.ok ? ageResult.code : null;
  const ageStatus = ageResult && ageResult.ok ? ageResult.data : null;

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
      ) : ageError !== null ? (
        <section className="container-x py-12">
          <DataUnavailable locale={locale} code={ageError} />
        </section>
      ) : ageStatus === "minor" ? (
        <section className="py-10 sm:py-12 lg:py-14">
          <div className="container-x">
            <div className="flex max-w-xl flex-col gap-4 rounded-2xl border border-line bg-card p-6">
              <h2 className="text-[1.0625rem] font-semibold text-ink">Tu cuenta está activa</h2>
              <p className="text-[0.875rem] leading-relaxed text-mist">
                Esta cuenta es para mayores de 18 años. Mientras tanto no tenés acceso al pase, las reservas, el progreso, la asistencia ni la calculadora. Si tenés dudas, acercate al gimnasio.
              </p>
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
          <section className="pb-6">
            <div className="container-x">
              <Link
                href={`/${locale}/mi-cuenta/ejercicios`}
                className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-line bg-card p-5 transition-colors hover:border-brand"
              >
                <div className="min-w-0">
                  <p className="text-[0.65rem] font-bold tracking-[0.18em] text-brand-300 uppercase">
                    Biblioteca
                  </p>
                  <h2 className="mt-1 text-xl font-bold text-ink">Ejercicios y rutinas</h2>
                  <p className="mt-1 text-sm text-fog">
                    Cómo se hace cada ejercicio, qué músculo trabaja, con qué
                    máquina y cuántas series y repeticiones. Guardá los tuyos en
                    «Mi rutina».
                  </p>
                </div>
                <span className="rounded-full bg-brand px-4 py-2 text-sm font-semibold text-onbrand">
                  Abrir biblioteca
                </span>
              </Link>
            </div>
          </section>
          <section className="pb-10 sm:pb-12 lg:pb-14">
            <div className="container-x">
              {myProgress && myProgress.ok ? (
                <MyProgress data={myProgress.data} />
              ) : myProgress && !myProgress.ok ? (
                <p className="rounded-2xl border border-line bg-card p-6 text-[0.9375rem] text-mist">
                  Tu progreso no se pudo cargar en este momento. Intentá de nuevo más tarde.
                </p>
              ) : null}
              {myAttendance && (myAttendance.ok ? (
                <div className="mt-8"><AttendanceTable data={myAttendance.data} title="Mi asistencia" /></div>
              ) : (
                <p className="mt-8 rounded-2xl border border-line bg-card p-6 text-[0.9375rem] text-mist">
                  Tu asistencia no se pudo cargar en este momento. Intentá de nuevo más tarde.
                </p>
              ))}
              {user && !isStaffRole(user.role) && (
                <div className="mt-8 grid gap-4">
                  <h2 className="text-xl font-bold text-ink">Calculadora, plan nutricional y rutina</h2>
                  <NutritionCalculator mode="client" />
                </div>
              )}
            </div>
          </section>
        </>
      )}
    </>
  );
}
