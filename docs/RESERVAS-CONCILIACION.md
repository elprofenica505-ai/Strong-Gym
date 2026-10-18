# Reserva no visible en Mi cuenta — 17 oct 2026

## Evidencia y estado

Usuario, sesión de prueba Carlicheta, intentó reservar Boxeo del 20 de octubre
2026 a las 06:00–07:00 Managua. Capturas 18:44–18:45 muestran 1/20 y 19 lugares
libres, pero el botón sigue «Reservar» y Mi cuenta muestra cero reservas y ninguna
próxima. **No se acepta esta operación como persistencia correcta.**

El cambio a 1/20 puede proceder del incremento local del frontend, no de PostgreSQL.
No se conoce todavía si el intento existe en la base, si pertenece a la identidad
esperada, si la lectura está oculta por RLS o si difiere el contrato del RPC remoto.
No se debe asignar una causa remota concreta sin el diagnóstico.

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

## Diagnóstico remoto pendiente

`supabase/DIAGNOSTICO-RESERVA.sql` contiene un solo SELECT con UNION ALL:

1. Identidad/rol del correo de prueba conocido, sin tokens ni contraseñas.
2. Sesiones del instante probado, ocupación efectiva y reservas de esa cuenta.
3. Políticas de bookings (incluidas restrictivas si las hay).
4. RLS/forceRLS y SELECT de authenticated.
5. Definiciones y firmas de book_session/cancel_booking.

No ejecuta esas funciones; consulta sus definiciones. No hay INSERT/UPDATE/DELETE,
ni cambios de esquema/permisos. Probado sintácticamente en PGlite: cinco apartados.
Usuario lo ejecutará en SQL Editor y compartirá el resultado exportado como CSV.
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
