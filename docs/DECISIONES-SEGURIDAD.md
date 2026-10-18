# Decisiones de seguridad y plan acordado

Registro de lo que el dueño/usuario confirmó y de lo que **todavía no está autorizado**.
Actualizar este archivo cada vez que se tome una decisión nueva.

Fecha de esta versión: 2026-10-18 · Rama: `arena/85c54d7d-strong-gym` · PR abierto: #14 (sin merge).

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

## Orden acordado

1. **Mergear PR #14** (MFA con código de app para admin/staff) — requiere autorización expresa.
2. **Cerrar el hueco en la base de datos:** exigir MFA (`aal2`) en las políticas de personal de Supabase, para que no se pueda consultar datos directamente por la API sin el segundo factor. — Requiere SQL preparado y autorización expresa.
3. **Dejar al dueño como segundo administrador** con su propio MFA, antes de retirar el acceso temporal. — Requiere su correo y autorización escrita.
4. **Llave de acceso (huella/rostro) como método adicional** — fase separada, sólo tras verificar estado de la función en Supabase, con pruebas y autorización.
5. **Otros administradores** (esposa u otra persona de confianza) — sólo a pedido del dueño.

## Lo que NO está autorizado (no hacer sin orden nueva)

- Mergear PR #14.
- Cualquier cambio SQL o de políticas en la base remota.
- Cambios de configuración en Supabase (sesiones, MFA, passkeys).
- Cambios de roles o nuevos administradores.
- Activar llave de acceso.
- Enviar correos reales.

## Pendientes de información

- Correo del gimnasio (para recuperación de cuentas).
- Correo del dueño (para su alta como administrador).
- Confirmación de si el dueño usa celular Android o iPhone (afecta la llave de acceso).

## Referencias

- `docs/MFA-PERSONAL.md` — guía de activación y pendientes.
- `docs/REVISION-CORREO-AUTH.md` — estado del correo y restricciones del servicio integrado.
