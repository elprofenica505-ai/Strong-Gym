# Decisiones de seguridad y plan acordado

Registro de decisiones de seguridad confirmadas y de su motivo. **No es una
lista de tareas:** el seguimiento vivo está solo en
`docs/PENDIENTES-ACTUALES.md`. Actualizar este archivo cuando se tome una
decisión nueva; las notas de autorización del 18 de octubre son históricas y
no sustituyen decisiones posteriores del usuario.

Base de esta versión: 2026-10-26 · producción `main@3bede94` (PR #56). El PR
#14 y las migraciones 00031/00032 mencionados abajo ya se fusionaron/aplicaron.

## Decisiones confirmadas

1. **MFA con código de app (TOTP) se mantiene** como método principal para administradores y personal.
   - Motivo: es el método estable en Supabase y no depende de funciones experimentales.
   - Costo aceptado: pedir el código al iniciar sesión de nuevo (no al navegar).
2. **Correo como segundo factor: descartado.** Supabase lo clasifica como nivel 1 (igual que la contraseña), así que no cumple como verificación fuerte.
3. **"Recordar dispositivo" propio: descartado.** No lo trae Supabase y implementarlo a mano es riesgoso.
4. **Llave de acceso (huella / rostro / passkey): aprobada como fase posterior y como método ADICIONAL**, no como reemplazo.
   - El código de app queda como respaldo (cambio de celular, falla de huella).
   - Antes de implementarla hay que verificar que la función salga de versión experimental en Supabase.
5. **Varios administradores:** técnicamente posible, pero **cada alta es una decisión del dueño**. Cada persona activa su propio método. Se prepara sólo cuando el dueño lo pida, con su correo y autorización escrita.

## Estado del orden acordado

**Hecho 2026-10-18:**
- Paso 1: PR #14 mergeado a `main` (commit `3cc754c`).
- Paso 2: SQL `00031_personal_requiere_mfa.sql` aplicado en Supabase (`crm_is_staff()` exige `aal2`). Verificado: definición actualizada; `anon` sin permiso de ejecución.
- Verificación previa: único personal (administrador de prueba del desarrollador; correo exacto fuera de Git) con factor TOTP verificado.
- La prueba manual de ingreso y pantallas se hizo en tandas posteriores; las
  confirmaciones que aún falten se siguen solo en la lista única.

**Orden original (histórico):**

1. **Mergear PR #14** (MFA con código de app para admin/staff) — requiere autorización expresa.
2. **Cerrar el hueco en la base de datos:** exigir MFA (`aal2`) en las políticas de personal de Supabase, para que no se pueda consultar datos directamente por la API sin el segundo factor. — Requiere SQL preparado y autorización expresa.
3. **Dejar al dueño como segundo administrador** con su propio MFA, antes de retirar el acceso temporal. — Requiere su correo y autorización escrita.
4. **Llave de acceso (huella/rostro) como método adicional** — fase separada, sólo tras verificar estado de la función en Supabase, con pruebas y autorización.
5. **Otros administradores** (esposa u otra persona de confianza) — sólo a pedido del dueño.

## Guardas que siguen vigentes

Estas no son tareas; son límites de seguridad para cualquier tanda:

- Ningún alta de administrador se hace sin correo y autorización del dueño, y
  cada persona activa su propio MFA.
- No activar passkeys, captcha ni otro proveedor solo desde un panel sin
  construir y probar su flujo en la app.
- No pedir ni guardar contraseñas, semillas QR ni códigos MFA por chat o en Git.
- Todo cambio remoto de Auth, roles o políticas debe quedar identificado en la
  lista única con su verificación posterior.

Los datos que debe aportar el dueño —correo del gimnasio, su correo de
administrador y tipo de celular si se evalúa passkey— se siguen en
`docs/PENDIENTES-ACTUALES.md` (SEG-02, SEG-03 y FUT-01).

## Referencias

- `docs/PENDIENTES-ACTUALES.md` — única lista viva de tareas.
- `docs/MFA-PERSONAL.md` — guía de activación de MFA.
- `docs/REVISION-CORREO-AUTH.md` — nota histórica del estado del correo y de
  las restricciones del servicio integrado.

## 2026-10-23 · `braces` (GHSA-vfj7-8cjw-p6xm): parche propio y prueba de regresión

**Situación:** `eslint-config-next` → `@next/eslint-plugin-next` → `fast-glob` → `micromatch` → `braces@3.0.3`. El aviso (severidad alta) describe un desborde de pila al expandir patrones con llaves muy anidadas. No hay versión publicada que lo corrija: 3.0.3 es la última y la rama canaria de Next sigue fijando `fast-glob@3.3.1`.

**Decisión:** no ocultar el aviso ni bajar `eslint-config-next`. Se aplica un parche propio, versionado en el repositorio:

- `patches/braces+3.0.3.patch`: límite de 1000 llaves anidadas en `lib/parse.js`; lanza `SyntaxError` en vez de desbordar la pila (antes: `RangeError: Maximum call stack size exceeded`).
- `package.json`: `"postinstall": "patch-package"` y `patch-package` como dependencia de desarrollo. `npm ci` aplica el parche solo.
- `tests/braces-depth.test.mjs`: comprueba que el patrón profundo se rechaza y que los patrones normales siguen funcionando.

**Alcance:** es una herramienta de desarrollo (lint y globs de configuración); no se incluye en la app publicada. `npm audit` puede seguir nombrando el aviso porque la versión publicada no cambió: la corrección es de código, no de número de versión.

**Cuándo retirar el parche:** cuando se publique una versión de `braces` que incluya la corrección (o `micromatch` deje de depender de `braces`): actualizar, borrar `patches/braces+3.0.3.patch`, quitar `postinstall` si no quedan otros parches y correr las pruebas.
