import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { isLocale, type Locale } from "@/i18n/config";
import { getCurrentUser } from "@/lib/data/queries";
import { readData } from "@/lib/data/read-result";
import { isAdminRole } from "@/lib/auth/current-user";
import { getExerciseCatalog, getExerciseFacets } from "@/lib/exercises/queries";
import {
  BODY_PART_ORDER,
  CATEGORY_LABELS,
  bodyPartLabel,
  DIFFICULTY_LABELS,
  EQUIPMENT_GROUPS,
  equipmentGroupSlugs,
} from "@/lib/exercises/terms";
import { ExerciseCard } from "@/components/exercises/exercise-card";
import { ExerciseAttribution } from "@/components/exercises/attribution";
import { UpdateLibrary } from "@/components/exercises/update-library";
import { cn } from "@/lib/utils";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  if (!isLocale(locale)) return {};
  return { title: "Biblioteca de ejercicios", robots: { index: false, follow: false } };
}

const PAGE_SIZE = 24;

const firstValue = (value: string | string[] | undefined): string =>
  Array.isArray(value) ? (value[0] ?? "") : (value ?? "");

export default async function ExerciseLibraryPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { locale } = await params;
  if (!isLocale(locale)) redirect("/es");
  const query = await searchParams;

  const user = await getCurrentUser();
  if (!user) redirect(`/${locale}/ingresar`);

  const search = firstValue(query.q).slice(0, 60);
  const bodyPart = firstValue(query.zona);
  const equipmentKey = firstValue(query.equipo);
  const difficulty = firstValue(query.nivel);
  const category = firstValue(query.tipo);
  const page = Math.max(0, Number.parseInt(firstValue(query.pagina) || "0", 10) || 0);
  const equipment = equipmentKey ? equipmentGroupSlugs(equipmentKey) : null;

  const result = await readData(() =>
    Promise.all([
      getExerciseCatalog({
        search,
        bodyPart,
        equipment,
        difficulty,
        category,
        limit: PAGE_SIZE,
        offset: page * PAGE_SIZE,
      }),
      getExerciseFacets(),
    ]),
  );

  const href = (patch: Record<string, string | null>) => {
    const next = new URLSearchParams();
    const current: Record<string, string> = {
      q: search,
      zona: bodyPart,
      equipo: equipmentKey,
      nivel: difficulty,
      tipo: category,
      pagina: page > 0 ? String(page) : "",
    };
    for (const [key, value] of Object.entries({ ...current, ...patch })) {
      if (value) next.set(key, value);
    }
    const qs = next.toString();
    return `/${locale}/mi-cuenta/ejercicios${qs ? `?${qs}` : ""}`;
  };

  const facets = result.ok ? result.data[1] : null;
  const conEquipo = facets
    ? Object.values(facets.equipment).reduce((total, count) => total + count, 0)
    : 0;
  const sinEquipo = facets ? Math.max(0, facets.total - conEquipo) : 0;
  // Cuántos ejercicios hay en cada grupo de la pantalla. Sale de la base, no de
  // una lista fija: si mañana se importa otro catálogo, los números cambian solos.
  const groupCount = (slugs: string[]) =>
    slugs.length === 0
      ? sinEquipo
      : slugs.reduce((total, slug) => total + (facets?.equipment[slug] ?? 0), 0);

  const chip = (active: boolean) =>
    cn(
      "rounded-full px-3 py-2 text-xs font-semibold whitespace-nowrap transition-colors",
      active
        ? "bg-brand text-onbrand"
        : "border border-line bg-paper text-ink hover:border-brand",
    );

  return (
    <div className="container-x space-y-6 py-6">
      <header className="space-y-2">
        <Link href={`/${locale}/mi-cuenta`} className="text-xs font-semibold text-fog hover:text-ink">
          ← Mi cuenta
        </Link>
        <h1 className="display-xl text-[1.75rem] sm:text-[2.25rem]">Biblioteca de ejercicios</h1>
        <p className="max-w-2xl text-sm leading-relaxed text-fog">
          Cómo se hace cada ejercicio, qué músculos trabaja, con qué máquina y
          cuántas series y repeticiones. Buscá por nombre o filtrá por zona del
          cuerpo; tocá uno para ver el paso a paso.
        </p>
        <div className="flex flex-wrap items-center gap-3 pt-1">
          <Link
            href={`/${locale}/mi-cuenta/ejercicios/rutina`}
            className="rounded-full bg-brand px-4 py-2 text-sm font-semibold text-onbrand"
          >
            Ver mi rutina
          </Link>
          {isAdminRole(user.role) ? <UpdateLibrary /> : null}
        </div>
      </header>

      <form method="get" action={`/${locale}/mi-cuenta/ejercicios`} className="flex flex-wrap gap-2">
        <label className="min-w-0 flex-1">
          <span className="sr-only">Buscar ejercicio</span>
          <input
            type="search"
            name="q"
            defaultValue={search}
            placeholder="Buscar: prensa, jalón, sentadilla…"
            className="w-full min-w-0 rounded-full border border-line bg-card px-4 py-2.5 text-sm text-ink"
          />
        </label>
        {bodyPart ? <input type="hidden" name="zona" value={bodyPart} /> : null}
        {equipmentKey ? <input type="hidden" name="equipo" value={equipmentKey} /> : null}
        {difficulty ? <input type="hidden" name="nivel" value={difficulty} /> : null}
        {category ? <input type="hidden" name="tipo" value={category} /> : null}
        <button
          type="submit"
          className="rounded-full bg-brand px-5 py-2.5 text-sm font-semibold text-onbrand"
        >
          Buscar
        </button>
        {search ? (
          <Link href={href({ q: null, pagina: null })} className="rounded-full border border-line px-4 py-2.5 text-sm font-semibold text-ink">
            Limpiar
          </Link>
        ) : null}
      </form>

      {!result.ok ? (
        <div className="rounded-2xl border border-alert/40 bg-card p-5">
          <p className="font-semibold text-alert">No pudimos leer la biblioteca</p>
          <p className="mt-1 text-sm text-fog">
            No es que no haya ejercicios: es que la lectura falló. Volvé a intentarlo en un momento.
          </p>
          <p className="mt-2 text-xs text-fog">Código: {result.code}</p>
        </div>
      ) : (
        <>
          {/* Zonas del cuerpo: lo primero que el socio busca. */}
          <section aria-labelledby="zonas" className="space-y-2">
            <h2 id="zonas" className="text-sm font-semibold text-ink">
              Zona del cuerpo
            </h2>
            <div className="flex flex-wrap gap-2">
              <Link href={href({ zona: null, pagina: null })} className={chip(!bodyPart)}>
                Todo ({result.data[1].total})
              </Link>
              {BODY_PART_ORDER.filter((key) => result.data[1].bodyParts[key]).map((key) => (
                <Link
                  key={key}
                  href={href({ zona: key, pagina: null })}
                  className={chip(bodyPart === key)}
                >
                  {bodyPartLabel(key)} ({result.data[1].bodyParts[key]})
                </Link>
              ))}
            </div>
          </section>

          <section className="grid gap-2 sm:grid-cols-2">
            <div className="space-y-2">
              <h2 className="text-sm font-semibold text-ink">Con qué se hace</h2>
              <div className="flex flex-wrap gap-2">
                {EQUIPMENT_GROUPS.filter((group) => groupCount(group.slugs) > 0).map((group) => (
                  <Link
                    key={group.key}
                    href={href({ equipo: equipmentKey === group.key ? null : group.key, pagina: null })}
                    title={group.hint}
                    className={chip(equipmentKey === group.key)}
                  >
                    {group.label} ({groupCount(group.slugs)})
                  </Link>
                ))}
              </div>
            </div>
            <div className="space-y-2">
              <h2 className="text-sm font-semibold text-ink">Tipo de trabajo</h2>
              <div className="flex flex-wrap gap-2">
                {Object.entries(CATEGORY_LABELS)
                  .filter(([key]) => (result.data[1].category[key] ?? 0) > 0)
                  .map(([key, label]) => (
                    <Link
                      key={key}
                      href={href({ tipo: category === key ? null : key, pagina: null })}
                      className={chip(category === key)}
                    >
                      {label} ({result.data[1].category[key]})
                    </Link>
                  ))}
              </div>
            </div>
            <div className="space-y-2">
              <h2 className="text-sm font-semibold text-ink">Nivel</h2>
              <div className="flex flex-wrap gap-2">
                {Object.entries(DIFFICULTY_LABELS).map(([key, label]) => (
                  <Link
                    key={key}
                    href={href({ nivel: difficulty === key ? null : key, pagina: null })}
                    className={chip(difficulty === key)}
                  >
                    {label} ({result.data[1].difficulty[key] ?? 0})
                  </Link>
                ))}
              </div>
            </div>
          </section>

          <p className="text-xs text-fog" role="status">
            {result.data[0].total === 0
              ? "Ningún ejercicio coincide con esa búsqueda. Probá con otra palabra o quitá un filtro."
              : `${result.data[0].total} ${result.data[0].total === 1 ? "ejercicio" : "ejercicios"}${
                  search ? ` para «${search}»` : ""
                }`}
          </p>

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {result.data[0].rows.map((exercise) => (
              <ExerciseCard key={exercise.id} exercise={exercise} locale={locale} />
            ))}
          </div>

          {result.data[0].total > PAGE_SIZE ? (
            <nav className="flex items-center justify-between gap-3 pt-2" aria-label="Páginas">
              {page > 0 ? (
                <Link href={href({ pagina: String(page - 1) })} className="rounded-full border border-line px-4 py-2 text-sm font-semibold text-ink">
                  ← Anterior
                </Link>
              ) : (
                <span />
              )}
              <p className="text-xs text-fog">
                Página {page + 1} de {Math.max(1, Math.ceil(result.data[0].total / PAGE_SIZE))}
              </p>
              {page + 1 < Math.ceil(result.data[0].total / PAGE_SIZE) ? (
                <Link href={href({ pagina: String(page + 1) })} className="rounded-full border border-line px-4 py-2 text-sm font-semibold text-ink">
                  Siguiente →
                </Link>
              ) : (
                <span />
              )}
            </nav>
          ) : null}
        </>
      )}

      <footer className="border-t border-line pt-4">
        <ExerciseAttribution />
      </footer>
    </div>
  );
}
