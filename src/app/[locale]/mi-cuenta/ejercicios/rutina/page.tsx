import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { isLocale } from "@/i18n/config";
import { getCurrentUser } from "@/lib/data/queries";
import { readData } from "@/lib/data/read-result";
import { getMyRoutine } from "@/lib/exercises/queries";
import { RoutineView } from "@/components/exercises/routine-view";
import { ExerciseAttribution } from "@/components/exercises/attribution";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  if (!isLocale(locale)) return {};
  return { title: "Mi rutina", robots: { index: false, follow: false } };
}

export default async function MyRoutinePage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!isLocale(locale)) redirect("/es");

  const user = await getCurrentUser();
  if (!user) redirect(`/${locale}/ingresar`);

  const result = await readData(() => getMyRoutine());

  return (
    <div className="container-x space-y-6 py-6">
      <header className="space-y-2">
        <Link href={`/${locale}/mi-cuenta/ejercicios`} className="text-xs font-semibold text-fog hover:text-ink">
          ← Biblioteca
        </Link>
        <h1 className="display-xl text-[1.75rem] sm:text-[2.25rem]">Mi rutina</h1>
        <p className="max-w-2xl text-sm leading-relaxed text-fog">
          Los ejercicios que guardaste para tu sesión, con sus series y
          descansos. Es tu lista personal: la rutina que te asigna tu entrenador
          se ve en «Mi progreso» y no se mezcla con esta.
        </p>
      </header>

      {!result.ok ? (
        <div className="rounded-2xl border border-alert/40 bg-card p-5">
          <p className="font-semibold text-alert">No pudimos leer tu rutina</p>
          <p className="mt-1 text-sm text-fog">
            No es que esté vacía: es que la lectura falló. Volvé a intentarlo en un momento.
          </p>
          <p className="mt-2 text-xs text-fog">Código: {result.code}</p>
        </div>
      ) : (
        <RoutineView items={result.data.items} locale={locale} />
      )}

      <footer className="border-t border-line pt-4">
        <ExerciseAttribution />
      </footer>
    </div>
  );
}
