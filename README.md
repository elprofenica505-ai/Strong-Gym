# Strong Gym — Sitio web + reserva de clases

Sitio web del gimnasio **Strong Gym**: landing bilingüe (español/inglés), horarios de clases
y **reserva de clases online** para los socios, con panel de administración para el gimnasio.

Hecho para correr en **Vercel** con la base de datos y el login en **Supabase**,
y el código en **GitHub**.

> **¿Recién arrancás?** El sitio funciona **sin configurar nada**: entra en *modo demo* y
> muestra el contenido de ejemplo con las reservas guardadas en tu navegador.
> Cuando conectás Supabase, todo pasa a la base de datos real.
> Los pasos están en **[DEPLOY.md](./DEPLOY.md)**.

---

## Qué incluye

### Público (cualquiera puede entrar)

| Sección | Descripción |
|---|---|
| **Inicio** | Hero, disciplinas, beneficios, precios, profes, galería, opiniones, preguntas frecuentes, contacto y mapa |
| **Horarios** (`/es/horarios`, `/en/horarios`) | Calendario semanal con filtros por disciplina y **reserva de clases** |
| **Registro / Ingreso** | Alta de cuenta e inicio de sesión con email y contraseña |
| **Contacto** | Formulario que guarda las consultas en la base (con protección anti-spam) |

### Socios (con cuenta)

- **Mi cuenta** (`/es/mi-cuenta`): próximas reservas, historial, estadísticas y datos personales.
- Cancelar una reserva hasta **3 horas antes** del inicio de la clase.

### Staff del gimnasio

- **Panel** (`/es/panel`): reservas del día y de la semana, consultas del formulario,
  disciplinas activas, ocupación y socios registrados.

### Detalles técnicos

- **Bilingüe es/en** con rutas `/es/...` y `/en/...`, detección automática del idioma del
  navegador y selector manual. Todo el texto vive en `src/i18n/dictionaries/`.
- **Adaptable de verdad**: se diseña desde 360 px (celular chico) hasta monitores grandes.
- **Reservas sin sobreventa**: el cupo se controla en PostgreSQL con bloqueo de fila
  (`book_session`), así que dos personas no pueden tomar el último lugar a la vez.
- **Seguridad a nivel de fila (RLS)**: cada socio sólo puede ver y tocar sus propias reservas.
- **Funciona sin JavaScript para el contenido** (SSR) y con `prefers-reduced-motion` respetado.
- SEO: metadatos por idioma, `hreflang`, `sitemap.xml`, `robots.txt` y datos estructurados
  (`HealthAndBeautyBusiness` + `Event` por clase) para que Google muestre los horarios.

---

## Stack

| Pieza | Tecnología | Por qué |
|---|---|---|
| Framework | **Next.js 16** (App Router, React 19) | Render en servidor, rutas API y deploy directo en Vercel |
| Estilos | **Tailwind CSS v4** | Diseño adaptable sin CSS a mano |
| Base de datos | **PostgreSQL de Supabase** | Relacional, con RLS y funciones SQL |
| Login | **Supabase Auth** | Email y contraseña, sesión en cookies `httpOnly` |
| Iconos | lucide-react | Livianos y consistentes |
| Validación | zod | Validar en el servidor y en el cliente |
| Tipografías | Anton + Inter (self-hosted) | Sin pedidos a Google Fonts |

---

## Cómo correrlo en tu computadora

Necesitás **Node.js 20.9 o superior** ([descargar](https://nodejs.org)).

```bash
git clone https://github.com/elprofenica505-ai/Strong-Gym.git
cd Strong-Gym
npm install
npm run dev
```

Abrí <http://localhost:3000> y te redirige a `/es` o `/en` según tu navegador.

### Probar el panel de administración en modo demo

1. Entrá a **Ingresar**.
2. Usá la cuenta de ejemplo: **`admin@stronggym.com`** / **`admin123`**
3. Andá a **Panel**.

> Las cuentas y las reservas del modo demo se guardan en el `localStorage` del navegador.
> Borrá los datos del sitio para empezar de cero.

### Comandos

```bash
npm run dev        # servidor de desarrollo (localhost:3000)
npm run build      # compilar para producción
npm start          # correr la versión compilada
npm run typecheck  # revisar los tipos de TypeScript
npm run test:sql   # probar el SQL de Supabase en un Postgres real (34 pruebas)
npm run build:sql  # regenerar supabase/SETUP.sql tras cambiar los horarios
```

---

## Estructura del proyecto

```
src/
├── app/
│   ├── [locale]/              # todas las páginas, en español e inglés
│   │   ├── layout.tsx         # header, footer, providers
│   │   ├── page.tsx           # home
│   │   ├── horarios/          # calendario + reservas
│   │   ├── ingresar/          # login
│   │   ├── registro/          # alta de socio
│   │   ├── mi-cuenta/         # panel del socio
│   │   └── panel/             # panel de administración
│   ├── api/                   # rutas de backend
│   │   ├── sessions/          # GET  horarios de la semana
│   │   ├── bookings/          # POST reservar · DELETE cancelar
│   │   ├── contact/           # POST consulta del formulario
│   │   ├── newsletter/        # POST suscripción
│   │   └── account/           # PATCH datos del perfil
│   ├── globals.css            # sistema de diseño (colores, tipografías, animaciones)
│   ├── robots.ts, sitemap.ts, manifest.ts
│   └── icon.svg
├── components/
│   ├── layout/                # header, footer, logo, selector de idioma
│   ├── sections/              # secciones de la home
│   ├── schedule/              # tablero de reservas
│   ├── account/               # panel del socio
│   ├── admin/                 # panel de administración
│   ├── auth/                  # formularios y layout de login
│   ├── providers/             # estado global (sesión, reservas, idioma)
│   └── ui/                    # botones, campos, acordeón, notificaciones
├── config/site.ts             # 👈 DATOS DEL GIMNASIO (nombre, dirección, precios...)
├── i18n/                      # configuración y diccionarios es/en
├── lib/
│   ├── data/                  # consultas a Supabase + contenido de ejemplo
│   ├── supabase/              # clientes de Supabase (navegador, servidor, proxy)
│   ├── schedule.ts            # fechas y horarios en la zona del gimnasio
│   └── types.ts
└── proxy.ts                   # redirección de idioma + refresco de sesión

supabase/
├── SETUP.sql                  # 👈 instalación desde cero (pegar y listo)
├── ACTUALIZAR.sql             # 👈 poner al día una base que ya está en uso
└── migrations/
    ├── 00001_schema.sql       # tablas, permisos y funciones de reserva
    ├── 00002_seed.sql         # disciplinas, planes y clases
    └── 00003_datos_reales.sql # datos reales sobre una base ya cargada

scripts/
├── build-sql.mjs              # mantiene la grilla de clases sincronizada
└── test-sql.mjs               # pruebas del SQL en un Postgres real

public/images/                 # fotos del gimnasio
```

---

## Personalizar el sitio

### 1. Datos del gimnasio

Casi todo lo editable está en **`src/config/site.ts`**: nombre, dirección, teléfono,
WhatsApp, redes sociales, coordenadas del mapa, zona horaria, moneda y horarios de atención.

```ts
export const siteConfig = {
  name: "Strong Gym",
  phone: "+505 8888 1234",
  whatsapp: "50588881234",
  address: { street: "Colonia Centroamérica...", city: "Managua", ... },
  currency: { code: "USD", symbol: "$", decimals: 0 },
  // ...
};
```

### 2. Textos e idiomas

`src/i18n/dictionaries/es.ts` y `en.ts`. Están organizados por sección (`hero`, `schedule`,
`plans`, `faq`...) y el diccionario inglés está tipado contra el español: si agregás una
clave en uno y te olvidás en el otro, el `npm run build` te avisa.

### 3. Clases, profes y planes

- **Con Supabase**: editá las tablas `classes`, `coaches` y `plans` desde el SQL Editor o
  desde el panel de Supabase (Table Editor).
- **En modo demo**: `src/lib/data/demo-content.ts` (y la grilla semanal en `demo-sessions.ts`).

### 4. Fotos

Reemplazá los archivos de `public/images/` manteniendo los nombres:
`fachada.jpg` (portada), `sala1.jpg`, `sala2.jpg`, `pesas.jpg`, `abs.jpg`,
`pantorrilla.jpg`, `triceps.jpg` (galería), `boxeo.jpg` y `sacos.jpg` (boxeo),
`grupo.jpg`, `pareja1.jpg`, `cambio.jpg` (comunidad) y `supl1.jpg` (suplementos).

### 5. Colores

`src/app/globals.css`, en el bloque `@theme`. El color de la marca es
`--color-brand` (rojo `#d81a22`), sobre blanco y negro.

---

## Despliegue

Lo mínimo: **GitHub → Vercel → Supabase**. Los pasos detallados (con capturas de dónde
hacer clic y cómo conseguir cada clave) están en **[DEPLOY.md](./DEPLOY.md)**.

Resumen:

1. Subir el proyecto a GitHub.
2. Crear el proyecto en Supabase, correr los dos `.sql` y copiar `URL` + `anon key`.
3. Importar el repositorio en Vercel y cargar esas dos variables de entorno.
4. Darle permisos de administrador a tu usuario:

   ```sql
   update public.profiles set role = 'admin' where email = 'tu-correo@ejemplo.com';
   ```

---

## Preguntas frecuentes del proyecto

**¿Puedo usarlo sin Supabase?**
Sí. Sin variables de entorno arranca en modo demo con contenido de ejemplo y las reservas
guardadas en el navegador. Es útil para mostrar el sitio a un cliente antes de configurar nada.

**¿Cuánto cuesta?**
Vercel (plan Hobby) y Supabase (plan Free) alcanzan de sobra para un gimnasio. Los dos son
gratis hasta límites muy altos.

**¿Cómo cambio el idioma por defecto?**
`src/i18n/config.ts` → `defaultLocale`.

**¿Se pueden agregar más idiomas?**
Sí: agregá el código en `locales` (config.ts), creá el diccionario y listo. Las rutas
`/[locale]/...` ya están preparadas.

**¿Cómo evito que se llene una clase de gente que no va?**
Se registran las ausencias (`no_show`) y la función `close_past_sessions()` las marca
automáticamente. Podés programarla con `pg_cron` para que corra todas las noches.

---

## English quick start

**Strong Gym** is a bilingual (ES/EN) gym website with online class booking, member area
and admin panel, built with Next.js 16 + Tailwind v4, backed by Supabase (Postgres + Auth)
and deployed on Vercel.

```bash
npm install && npm run dev
```

It runs in **demo mode** out of the box (sample content, bookings stored in the browser).
Demo admin login: `admin@stronggym.com` / `admin123`.

To go live: run the SQL files in `supabase/migrations/`, set `NEXT_PUBLIC_SUPABASE_URL` and
`NEXT_PUBLIC_SUPABASE_ANON_KEY` (locally in `.env.local`, on Vercel in Project Settings →
Environment Variables), and redeploy. Full walkthrough: [DEPLOY.md](./DEPLOY.md).

All UI copy lives in `src/i18n/dictionaries/es.ts` and `en.ts`. Business details
(name, address, phone, currency, timezone) live in `src/config/site.ts`.

---

## Licencia

MIT. Usalo, cambialo y publicalo como quieras.

## Clientes y recepción (FASE 2)

CRM con etiquetas comerciales, alta sin cuenta web, QR/carnet opcional y atención manual.
Ver [instalación, alcance y pruebas](docs/FASE2-CLIENTES.md). Para una base existente
con Fase 1 y 00012, aplicar sólo `supabase/FASE2.sql`; ejemplos opcionales separados
en `00021_clients_seed.sql`. No se instalan automáticamente en producción.


### Base con `bank_accounts` y saldos separados

Si ya instalaste CRM y el diagnóstico confirma esa estructura financiera,
consultá [la compatibilidad incremental](docs/FASE2-CLIENTES.md#compatibilidad-incremental-confirmada-por-csv-00022)
y `supabase/COMPATIBILIDAD-CRM.sql`. No reinstales SETUP/ACTUALIZAR sobre esa base.
El parche permite leer ficha/opciones y conserva saldos separados; **los cobros
CRM quedan bloqueados** en ese modelo hasta revisar su actualización de Caja.
No equivale a una migración completa de finanzas ni valida reportes FASE1.
