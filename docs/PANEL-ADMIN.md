# Panel admin: corrección y comprobación desde el celular

## Qué se encontró en el código

1. El guard de `/es/panel` y el menú reconocían correctamente `admin`/`staff`.
2. `getCurrentUser()` ignoraba el error al consultar `public.profiles`. Si RLS,
   la conexión o el perfil fallaban, devolvía `role: 'member'`: falsa denegación
   y menú sin Panel. Ahora el rol queda sin verificar (`null`) y el panel muestra
   un diagnóstico distinto. No se concede acceso por email ni metadata.
3. El proxy enviaba cookies renovadas al navegador, pero no al render actual.
   Ahora ambos reciben la sesión nueva, conservando la cookie de idioma y los
   encabezados de no-cache que emite Supabase SSR.
4. `/es/admin` no existía. Ahora redirige a `/es/panel`; también funciona en inglés.
5. El Service Worker podía guardar HTML del panel/cuenta y devolver una sesión o
   denegación anterior sin red. La versión v2 borra esas cachés y sólo permite
   cachear las pantallas offline, no panel, cuenta, inicio ni respuestas RSC.

Las tarjetas **Caja y cuentas** y **Herramientas** ya existían. No se modificaron
la estética oscura/roja, los seeds, los roles de la base ni las migraciones.

**Límite:** estos hallazgos y pruebas locales no confirman la causa exacta en
producción. No se ha accedido a la sesión ni a la base real del administrador.

## Validar el PR antes de publicar

1. Abrí el PR y verificá los checks. El PR no debe mergearse sin autorización.
2. Abrí el Preview de Vercel si se genera. Necesita las variables Supabase del
   entorno Preview; sin ellas entra en modo demo y NO valida permisos reales.
3. Iniciá sesión con tu cuenta habitual. Nunca compartas contraseña, claves o tokens.
4. Abrí `/es/admin`: debe llevar a `/es/panel`.
5. Abrí el menú hamburguesa: debe aparecer **Panel** para admin/staff.
6. En el panel deben verse **Caja y cuentas** y **Herramientas**. Abrí ambas.
7. Con una cuenta member, el panel debe denegar acceso y el menú no debe mostrarlo.
8. Sólo después de autorizar el merge, esperá el deploy de producción y repetí
   los pasos en https://strong-gym-gamma.vercel.app/es/panel.

Redesplegar el commit anterior no instala esta corrección. Si cambian variables
públicas de Supabase en Vercel, sí hace falta un nuevo build/deploy.

## Si el Preview o producción todavía falla

1. **“No pudimos verificar tu perfil”**: compará el ID mostrado con el ID que
   verificaste en Supabase. El rol no se reemplaza por member silenciosamente.
2. **“No tenés permisos”**: la pantalla muestra el ID y el rol realmente leído
   desde `public.profiles`. Comparalos con el proyecto/usuario esperado.
3. Si redirige a ingresar, no se pudo verificar la sesión del request.
4. Revisá que `NEXT_PUBLIC_SUPABASE_URL` y `NEXT_PUBLIC_SUPABASE_ANON_KEY` en el
   entorno del deploy pertenezcan al MISMO proyecto de Supabase consultado.
   No publiques sus valores ni uses una clave service_role en el navegador.
5. En los logs del servidor, buscá `[auth/profile]`: se registra el código del
   error, nunca cookies, tokens ni el contenido del perfil.
6. Si hace falta comprobar RLS, esta consulta de diagnóstico simula el usuario
   autenticado, dentro de una transacción que termina en rollback. Es sólo lectura
   de datos; **no** promueve usuarios ni desactiva RLS:

```sql
begin;
select set_config('request.jwt.claims',
  '{"sub":"10be1244-4fd5-459b-9995-1d195e9e8ec1","role":"authenticated"}', true);
select set_config('request.jwt.claim.sub',
  '10be1244-4fd5-459b-9995-1d195e9e8ec1', true);
set local role authenticated;
select auth.uid() as session_id, public.is_staff() as is_staff;
select id, role from public.profiles where id = auth.uid();
rollback;
```

El resultado esperado, si esa base tiene el perfil indicado como admin, es
`is_staff = true` y una fila con `role = admin`. Un SELECT como dueño desde el
SQL Editor no prueba por sí solo que el usuario pueda leer esa fila con RLS.
Si la consulta falla, ejecutá `rollback;` antes de seguir y conservá el error exacto.
No volver a aplicar SETUP ni cambiar políticas a ciegas.

## Pruebas locales reproducibles

```sh
npm ci
npm run typecheck
npm run lint
npm run build
npm run test:sql
npm run test:auth
node scripts/build-sql.mjs --check
```

`test:auth` prueba roles, fallos de perfil, render real de panel/menú con datos
simulados, alias ES/EN, refresco de cookies con el SDK real y caché del SW.
No sustituye una prueba en navegador con la cuenta real. `test:sql` también
comprueba que admin y member pueden leer su propio rol bajo RLS y que el socio
no puede leer el perfil del admin.
