# Reserva no visible en Mi cuenta — 17 oct 2026

## Evidencia y estado

Usuario, sesión de prueba Carlicheta, intentó reservar Boxeo del 20 de octubre
2026 a las 06:00–07:00 Managua. Capturas 18:44–18:45 muestran 1/20 y 19 lugares
libres, pero el botón sigue «Reservar» y Mi cuenta muestra cero reservas y ninguna
próxima. **Recorrido no aceptado entonces; la persistencia se confirmó después mediante CSV (véase abajo).**

Antes del CSV, el cambio a 1/20 podía proceder del incremento local del frontend.
No se dio por confirmada la persistencia ni se asumió una causa sin diagnóstico.

No repetir la reserva, no cancelar ni crear otra ficha/cuenta. El agente no ha
reservado ni cancelado nada en Supabase. PR10 sigue abierto sin merge.

## Defectos de interfaz/confirmación encontrados y corregidos

- Antes: cualquier POST HTTP200 era éxito; se ignoraba su cuerpo. Después de
  releer reservas, incluso un fallo/GET vacío permitía devolver `ok:true`.
- Ahora: el RPC y el POST deben devolver un comprobante de reserva con id,
  session_id exacto y estado confirmed. Un RPC vacío/incoherente devuelve
  UNCONFIRMED503 y respuestas privadas/no-store.
- En el contexto del navegador, también debe aparecer el mismo id/sesión/estado
  en la lectura posterior de la cuenta. Un fallo o discrepancia no devuelve éxito:
  conserva datos anteriores como no confirmados y bloquea nuevas mutaciones hasta
  revisar la lectura. Retirar la sesión impide que respuestas tardías afecten a
  otra identidad.
- Una cancelación sólo se confirma al leer su fila como cancelled. Peticiones
  POST/DELETE tienen límite15s; un fallo de transporte es incierto, no éxito.
- Horarios ya no suma/resta ocupación localmente tras la mutación: vuelve a leer
  la ocupación del servidor. Si falla, muestra el error de lectura.
- Mensaje ES/EN UNCONFIRMED: revisar Mi cuenta y no reservar otra vez todavía.

Esto evita una confirmación y contador inventados; **no sustituye reparar la causa
remota que impide ver la reserva**. Tampoco demuestra concurrencia de reservas,
ni cambia sus reglas de cupos, límite3 o cancelación3horas.

## Diagnóstico remoto recibido

`supabase/DIAGNOSTICO-RESERVA.sql` contiene un solo SELECT con UNION ALL:

1. Identidad/rol del correo de prueba conocido, sin tokens ni contraseñas.
2. Sesiones del instante probado, ocupación efectiva y reservas de esa cuenta.
3. Políticas de bookings (incluidas restrictivas si las hay).
4. RLS/forceRLS y SELECT de authenticated.
5. Definiciones y firmas de book_session/cancel_booking.

No ejecuta esas funciones; consulta sus definiciones. No hay INSERT/UPDATE/DELETE,
ni cambios de esquema/permisos. Probado sintácticamente en PGlite: cinco apartados.
Usuario lo ejecutó en SQL Editor y compartió el resultado como CSV.
No repetir SQL de instalación ni aplicar una política abierta para ocultar el fallo.

## Pruebas

API: rechaza RPC nulo, incompleto, con otra sesión o cancelado; conserva referencia
válida. React: POST exitoso + GET vacío, otra id o estado distinto no confirma;
contrato inválido tampoco; POST/GET coincidentes sí confirma y activa reservado;
cancelación conciliada o divergente; UNCONFIRMED bloquea segundo envío. Horarios
se prueba con ocupación autoritativa7/20 tras reservar (no contador local1/20).

Resultados finales y CI del commit se registran en el comentario de PR10. La
comparación remota de plan ya se observó correcta («Gimnasio mensual»); no repetir
PLAN-CUENTA. El aviso de saldo vinculado y el texto «Hoy:06:00» son otros pendientes.

### Salida real local final

```text
npm run typecheck
> tsc --noEmit
(exit 0)
npm run lint
✖ 10 problems (0 errors, 10 warnings)
(exit 0)
npm run build
✓ Compiled successfully in 2.9s
✓ Generating static pages using 1 worker (40/40) in 379ms
(exit 0)
npm run test:auth
# tests 340
# pass 340
# fail 0
(exit 0)
npm run test:sql
🎉 Todo pasó
🎉 CRM: 49 comprobaciones pasaron
🎉 Compatibilidad CRM: 69 comprobaciones pasaron
🎉 Escritura financiera: 86 comprobaciones pasaron (PGlite; sin concurrencia multiconexión ni SQL remoto)
🎉 Plan propio: 22 comprobaciones pasaron (PGlite, dos esquemas; sin SQL remoto).
(exit 0)
```

Logs: `/home/user/booking-reconcile-{auth,sql,typecheck,lint,build}.log`.


## Causa remota confirmada y reparación de lectura

Archivo recibido: `Supabase Snippet Untitled query (3).csv` (no se añade al Git).

- Identidad de prueba: `34379751-3dc0-4c97-9a4e-4106e9a36bea`, rol member.
- Sesión: `562f35ba-7249-4d23-96d4-48da64daa113`, scheduled, capacidad20,
  20-oct-2026 06:00–07:00 Managua, ocupación real1.
- Reserva: `0fee38d9-1b12-44c2-a79d-f6e63c3d383d`, confirmed, pertenece a esa
  identidad, creada el17-oct a18:44:12 Managua (18-oct00:44:12 UTC).
- `bookings`: RLStrue, forceRLSfalse, authenticated tiene SELECT, **cero políticas**.
- `book_session(text)` es SECURITY DEFINER y escribe usando auth.uid().

El writer pudo guardar con sus permisos de definidor, pero la lectura habitual
bajo authenticated estaba sometida a denegación por defecto de RLS. No era una
reserva de otra cuenta ni había que crear otra. Las funciones del CSV coinciden
con el contrato esperado; no hace falta reemplazarlas para resolver esta lectura.

Migración00026 y `supabase/LECTURA-RESERVAS.sql`:

- Mantiene RLS habilitado y añade una política SELECT para authenticated:
  `user_id = auth.uid() or public.crm_is_staff()`.
- El cliente lee sólo sus filas; admin/staff según profiles pueden consultar las
  reservas. Sin acceso anónimo ni SELECT público.
- No agrega políticas INSERT/UPDATE/DELETE ni cambia book_session/cancel_booking.
- No borra otras políticas existentes. Sólo reemplaza su propia política versionada
  para hacer la instalación idempotente. No puede eliminar restricciones adicionales
  que pudieran existir en otra base.
- No actualiza, duplica ni cancela registros, ni toca dinero, perfiles o planes.
- Se incluye también en los generados para futuras instalaciones; en esta base
  ejecutar **sólo LECTURA-RESERVAS.sql**, no SETUP/FASE2/ACTUALIZAR.

### Comprobación remota pendiente tras instalar

Recargar como Carlicheta. Mi cuenta debe recuperar la reserva **original** del20-oct
06:00, con una próxima reserva; Horarios debe mostrar1/20,19libres y «Cancelar
reserva» para esa clase. No reservar de nuevo ni cancelar aún. No se da la
instalación por ejecutada hasta la respuesta del usuario.

### Nuevas pruebas locales

42 comprobaciones PGlite en esquemas repository y bank_accounts_split: reproducen
exactamente RLS sin políticas, RPC que guarda y SELECT vacío; tras aplicar dos veces
la corrección se recupera la misma referencia, no se alteran datos/funciones, hay
privacidad entre dos clientes, acceso staff/admin, retirada de rol, anonimato,
operaciones directas denegadas en ese escenario, cancelación por RPC y liberación
exacta del cupo. También se verifica conservar una política ajena preexistente.

```text
npm run typecheck
> tsc --noEmit
(exit 0)
npm run lint
✖ 10 problems (0 errors, 10 warnings)
(exit 0)
npm run build
✓ Compiled successfully in 2.5s
✓ Generating static pages using 1 worker (40/40) in 781ms
(exit 0)
npm run test:auth
# tests 340
# pass 340
# fail 0
(exit 0)
npm run test:sql
🎉 Todo pasó
🎉 CRM: 49 comprobaciones pasaron
🎉 Compatibilidad CRM: 69 comprobaciones pasaron
🎉 Escritura financiera: 86 comprobaciones pasaron (PGlite; sin concurrencia multiconexión ni SQL remoto)
🎉 Plan propio: 22 comprobaciones pasaron (PGlite, dos esquemas; sin SQL remoto).
🎉 Lectura de reservas: 42 comprobaciones pasaron (PGlite, dos esquemas; sin SQL remoto).
(exit 0)
```

Logs: `/home/user/booking-read-{targeted,sql,auth,typecheck,lint,build}.log`.
No se ejecutó SQL remoto por el agente. No merge ni limpieza.
