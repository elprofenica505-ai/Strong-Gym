import type { Metadata } from "next";
import Link from "next/link";
import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  Database,
  FileSpreadsheet,
  ShieldCheck,
  Trash2,
  Upload,
} from "lucide-react";

export async function generateMetadata(): Promise<Metadata> {
  return { title: "Guía para cargar datos", robots: { index: false, follow: false } };
}

const STEPS = [
  {
    n: 1,
    title: "Recibí los datos del dueño",
    body: (
      <>
        <p>El dueño te puede pasar los datos de tres formas. Cualquiera funciona:</p>
        <ul className="list-disc space-y-1 pl-5">
          <li><strong>En papel o por WhatsApp</strong> (fotos de planillas, mensajes, audios).</li>
          <li><strong>En un Excel / CSV</strong> — el dueño abre su planilla y te la manda.</li>
          <li><strong>Dictándotelos</strong> — él te dice los datos y vos los cargás.</li>
        </ul>
        <p className="mt-2">
          Los datos típicos que necesitás: <strong>nombre, email, teléfono, plan</strong>.
          Opcionales pero útiles: fecha de nacimiento, contacto de emergencia, notas médicas.
        </p>
      </>
    ),
    icon: FileSpreadsheet,
  },
  {
    n: 2,
    title: "Armá la planilla",
    body: (
      <>
        <p>
          Si los datos están en papel o en audio, armá una <strong>planilla de Google Sheets</strong>
          (es gratis, no necesitás Excel). Poné una columna por dato y un cliente por fila.
        </p>
        <p className="mt-2">
          Si los datos ya están en Excel, pasalos a Google Sheets (o exportá como CSV directamente).
        </p>
        <p className="mt-2">
          La columna mínima es <code>fullName</code>. Correo y teléfono son opcionales. El resto es opcional
          y podés dejarlo vacío.
        </p>
        <p className="mt-2 text-fog">
          En la sección <Link href="." className="text-brand-300 underline">Importar clientes</Link>{" "}
          podés bajar una plantilla de ejemplo con todas las columnas.
        </p>
      </>
    ),
    icon: FileSpreadsheet,
  },
  {
    n: 3,
    title: "Exportá a CSV",
    body: (
      <>
        <p>
          En Google Sheets: <strong>Archivo → Descargar → Valores separados por comas (.csv)</strong>.
          En Excel: <strong>Archivo → Guardar como → CSV (separado por comas)</strong>.
        </p>
        <p className="mt-2">
          Te queda un archivo <code>.csv</code> en tu computadora. Ese es el archivo que subís
          al sistema.
        </p>
      </>
    ),
    icon: Upload,
  },
  {
    n: 4,
    title: "Importá el archivo",
    body: (
      <>
        <p>
          Andá a <strong>Panel → Herramientas → Importar clientes</strong>, tocá el botón para elegir
          el archivo y revisá la vista previa. Cuando esté bien, tocá{" "}
          <strong>Importar</strong>.
        </p>
        <p className="mt-2">
          El sistema te dice cuántos cargó bien y cuántos saltó (por email duplicado, datos
          incompletos, etc.).
        </p>
        <p className="mt-2 text-fog">
          <strong>Importante</strong>: este paso crea fichas CRM independientes, pero{" "}
          <strong>no crea la cuenta de login</strong>. Sólo si quiere una cuenta web, el cliente debe entrar
          al sitio y registrarse. Por seguridad, no se vinculan fichas por coincidencia de correo: la vinculación posterior de una ficha de recepción requiere revisión administrativa.
        </p>
      </>
    ),
    icon: Upload,
  },
  {
    n: 5,
    title: "Borrá los datos de ejemplo",
    body: (
      <>
        <p>
          Una vez que los clientes reales están cargados, andá a{" "}
          <strong>Panel → Herramientas → Reset</strong> y tocá <strong>Borrar TODO lo de ejemplo</strong>.
        </p>
        <p className="mt-2">
          Eso borra los clientes ficticios, los 3 coaches de ejemplo y los 13 gastos del mes.
          <strong>No toca la estructura de la base ni tu usuario admin.</strong>
        </p>
        <p className="mt-2 text-fog">
          Si querés hacerlo a mano, en Supabase SQL Editor podés correr:
        </p>
        <pre className="mt-2 overflow-x-auto rounded-xl border border-line bg-night-3 p-3 text-[0.75rem] text-fog">
{`delete from public.profiles
 where email like '%@stronggym-ejemplo.com';

delete from public.transactions
 where concept like '[SEED-GASTO]%';

delete from public.coaches
 where id in ('coa_dg', 'coa_mr', 'coa_jl');`}
        </pre>
      </>
    ),
    icon: Trash2,
  },
  {
    n: 6,
    title: "Cargá los coaches reales",
    body: (
      <>
        <p>
          Los coaches de ejemplo (Douglas, María, José Luis) también se borran con el reset.
          Cuando tengas los datos reales, cargalos desde el SQL Editor con algo como:
        </p>
        <pre className="mt-2 overflow-x-auto rounded-xl border border-line bg-night-3 p-3 text-[0.75rem] text-fog">
{`insert into public.coaches
  (id, slug, name, role_es, role_en, bio_es, bio_en,
   specialties, initials, color, sort_order, is_active)
values
  ('coa_xx', 'nombre', 'Nombre Apellido',
   'Head Coach', 'Head Coach',
   'Bio en español', 'Bio in English',
   array['boxeo','pesas'], 'NA', '#d81a22', 1, true);`}
        </pre>
        <p className="mt-2 text-fog">
          O pedime ayuda acá mismo y lo armamos juntos.
        </p>
      </>
    ),
    icon: Database,
  },
  {
    n: 7,
    title: "Listo · empeza a usar el sistema",
    body: (
      <>
        <p>
          Con los datos reales cargados, ya podés:
        </p>
        <ul className="list-disc space-y-1 pl-5">
          <li>Cobrar mensualidades desde <strong>Panel → Caja y cuentas</strong>.</li>
          <li>Ver las cuentas por cobrar y los días de mora.</li>
          <li>Generar reportes mensuales de P&L.</li>
          <li>Cada cliente se registra desde el sitio y ya puede reservar clases.</li>
        </ul>
      </>
    ),
    icon: CheckCircle2,
  },
];

export default function AyudaPage() {
  return (
    <div className="space-y-6">
      <div>
        <Link
          href="."
          className="inline-flex items-center gap-2 text-[0.75rem] text-fog transition-colors hover:text-ink"
        >
          <ArrowLeft className="size-3.5" />
          Volver a herramientas
        </Link>
        <h1 className="display-xl mt-3 text-[1.75rem] sm:text-[2.25rem]">
          Guía paso a paso
        </h1>
        <p className="mt-2 max-w-2xl text-[0.875rem] leading-relaxed text-fog">
          Cómo cargar los datos reales del gimnasio cuando el dueño te los pase,
          y cómo limpiar los datos de ejemplo.
        </p>
      </div>

      <ol className="space-y-4">
        {STEPS.map(({ n, title, body, icon: Icon }) => (
          <li
            key={n}
            className="grid gap-4 rounded-2xl border border-line bg-card p-5 sm:grid-cols-[auto,1fr] sm:items-start"
          >
            <div className="flex items-center gap-3">
              <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-brand text-onbrand">
                <Icon className="size-5" />
              </span>
              <span className="text-[0.6875rem] font-semibold uppercase tracking-wider text-fog sm:hidden">
                Paso {n}
              </span>
            </div>
            <div>
              <p className="hidden text-[0.6875rem] font-semibold uppercase tracking-wider text-fog sm:block">
                Paso {n}
              </p>
              <h2 className="mt-0.5 text-[1.0625rem] font-semibold text-ink">{title}</h2>
              <div className="mt-2 text-[0.875rem] leading-relaxed text-mist [&_p+p]:mt-2 [&_ul]:mt-2">
                {body}
              </div>
            </div>
          </li>
        ))}
      </ol>

      <div className="rounded-2xl border border-brand/30 bg-brand-soft p-5 text-[0.875rem] text-brand-300">
        <p className="flex items-start gap-2">
          <ShieldCheck className="mt-0.5 size-4 shrink-0" />
          <span>
            <strong>Tranquilo, no se puede romper nada</strong>: las herramientas de
            carga y reset solo tocan los datos de ejemplo. La estructura de la base
            de datos, tu usuario admin y cualquier dato real se preservan. Si algo sale
            mal, volvé a correr el <code>supabase/ACTUALIZAR.sql</code> y se regenera
            todo como al principio.
          </span>
        </p>
      </div>

      <div className="rounded-2xl border border-alert/30 bg-alert/[0.06] p-5 text-[0.875rem] text-mist">
        <p className="flex items-start gap-2">
          <AlertTriangle className="mt-0.5 size-4 shrink-0 text-alert" />
          <span>
            <strong>Si te trabás en cualquier paso</strong>, abrí una sesión nueva de chat
            conmigo y contame: &quot;estoy en el paso N de la guía, no me anda X&quot;. Te ayudo.
          </span>
        </p>
      </div>
    </div>
  );
}
