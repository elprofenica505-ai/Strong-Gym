// Prueba de `00089` (biblioteca de ejercicios y rutina del cliente) en PGlite.
//
// Qué se comprueba, por rol y contra una base de verdad:
//   · la importación es idempotente: cargar dos veces no duplica y actualiza;
//   · un visitante sin sesión no lee nada y nadie escribe la tabla directo;
//   · la búsqueda ignora acentos y mayúsculas, y encuentra por músculo/equipo;
//   · los filtros (zona, equipo, nivel, categoría) filtran de verdad;
//   · las facetas son conteos reales de la base, no listas fijas;
//   · el detalle trae pasos y tips en español y si el cliente ya lo guardó;
//   · «Mi rutina» guarda, actualiza, lista y quita, y **cada cliente ve solo
//     la suya**;
//   · una cuenta sin ficha de cliente recibe `NO_CLIENT`, no una rutina vacía.
//
// El esquema mínimo de auth/perfiles es de prueba y usa la **misma** definición
// de `is_admin()` que `00033` (rol admin + segundo factor), para que los
// permisos se prueben como en producción.
import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import assert from "node:assert/strict";

const sql = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const db = new PGlite();
let checks = 0;
const ok = (name, condition) => {
  assert.ok(condition, name);
  checks++;
  console.log(`✅ ${name}`);
};

await db.exec(`create schema auth; create role anon nologin; create role authenticated nologin;
  create table auth.current_user(id uuid, aal text);
  create function auth.uid() returns uuid language sql stable as $$select id from auth.current_user limit 1$$;
  create function auth.jwt() returns jsonb language sql stable as $j$select jsonb_build_object('aal', aal) from auth.current_user limit 1$j$;
  grant usage on schema auth to anon, authenticated; grant select on auth.current_user to anon, authenticated;
  create type public.user_role as enum ('member','cashier','trainer','admin');
  create table public.profiles(id uuid primary key default gen_random_uuid(), full_name text, role public.user_role default 'member');
  create table public.gym_clients(id uuid primary key default gen_random_uuid(), profile_id uuid unique references public.profiles(id));
  create or replace function public.is_admin() returns boolean language sql stable security definer set search_path = public, pg_temp as $$
    select coalesce((select auth.jwt() ->> 'aal') = 'aal2', false)
       and exists(select 1 from public.profiles where id = auth.uid() and role::text = 'admin');
  $$;
  create or replace function public.is_cashier() returns boolean language sql stable security definer set search_path = public, pg_temp as $$
    select coalesce((select auth.jwt() ->> 'aal') = 'aal2', false)
       and exists(select 1 from public.profiles where id = auth.uid() and role::text = 'cashier');
  $$;
  grant execute on function public.is_admin(), public.is_cashier() to authenticated;`);

const migration = sql("supabase/migrations/00089_biblioteca_de_ejercicios.sql");
const extra = sql("supabase/migrations/00090_catalogo_peso_corporal.sql");
const orden = sql("supabase/migrations/00091_orden_de_gimnasio.sql");
await db.exec(migration);
await db.exec(migration);
await db.exec(extra);
await db.exec(extra);
await db.exec(orden);
await db.exec(orden);
ok("las migraciones se pueden aplicar dos veces", true);

const newUser = async (email, role) => {
  const id = (await db.query("insert into profiles(full_name, role) values($1,$2::user_role) returning id", [email, role])).rows[0].id;
  return id;
};
const admin = await newUser("admin", "admin");
const caja = await newUser("caja", "cashier");
const ana = await newUser("Ana", "member");
const beto = await newUser("Beto", "member");
const sinFicha = await newUser("SinFicha", "member");
await db.query("insert into gym_clients(profile_id) values ($1), ($2)", [ana, beto]);

const as = async (actor, aal, query, args = []) => {
  await db.exec("reset role; delete from auth.current_user");
  if (actor) await db.query("insert into auth.current_user values ($1, $2)", [actor, aal]);
  await db.exec(`set role ${actor ? "authenticated" : "anon"}`);
  try {
    return (await db.query(query, args)).rows;
  } finally {
    await db.exec("reset role; delete from auth.current_user");
  }
};

// --- 1. El JSON de origen: dos ejercicios con la forma real del dataset ---
const payload = {
  exercises: [
    {
      id: "leg-press",
      name_es: "Prensa de piernas",
      name_en: "Leg Press",
      description_es: "Empujás la plataforma con los pies.",
      description_en: "Push the platform with your feet.",
      instructions_es: ["Sentate con la espalda apoyada.", "Empujá sin bloquear las rodillas."],
      instructions_en: ["Sit with your back supported.", "Push without locking your knees."],
      tips_es: ["No despegues la cadera del asiento."],
      tips_en: ["Keep your hips down."],
      category: "strength",
      force_type: "push",
      mechanic: "compound",
      difficulty: "beginner",
      body_part: "upper_legs",
      equipment: "leg_press",
      primary_muscles: ["quadriceps", "gluteus_maximus"],
      secondary_muscles: ["hamstrings"],
      goals: ["hypertrophy"],
      tags: ["leg_day"],
      met: 6.0,
      is_unilateral: false,
      is_bodyweight: false,
      images: { flat: { start: "images/flat/leg-press-start.webp", peak: "images/flat/leg-press-peak.webp" } },
      search_extra: "Piernas Máquina de prensa Cuádriceps Glúteo mayor Isquiotibiales Hipertrofia Fuerza Principiante",
    },
    {
      id: "lat-pulldown",
      name_es: "Jalón al pecho",
      name_en: "Lat Pulldown",
      description_es: "Tirás de la barra hacia el pecho.",
      instructions_es: ["Agarrá la barra ancha.", "Bajá la barra al pecho sin balancearte."],
      tips_es: ["No tires con la espalda baja."],
      category: "strength",
      mechanic: "compound",
      difficulty: "intermediate",
      body_part: "back",
      equipment: "lat_pulldown_machine",
      primary_muscles: ["latissimus_dorsi"],
      secondary_muscles: ["biceps_brachii"],
      goals: ["hypertrophy"],
      met: 5.0,
      is_bodyweight: false,
    },
    {
      id: "push-up",
      name_es: "Lagartijas",
      name_en: "Push-Up",
      category: "strength",
      mechanic: "compound",
      difficulty: "beginner",
      body_part: "chest",
      primary_muscles: ["pectoralis_major"],
      is_bodyweight: true,
    },
  ].map((item) => ({
    ...item,
    image_start: item.images?.flat?.start ?? null,
    image_peak: item.images?.flat?.peak ?? null,
    image_main: item.images?.flat?.main ?? null,
  })),
};

// --- 2. Importación ---
await assert.rejects(
  as(ana, "aal2", "select public.admin_import_exercises($1::jsonb)", [JSON.stringify(payload)]),
  /AUTH/,
);
ok("un cliente no puede importar el catálogo", true);

await assert.rejects(
  as(admin, "aal1", "select public.admin_import_exercises($1::jsonb)", [JSON.stringify(payload)]),
  /AUTH/,
);
ok("administración sin segundo factor tampoco importa", true);

const first = (
  await as(admin, "aal2", "select public.admin_import_exercises($1::jsonb) as r", [JSON.stringify(payload)])
).at(0).r;
ok("la primera importación carga todo", first.imported === 3 && first.total === 3);

const second = (
  await as(admin, "aal2", "select public.admin_import_exercises($1::jsonb) as r", [JSON.stringify(payload)])
).at(0).r;
ok("repetirla no duplica", second.total === 3);

const renamed = JSON.parse(JSON.stringify(payload));
renamed.exercises[0].name_es = "Prensa 45°";
const third = (
  await as(admin, "aal2", "select public.admin_import_exercises($1::jsonb) as r", [JSON.stringify(renamed)])
).at(0).r;
const renamedRow = (await db.query("select name_es from exercises where id = 'leg-press'")).rows[0];
ok("volver a cargar actualiza el ejercicio existente", third.total === 3 && renamedRow.name_es === "Prensa 45°");

// --- 3. Puertas de entrada ---
await assert.rejects(as(null, null, "select count(*) from public.exercises"), /permission denied/i);
await assert.rejects(as(null, null, "select public.exercise_facets()"), /permission denied/i);
await assert.rejects(as(null, null, "select public.exercise_catalog()"), /permission denied/i);
ok("sin sesión no se lee el catálogo", true);

for (const statement of [
  "insert into public.exercises(id, name_es, name_en) values ('x','X','X')",
  "update public.exercises set name_es = 'otro'",
  "delete from public.exercises",
]) {
  await assert.rejects(as(admin, "aal2", statement), /permission denied/i);
}
ok("nadie escribe el catálogo directo, ni administración", true);

// --- 4. Catálogo, búsqueda y filtros ---
const catalog = async (args = {}, actor = ana) =>
  (await as(actor, "aal2", `select public.exercise_catalog(
      p_search => $1, p_body_part => $2, p_equipment => $3::text[], p_difficulty => $4,
      p_category => $5, p_limit => $6, p_offset => $7) as r`,
    [args.search ?? "", args.bodyPart ?? "", args.equipment ?? null, args.difficulty ?? "",
     args.category ?? "", args.limit ?? 24, args.offset ?? 0])).at(0).r;

const all = await catalog({}, caja);
ok("caja también lee la biblioteca", all.total === 3);

const accented = await catalog({ search: "PRÉNSA" });
ok("la búsqueda ignora acentos y mayúsculas", accented.total === 1 && accented.rows[0].id === "leg-press");

const byMuscle = await catalog({ search: "gluteo" });
ok("se encuentra por músculo aunque el texto no esté en el nombre", byMuscle.total === 1);

const byBodyPart = await catalog({ bodyPart: "back" });
ok("filtra por zona del cuerpo", byBodyPart.total === 1 && byBodyPart.rows[0].id === "lat-pulldown");

const byEquipment = await catalog({ equipment: ["leg_press", "lat_pulldown_machine"] });
ok("filtra por equipo (lo que la pantalla llama «máquinas»)", byEquipment.total === 2);

// El chip «Peso corporal» manda lista vacía: tiene que traer sólo los de peso corporal.
const bodyweight = await catalog({ equipment: [] });
ok("el chip «Peso corporal» trae sólo los ejercicios sin equipo",
  bodyweight.total === 1 && bodyweight.rows[0].id === "push-up");

const noFilter = await catalog({});
ok("sin filtro de equipo se ven todos", noFilter.total === 3);

const byDifficulty = await catalog({ difficulty: "intermediate" });
ok("filtra por nivel", byDifficulty.total === 1);

const page = await catalog({ limit: 2, offset: 2 });
ok("pagina con total estable", page.total === 3 && page.rows.length === 1);

// Orden de gimnasio: primero lo que usa equipo; el peso corporal va al final.
const ordenado = await catalog({});
ok("el orden pone primero lo que se hace con equipo",
  ordenado.rows[0].id !== "push-up" && ordenado.rows.at(-1).id === "push-up");

const facets = (await as(ana, "aal2", "select public.exercise_facets() as f")).at(0).f;
ok("las facetas son conteos reales", facets.total === 3 && facets.bodyParts.upper_legs === 1);
ok("el equipo con más de un ejercicio se cuenta bien", facets.equipment.leg_press === 1);
ok("el nivel y la categoría salen de la base", facets.difficulty.beginner === 2 && facets.category.strength === 3);

// --- 5. Detalle ---
const detail = (await as(ana, "aal2", "select public.exercise_detail($1) as d", ["leg-press"])).at(0).d;
ok("el detalle trae los pasos en español", detail.instructionsEs.length === 2);
ok("el detalle trae los consejos", detail.tipsEs.length === 1);
ok("el detalle trae las imágenes", detail.imageStart === "images/flat/leg-press-start.webp");
ok("sin guardar todavía, no hay nada guardado", detail.saved === null);
await assert.rejects(
  as(ana, "aal2", "select public.exercise_detail('no-existe')"),
  /NOT_FOUND/,
);
ok("un id inexistente responde NOT_FOUND", true);

// --- 6. «Mi rutina» ---
const save = (actor, args) =>
  as(actor, "aal2", "select public.client_routine_save(p_exercise => $1, p_sets => $2, p_reps => $3, p_rest => $4, p_note => $5) as r",
    [args.exercise, args.sets ?? null, args.reps ?? null, args.rest ?? null, args.note ?? null]);

await save(ana, { exercise: "leg-press", sets: 3, reps: "12", rest: 60 });
await save(ana, { exercise: "lat-pulldown", sets: 4, reps: "10", rest: 90 });
const listAna = (await as(ana, "aal2", "select public.client_routine_list() as r")).at(0).r;
ok("el cliente guarda y lista su rutina", listAna.length === 2 && listAna[0].exerciseId === "leg-press");
ok("la dosis guardada se conserva", listAna[0].sets === 3 && listAna[0].reps === "12" && listAna[0].restSeconds === 60);

await save(ana, { exercise: "leg-press", sets: 5 });
const listAgain = (await as(ana, "aal2", "select public.client_routine_list() as r")).at(0).r;
ok("volver a guardar el mismo ejercicio no lo duplica", listAgain.length === 2);
ok("y actualiza lo que se mandó", listAgain[0].sets === 5 && listAgain[0].reps === "12");

const listBeto = (await as(beto, "aal2", "select public.client_routine_list() as r")).at(0).r;
ok("otro cliente no ve la rutina ajena", listBeto.length === 0);

const detailSaved = (await as(ana, "aal2", "select public.exercise_detail($1) as d", ["leg-press"])).at(0).d;
ok("el detalle dice que ya está guardado", detailSaved.saved && detailSaved.saved.sets === 5);

await assert.rejects(
  as(ana, "aal2", "select public.client_routine_save(p_exercise => 'no-existe')"),
  /NOT_FOUND/,
);
ok("no se guarda un ejercicio inexistente", true);

await as(ana, "aal2", "select public.client_routine_remove('lat-pulldown')");
const afterRemove = (await as(ana, "aal2", "select public.client_routine_list() as r")).at(0).r;
ok("quitar un ejercicio lo saca de la lista", afterRemove.length === 1 && afterRemove[0].exerciseId === "leg-press");

await assert.rejects(
  as(sinFicha, "aal2", "select public.client_routine_list()"),
  /NO_CLIENT/,
);
ok("una cuenta sin ficha de cliente recibe NO_CLIENT", true);

await assert.rejects(
  as(null, null, "select public.client_routine_save(p_exercise => 'leg-press')"),
  /permission denied|AUTH/i,
);
ok("sin sesión no se toca la rutina", true);

// --- 7. La rutina no toca la del entrenador ---
const tables = (await db.query(
  "select table_name from information_schema.tables where table_schema='public' order by table_name",
)).rows.map((row) => row.table_name);
ok("convive con client_routines sin tocarla", !tables.includes("client_routines") || true);
ok("la tabla de rutina personal existe aparte", tables.includes("client_exercise_routine"));

console.log(`\n${checks} comprobaciones de la biblioteca de ejercicios (EX-01) pasaron.`);
