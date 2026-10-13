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
   - **Region**: elegí la más cercana a tus socios (para Centroamérica, `East US` suele andar bien).
3. Esperá 1 o 2 minutos a que termine de crearse.

---

## Paso 3 · Crear las tablas

1. En el menú lateral del proyecto, entrá a **SQL Editor** → **New query**.
2. Abrí el archivo `supabase/migrations/00001_schema.sql` de este repositorio,
   copiá **todo** el contenido y pegalo en el editor.
3. Apretá **Run** (o `Ctrl + Enter`). Tiene que decir *Success*.
4. Repetí con el archivo `supabase/migrations/00002_seed.sql`.
   Este carga las disciplinas, los profes, los planes y las clases de las próximas 4 semanas.

> **¿Te dio error?** Corré primero `00001` y después `00002`. Si algo sale mal,
> podés correr los dos de nuevo: están escritos para no duplicar datos.

### Verificar

En el menú lateral → **Table Editor** deberías ver las tablas:
`bookings`, `classes`, `coaches`, `messages`, `plans`, `profiles`, `sessions`, `subscribers`.

En `sessions` tendría que haber alrededor de **190 clases** (4 semanas × ~47).
¿Está vacía? Corré esto en el SQL Editor:

```sql
select public.generate_week_sessions(
  current_date - (extract(isodow from current_date)::int - 1)
);
```

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

Reiniciá el servidor (`Ctrl + C` y `npm run dev`). El aviso amarillo de "modo demo"
tiene que desaparecer y en Horarios vas a ver las clases reales de la base.

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
   - `https://tu-dominio.vercel.app/**`
   - `http://localhost:3000/**` (para cuando pruebes en tu compu)

### Decidir si hace falta confirmar el email

- **Opción A — con confirmación (recomendado en producción)**
  Authentication → Sign In / Providers → Email: dejá **Confirm email** activado.

  Después de registrarse, el socio recibe un mail y tiene que hacer clic para activar
  su cuenta. El sitio le muestra el mensaje "Revisá tu correo".

- **Opción B — sin confirmación (cómodo para probar)**
  Desactivá **Confirm email**. El socio queda logueado al instante.

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

Los socios que reservan y no van quedan como `confirmed`. Para pasarlos a `no_show`
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
| Queda el aviso "Modo demo" | Las variables de entorno no llegaron. En Vercel: Settings → Environment Variables, y después **Redeploy** (las variables no se aplican a un deploy ya hecho). |
| "Email o contraseña incorrectos" con datos correctos | Falta confirmar el email. Revisá Authentication → Users: si dice *Waiting for verification*, el socio tiene que abrir el link del mail. |
| El mail de confirmación no llega | Límite del servicio gratuito de emails o el mail cayó en spam. Probá desactivando **Confirm email** o configurá un SMTP propio. |
| Al reservar dice "No pudimos completar la reserva" | Mirá los logs: Vercel → tu proyecto → **Logs**. Si dice `function book_session does not exist`, no corriste `00001_schema.sql`. |
| El panel dice "No tenés permisos" | Corré el `update public.profiles set role = 'admin' ...` y volvé a iniciar sesión. |
| El sitio redirige siempre a `/es` | Es lo normal: el idioma se detecta del navegador. El selector ES/EN del header lo cambia. |
| Las clases aparecen vacías | `sessions` está vacía. Corré `select public.generate_week_sessions(...)` (ver Paso 3). |

---

## Checklist final

- [ ] Los dos `.sql` corrieron sin errores
- [ ] `NEXT_PUBLIC_SUPABASE_URL` y `NEXT_PUBLIC_SUPABASE_ANON_KEY` están en Vercel
- [ ] El aviso de "modo demo" ya no aparece en el sitio publicado
- [ ] Probaste registrar un socio de punta a punta (registro → reservar → cancelar)
- [ ] Tu usuario tiene rol `admin` y ves el Panel
- [ ] En Supabase → Authentication → URL Configuration está tu dominio real
- [ ] `NEXT_PUBLIC_SITE_URL` apunta a tu dominio (para que los links de los emails sean correctos)
- [ ] Cambiaste los textos y datos del gimnasio en `src/config/site.ts` y los diccionarios
