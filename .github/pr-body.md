## Qué hace este cambio (OP-05, etapa 6)

Cierra la última etapa de OP-05: los entrenadores dejan de ser un dato
escondido y pasan a administrarse desde el panel, asignarse a cada horario y
llegar a las clases ya creadas sin escribir código ni tocar la base a mano.

1. **Pantalla nueva: Administración → Equipo de entrenadores**
   (`/panel/administracion/equipo`). Alta y edición con nombre, especialidad
   visible y **disciplinas que dicta**, elegidas de la lista real de clases.
   Dar de baja no borra nada: las clases ya programadas siguen con su
   entrenador y las nuevas no lo toman. Bitácora en `public.coach_audit`
   (quién, cuándo, qué acción y los nombres de los campos cambiados); la tabla
   no se puede leer desde la API. La pantalla explica qué se puede hacer y
   avisa que no se borra nada.
2. **Entrenador por grilla y por sesión.** El entrenador se elige en cada
   horario y baja a las sesiones. En **Horarios y clases** cada horario con
   entrenador tiene el botón **«Pasar a las clases ya creadas»**: primero
   muestra a cuántas clases afecta, cuántas ya lo tienen y cuáles se saltean
   por choque; recién después asigna. Guardar un horario sigue sin tocar el
   calendario.
3. **Previsualización y generación coinciden.** Antes el plan no mostraba el
   entrenador que el generador sí iba a usar. Ahora las dos resuelven igual
   (el del horario; si no hay, el primero activo que dicte esa disciplina), así
   el plan muestra a quién se le asigna y detecta también sus choques.

Antes, las 79 sesiones programadas habían quedado sin entrenador porque
`coaches.specialties` estaba vacía en los tres entrenadores. Con el catálogo se
completa desde la pantalla y no con texto adivinado.

## Base de datos

- Migración aditiva `00079_entrenadores_admin.sql`, **ya aplicada en
  producción** como `entrenadores_admin` (`20261030231745`):
  - tabla `coach_audit` con RLS solo para administradores;
  - `admin_coaches_catalog()`, `admin_save_coach()`, `admin_set_coach_active()`,
    `admin_slot_coach_plan()`, `admin_apply_slot_coach()`;
  - `_schedule_plan()` y `admin_apply_schedule()` reescritas para resolver el
    entrenador igual que la previsualización;
  - `notify pgrst` para refrescar el esquema de la API.
- Todo es aditivo: no se renombró ni se borró ninguna columna ni se movieron
  datos. Funciona sobre el esquema productivo real de `coaches`, que no tiene
  `slug`, `name` ni `sort_order` (se leen por `to_jsonb`).
- Permisos probados por rol: caja y entrenador no ven el catálogo ni pueden dar
  de alta; `anon` no puede ejecutar ninguna de las funciones nuevas.

## Pruebas

- `npm run test:sql` verde: 82 + 32 + 43 + **49** comprobaciones. Las 49 nuevas
  incluyen dos corridas sobre el esquema productivo de `coaches` y la
  detección de choque de entrenador.
- Suite Node **827/827** en verde, incluidas `tests/coaches-catalog.test.mjs`
  (10) y `tests/schedule-board.test.mjs` (12, con 3 casos nuevos).
- `npm run typecheck`, `npm run lint` y `npm run build` limpios.
- Verificado en producción dentro de una transacción revertida: alta, edición,
  guardado sin cambios, baja, reactivación, catálogo con 4 entradas de bitácora
  y asignación del entrenador a las 4 clases de un horario. Después del
  `rollback` quedó todo igual (3 entrenadores, 79 sesiones, 0 con entrenador,
  9 horarios, 0 bloqueos, 2 reservas).

## Qué falta después

- Probar en el celular con usuario administrador: catálogo, alta/edición, baja
  y «Pasar a las clases ya creadas».
- Mostrar quién dicta cada clase en la grilla pública (la vista existe, el
  nombre todavía no se muestra).
- Horarios de Zumba y su plan.
