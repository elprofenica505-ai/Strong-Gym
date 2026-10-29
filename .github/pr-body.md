## Qué se arregló

La pantalla se sentía confusa. Buscando por qué, la causa de fondo no era el diseño: era un **efecto oculto**. Guardar un horario (o suspenderlo, o reactivarlo) creaba por su cuenta las clases de las próximas cuatro semanas. Así, la misma clase podía aparecer por dos caminos distintos —guardar y el botón de generar— y nadie sabía de dónde había salido.

### La lógica ahora es un paso, un efecto

| Antes | Ahora |
|---|---|
| Guardar un horario creaba 4 semanas de clases sin avisar | Guardar **solo** cambia tu semana fija |
| Se podía generar por dos caminos distintos | Las clases con fecha se crean en **un único lugar**: el paso 2 |
| Al reactivar un horario aparecían clases solas | Reactivar no resucita nada; se crean al pasar al calendario |
| «Sesión», «grilla», «anular», «bloqueo» | «Clase», «horario fijo», «suspender», «cerrar» |

### La pantalla quedó en tres pasos

Con un recuadro **«¿Cómo funciona esta pantalla?»** arriba que lo explica en tres renglones:

1. **Tu semana fija** — lo que se repite cada semana. «Boxeo, martes a las 06:00». Se agrega, se cambia y se suspende acá.
2. **Pasar la semana al calendario** — ahí las clases reciben fecha. Muestra cuántas se crearían y cuáles no, con el motivo en castellano («esa sala ya está ocupada a esa hora», «ese día está cerrado»). El período avanzado (fecha y semanas) está plegado: por defecto son las próximas 4 semanas.
3. **Días que no abrís** — feriados, vacaciones, profesor enfermo. Ahora se elige **primer día** y **último día** en el calendario, no dos fechas con hora.

Además: al guardar un horario, la pantalla avisa «todavía no tiene fechas: pasalo al calendario en el paso 2» y prepara sola la previsualización, sin escribir nada. El menú pasó de «Horarios y grilla» a **«Horarios y clases»**.

## Base de datos

Migración `00076` (`horario_no_genera_solo`), **ya aplicada en producción**: `admin_save_schedule_slot()` y `admin_set_schedule_slot_active()` dejan de llamar al generador. Mismas firmas, mismos permisos, mismas validaciones y mismos choques. `p_weeks` se sigue aceptando por compatibilidad, sin efecto; `created_sessions` sigue viniendo, siempre en 0. Reversión: volver a las definiciones de `00072`. No toca datos.

## Verificación

- `test-op05-sql.mjs`: **82 comprobaciones PASS** (eran 79), con tres nuevas que fijan la regla: guardar un horario activo no crea clases, reactivar tampoco, y las clases se crean recién al pasar la semana al calendario.
- `tests/schedule-board.test.mjs` **9/9** y `tests/schedule-blocks.test.mjs` **8/8**. Total del proyecto: **795/795**.
- `tsc`, `eslint` y `next build` limpios.
- En producción, dentro de una transacción revertida: guardar dos horarios activos → 0 clases creadas; previsualizar la semana → 2 por crear; aplicar → 2 creadas; suspender → 0 creadas. Después del rollback: **79 clases, 9 horarios, 0 cierres**, igual que antes.

## Pendiente de aceptación

Que el usuario abra **Administración → Horarios y clases** en el celular y confirme si ahora se entiende.
