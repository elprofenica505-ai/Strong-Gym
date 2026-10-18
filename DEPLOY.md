# Poner el sitio online — paso a paso

Guía completa para dejar **Strong Gym** funcionando en internet:
GitHub + Supabase (base de datos y login) + Vercel (hosting).

Tiempo estimado: **30 a 40 minutos**. Todo con planes gratuitos.

---

## Antes de empezar

| Cuenta | Para qué | Costo |
|---|---|---|
| [GitHub](https://github.com/signup) | Guardar el código | Gratis |
| [Supabase](https://supabase.com/dashboard/sign-up) | Base de datos y usuarios | Gratis (plan Free) |
| [Vercel](https://vercel.com/signup) | Publicar el sitio | Gratis (plan Hobby) |

> Tip: registrate en Vercel y Supabase con **"Continue with GitHub"**. Después es todo un clic.

---

## Paso 1 · Subir el código a GitHub

El repositorio ya está creado: `github.com/elprofenica505-ai/Strong-Gym`.

Si trabajás en tu computadora:

```bash
git clone https://github.com/elprofenica505-ai/Strong-Gym.git
cd Strong-Gym
npm install
npm run dev
```

Hacé los cambios que quieras, y después:

```bash
git add .
git commit -m "Mis cambios"
git push
```

---

## Paso 2 · Crear el proyecto en Supabase

1. Entrá a <https://supabase.com/dashboard> y apretá **New project**.
2. Completá:
   - **Name**: `strong-gym`
   - **Database Password**: apretá *Generate a password* y **guardala** en un lugar seguro.
   - **Region**: elegí la más cercana a tus clientes (para Centroamérica, `East US` suele andar bien).
3. Esperá 1 o 2 minutos a que termine de crearse.

---

## Paso 3 · Crear las tablas

1. Abrí el archivo **`supabase/SETUP.sql`** de este repositorio.
2. Copiá **todo** el contenido (es largo, pero es un solo paso).
3. En Supabase, entrá a **SQL Editor** → **New query**, pegalo y apretá **Run**
   (o `Ctrl + Enter`). Tiene que decir *Success*.

Ese único archivo crea las tablas, las reglas de seguridad, las funciones de reserva,
las disciplinas, los planes y **las clases de las próximas 4 semanas**.

> **Si algo sale mal, volvé a correrlo**: está escrito para no duplicar datos.
> ¿Preferís el detalle? Son dos archivos: `supabase/migrations/00001_schema.sql`
> (estructura) y `00002_seed.sql` (contenido). `SETUP.sql` es exactamente los dos
> juntos, en orden.

> ### ⚠️ ¿Ya habías corrido una versión anterior del SQL?
> No uses `SETUP.sql`. Pegá **`supabase/ACTUALIZAR.sql`**: reemplaza los datos de
> ejemplo por los reales y corrige la grilla de clases **sin borrar cuentas ni
> reservas**. También se puede correr más de una vez sin problema.

### Verificar

En el menú lateral → **Table Editor** deberías ver las tablas:
`bookings`, `classes`, `coaches`, `messages`, `plans`, `profiles`, `sessions`, `subscribers`.

En `sessions` tendría que haber **36 clases** (4 semanas × 9 por semana: boxeo
los martes, miércoles y jueves a las 06:00, 17:30 y 20:00).
¿Está vacía? Corré esto en el SQL Editor:

```sql
select public.generate_week_sessions(
  current_date - (extract(isodow from current_date)::int - 1)
);
```

---

### ¿Querés comprobar el SQL antes de usarlo?

En tu computadora, con el proyecto clonado:

```bash
npm install
npm run test:sql
```

Levanta un PostgreSQL real, aplica los mismos archivos y corre 34 pruebas
(reservar, cancelar, cupos llenos, seguridad entre clientes...). Tiene que terminar con
**🎉 Todo pasó**.

---

## Paso 4 · Copiar las claves

1. En Supabase, andá a **Project Settings** (el engranaje, abajo del menú) → **API**.
2. Copiá dos valores:
   - **Project URL** → algo como `https://abcdefghijk.supabase.co`
   - **anon / public key** → una cadena larga que empieza con `eyJ...`

> ⚠️ La clave **anon** es pública y puede ir en el navegador: los permisos los controla el
> *Row Level Security* que ya configuramos. La clave **service_role** (la otra) **nunca** va acá.

### Probarlo en tu computadora

Creá un archivo `.env.local` en la raíz del proyecto (copiá `.env.example`):

```bash
NEXT_PUBLIC_SUPABASE_URL=https://tuproyecto.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOi...tu_clave_larga
NEXT_PUBLIC_SITE_URL=http://localhost:3000
```

Reiniciá el servidor (`Ctrl + C` y `npm run dev`). Con URL HTTPS y clave pública
válidas se utiliza la base real. Sin configuración se bloquean operaciones. La demo
sólo existe localmente con opt-in, nunca en producción: [Seguridad1B](docs/DEMO-PRODUCCION.md).

> `.env.local` está en el `.gitignore`: tus claves nunca se suben al repositorio.

---

## Paso 5 · Publicar en Vercel

1. Entrá a <https://vercel.com/new>.
2. **Import Git Repository** → elegí `Strong-Gym` → **Import**.
3. En la pantalla de configuración, dejá todo como viene
   (Vercel detecta Next.js solo: *Framework Preset: Next.js*, *Build Command: `next build`*).
4. Abrí **Environment Variables** y cargá las dos claves del paso 4:

   | Name | Value |
   |---|---|
   | `NEXT_PUBLIC_SUPABASE_URL` | `https://tuproyecto.supabase.co` |
   | `NEXT_PUBLIC_SUPABASE_ANON_KEY` | `eyJhbGciOi...` |
   | `NEXT_PUBLIC_SITE_URL` | `https://tu-dominio.vercel.app` |

5. Apretá **Deploy** y esperá un minuto.

Listo: Vercel te da una dirección tipo `https://strong-gym.vercel.app`.
Cada `git push` a `main` republica el sitio automáticamente.

---

## Paso 6 · Configurar el login

1. En Supabase → **Authentication** → **URL Configuration**.
2. **Site URL**: `https://tu-dominio.vercel.app`
3. **Redirect URLs**: agregá
   - Los destinos concretos de [recuperación/confirmación PKCE](docs/AUTH-RECUPERACION.md).
   - Para local/preview, autorizar sólo el origen controlado y sus callbacks. No wildcard global de Vercel.
   - Conservar destinos anteriores hasta verificar correos pendientes; no borrar configuración a ciegas.

Verificar también SMTP/entrega, templates compatibles y política real de contraseñas
en el proveedor. Registro y recuperación de la app piden12–128; login existente no cambia.
MFA sigue pendiente: no habilitar obligatoriedad ni desactivar factores existentes en esta etapa.

### Decidir si hace falta confirmar el email

- **Opción A — con confirmación (recomendado en producción)**
  Authentication → Sign In / Providers → Email: dejá **Confirm email** activado.

  Después de registrarse, el cliente recibe un mail y tiene que hacer clic para activar
  su cuenta. El sitio le muestra el mensaje "Revisá tu correo".

- **Entorno de pruebas separado:** cualquier cambio a confirmación requiere revisión
  del responsable. No desactivarla en producción como solución a correos que no llegan.

> **Importante para probar**: el servicio de emails gratuito de Supabase tiene un límite
> bajo por hora. Si vas a registrar muchas cuentas de prueba, usá la opción B o conectá
> un SMTP propio (Authentication → Settings → SMTP Settings).

---

## Paso 7 · Hacerte administrador

El panel (`/es/panel`) sólo lo ve quien tenga el rol `admin` o `staff`.

1. Registrate en la web publicada: `https://tu-dominio.vercel.app/es/registro`
   (confirmá el mail si está activado).
2. En Supabase → **SQL Editor**, corré:

   ```sql
   update public.profiles
      set role = 'admin'
    where email = 'tu-correo@ejemplo.com';
   ```

3. Cerrá sesión en la web y volvé a entrar. Te aparece **Panel** en el menú.

Para darle acceso a un profe o recepcionista, usá `'staff'` en lugar de `'admin'`.

---

## Paso 8 · Conectar tu dominio propio (opcional)

1. Comprá el dominio (en [Namecheap](https://namecheap.com), [Cloudflare](https://cloudflare.com)
   o donde prefieras). Ejemplo: `stronggym.com`.
2. En Vercel → tu proyecto → **Settings** → **Domains** → **Add** → escribí el dominio.
3. Vercel te muestra los registros DNS que tenés que crear en tu proveedor:
   - Un registro **A** apuntando a `76.76.21.21`, o
   - Un registro **CNAME** `www` → `cname.vercel-dns.com`
4. Esperá entre 5 minutos y unas horas a que se propague. El certificado HTTPS lo pone
   Vercel solo, sin costo.
5. Actualizá `NEXT_PUBLIC_SITE_URL` con el dominio final y volvé a desplegar
   (Vercel → Deployments → ⋯ → Redeploy).

---

## Después del lanzamiento

### Cargar tus clases

Con Supabase conectado, las clases salen de la tabla `sessions`. Para generar más semanas:

```sql
-- El lunes de la semana que quieras (acá, 4 semanas más)
select public.generate_week_sessions('2026-11-16'::date);
```

### Marcar ausencias

Los clientes que reservan y no van quedan como `confirmed`. Para pasarlos a `no_show`
después de la clase:

```sql
select public.close_past_sessions();
```

Se puede automatizar en Supabase → **Database** → **Extensions** → activar `pg_cron`,
y después en el SQL Editor:

```sql
select cron.schedule('cerrar-clases', '0 4 * * *', $$select public.close_past_sessions()$$);
```

### Leer las consultas del formulario

Panel del sitio → **Consultas**, o en Supabase → Table Editor → `messages`.

### Copias de seguridad

Supabase hace backups diarios en los planes pagos. En el plan Free, corré de vez en cuando:

```sql
copy (select * from public.bookings) to stdout with csv header;
```

(o exportá desde Table Editor → ⋯ → Export CSV).

---

## Problemas comunes

| Síntoma | Causa y solución |
|---|---|
| Servicio no disponible / CONFIGURATION_UNAVAILABLE | Falta configuración válida. No es modo demo. En Vercel: Settings → Environment Variables, y después **Redeploy** (las variables no se aplican a un deploy ya hecho). |
| "Email o contraseña incorrectos" con datos correctos | Falta confirmar el email. Revisá Authentication → Users: si dice *Waiting for verification*, el cliente tiene que abrir el link del mail. |
| El mail de confirmación no llega | Límite del servicio gratuito de emails o el mail cayó en spam. Revisá límites/SMTP y configurá un proveedor propio. No desactivar confirmación como solución en producción. |
| Al reservar dice "No pudimos completar la reserva" | Mirá los logs: Vercel → tu proyecto → **Logs**. Si dice `function book_session does not exist`, no corriste `SETUP.sql`. |
| El panel dice "No tenés permisos" o no puede verificar el perfil | Revisá el ID/rol que muestra y seguí [el diagnóstico del panel](docs/PANEL-ADMIN.md). No confundir un SELECT como dueño con la lectura bajo RLS del usuario autenticado. |
| El sitio redirige siempre a `/es` | Es lo normal: el idioma se detecta del navegador. El selector ES/EN del header lo cambia. |
| Las clases aparecen vacías | `sessions` está vacía. Corré `select public.generate_week_sessions(...)` (ver Paso 3). |

---

## Checklist final

- [ ] Los dos `.sql` corrieron sin errores
- [ ] `NEXT_PUBLIC_SUPABASE_URL` y `NEXT_PUBLIC_SUPABASE_ANON_KEY` están en Vercel
- [ ] Supabase real configurado; login y lecturas probados. Sin configuración, rutas/API bloqueadas (no demo).
- [ ] Probaste registrar un cliente de punta a punta (registro → reservar → cancelar)
- [ ] Tu usuario tiene rol `admin` y ves el Panel
- [ ] En Supabase → Authentication → URL Configuration está tu dominio real
- [ ] `NEXT_PUBLIC_SITE_URL` apunta a tu dominio (para que los links de los emails sean correctos)
- [ ] Cambiaste los textos y datos del gimnasio en `src/config/site.ts` y los diccionarios
