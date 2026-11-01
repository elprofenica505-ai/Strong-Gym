# Strong Fitness Gym — Lista única de pendientes

**Esta es la única lista viva de tareas del proyecto.**

Si otro documento dice «pendiente», «fase siguiente» o «sin implementar», se
interpreta como una nota histórica y **manda esta lista**. Los demás documentos
pueden explicar decisiones, guías de uso o cómo se construyó una parte, pero no
crean tareas nuevas.

Última auditoría completa: **1 de noviembre de 2026**, sobre producción
`main@d4e1548` (PR #115) y Supabase `hcnuepdxmbsmlzdmvwhx`.

## Cómo mantener esta lista

1. **Una tarea, un solo ID.** No se crea otra lista por fase, módulo o PR.
2. Al terminar una tarea, se marca aquí en el mismo PR que la cierra y se deja
   una línea breve en «Cerrado y comprobado», con fecha, PR o evidencia.
3. Si hace falta un documento técnico nuevo, explica el diseño o la operación;
   el seguimiento sigue viviendo aquí y se enlaza por ID.
4. No se repite la misma tarea en una etapa, una fase y un módulo. El mapa de
   fases solo remite a los ID.
5. Ninguna tarea de esta lista autoriza por sí sola borrar datos, cambiar
   cuentas, cambiar roles o ejecutar SQL remoto. Eso requiere la orden y las
   comprobaciones propias de cada tanda.

### Qué significa «terminado»

Una tarea no se cierra solo porque compila o porque una pantalla se abre.
Según el caso, debe cumplir:

- Guardar en servidor/base y seguir viéndose tras recargar y en otra sesión.
- Aplicar permisos por rol en UI, servidor y RLS/RPC, con casos denegados.
- No convertir errores en éxito, cero o lista vacía.
- Evitar duplicados ante doble clic, reintento o respuesta perdida.
- En dinero, no mezclar monedas ni borrar movimientos para corregirlos.
- Tener pruebas automatizadas proporcionales y, cuando haga falta, prueba
  guiada en celular o con cuentas reales de prueba.
- Dejar claro qué datos de prueba se crearon, sin limpiarlos sin orden.

## Foto actual comprobada

- Producción: `main` con FIN-05 (PR #104), la baja de vigencia al anular
  (PR #105), el uso e historial de precios de los planes (PR #108), **FIN-04**
  completo: apertura, arqueo y cierre de caja (PR #110) más el bloqueo de
  anulaciones de una caja cerrada (PR #111), y **EX-01**, la biblioteca de
  ejercicios con «Mi rutina» y su catálogo de 701 ejercicios; CI en verde en
  todos. La 00085 ya
  está aplicada en producción y los datos de vigencias quedaron alineados.
- Supabase: proyecto ACTIVE_HEALTHY. Las migraciones aplicadas y registradas
  llegan a la **00092** (`biblioteca_solo_de_gimnasio`, registrada como
  `20261101010752`), que deja a la vista sólo lo que es de sala. Antes: **00091**
  (`orden_de_gimnasio`, registrada como
  `20261031234712`): la 00087 (`cierre_y_arqueo_de_caja`, `20261031213955`)
  agrega abrir, arqueo y cierre, la 00088 impide anular el efectivo de una caja
  ya cerrada, la 00089 (`biblioteca_de_ejercicios`, `20261031225118`) crea el
  catálogo y «Mi rutina», la 00090 arregla el filtro «Peso corporal» y la 00091
  ordena el catálogo como un gimnasio. El siguiente número libre es **00093**.
- Datos productivos al 31 de octubre, comprobados con consulta directa:
  **9 disciplinas** (activas: Pesas y máquinas, Boxeo y Zumba), **6 planes**
  activos, **89 sesiones** (88 programadas y 1 anulada), **2 reservas**,
  **12 horarios fijos** y **3 entrenadores**.
- **Honestidad de los avisos financieros:** un error de lectura nunca se
  muestra como cero ni como lista vacía, y una anulación sin respuesta
  confirmada ya no afirma «no se modificó nada» (ver FIN-01 y FIN-08).
- Nota permanente de la 00049: sus tablas y funciones principales existen en
  producción, pero su nombre no aparece en el historial remoto de migraciones.
  **No volver a ejecutarla sin investigar.**
- Las cuentas y correos de prueba del usuario siguen intactos por decisión
  suya, para seguir probando antes de mostrar la app al dueño.
- Supabase Auth verificado: JWT de 1200 segundos, TOTP activo, SMTP propio
  sin configurar (SEG-02) y `password_min_length = 12` desde el cierre de
  SEG-01.

## Orden recomendado de trabajo

| Orden | Trabajo | Motivo |
|---:|---|---|
| 1 | **QA-08** (celular) | Cierra Zumba: grilla pública, cobro del plan y horarios del panel. Es lo último que se publicó. |
| 2 | **QA-03, QA-04 y QA-05** (celular y cuentas reales) | Son aceptaciones de cosas ya desplegadas; sin ellas no se puede decir «terminado». |
| 3 | **QA-09 y QA-06** (celular) | Aceptar lo que ya está desplegado: vigencias, categorías, calendario, el uso y el historial de precios de los planes (CLI-07) y **abrir, contar y cerrar la caja** (FIN-04). |
| 4 | **OP-06, FIN-03 a FIN-07, CAL-01/03, LEG-01 y NEG-01** | Reglas de negocio y entrega; no bloquean la operación diaria de hoy. |

## Resumen de avance al 31 de octubre de 2026

**64 tareas listadas: 21 cerradas y 43 abiertas.** De las 43 abiertas, **7 son
aceptaciones** en celular o con cuenta real (QA-03 a QA-09), **5 son de
entrega** (ENT-01 a ENT-05, aplazadas a propósito) y **8 son opcionales del
futuro** (FUT-01 a FUT-08). Quedan **23 de producto o negocio** por resolver,
**ninguna** en Administración → Planes.

| Fase o bloque | Estado | Qué falta |
|---|---|---|
| **Etapa 1 — Proteger lo construido** | Código cerrado y desplegado | SEG-02 (correo propio y recuperación real), SEG-03 (segundo administrador y respaldo MFA), SEG-05 y SEG-06 (monitoreo y grants) y SEG-07 (límites de abuso) |
| **Etapa 2 — Navegación** | Hecha: Inicio, Clientes, Finanzas, Operación, Administración y Mis clientes | Solo la decisión de OP-09 |
| **Etapa 3 — Operación diaria** | OP-01 a OP-05 cerradas y desplegadas | OP-06 (cierre de reservas pasadas), OP-07 (cambio de día sin recargar), OP-08 (vincular ficha con cuenta web) y la aceptación QA-09 |
| **Clientes, vigencias y planes** | CLI-01, CLI-02 y CLI-06 cerradas y desplegadas | Aceptación en celular (QA-09); decisiones CLI-03, CLI-04 y CLI-05 |
| **Biblioteca de ejercicios (EX-01 y EX-02)** | Cerrada: **467 ejercicios de sala** de 774 cargados, movimiento con botón «Ver movimiento», color por familia de equipo, ficha, cronómetro y «Mi rutina» | Aceptación en celular; decisiones del dueño sobre favoritos y acceso sin sesión |
| **Etapa 4 — Finanzas y productos** | En uso real: cobros, gastos, deudas y abonos NIO/USD, vuelto, productos con stock, Caja por módulos con historial paginado, **apertura y cierre con arqueo**, reportes y descargas | FIN-03, FIN-06 y FIN-07 |
| **Calendario y disciplinas (OP-05)** | Cerrado y desplegado, con grillas, sesiones sueltas, bloqueos, generador con vista previa y entrenadores | Solo la aceptación en celular (QA-09) |
| **Etapa 5 — Aceptación integral** | Parcial: QA-01 y QA-02 cerradas | QA-03 a QA-08, CAL-03, LEG-01 y NEG-01 |
| **Etapa 6 — Entrega al dueño** | Sin empezar, a propósito | ENT-01 a ENT-05 y SEG-03 |
| **Futuro opcional** | No bloquea nada | FUT-01 a FUT-08 |

---

## 1. Operación diaria y horarios

La evidencia principal está en `src/components/admin/admin-panel.tsx`,
`src/app/[locale]/panel/operacion/page.tsx` y `src/lib/data/queries.ts`.

- [x] **OP-01 · Alta · Código — Guardar asistencia, inasistencia y cancelación
  administrativa de reservas.** Cerrado el 26 de octubre de 2026 con la
  migración 00061 (`estado_reservas_personal`, versión remota
  `20261027040552`), la RPC `staff_set_booking_status()` y
  `POST /api/admin/bookings`. Solo administración/caja con MFA; la pantalla
  cambia tras la confirmación del servidor y la RPC valida estado esperado,
  transiciones, sesión y cupo. Evidencia: 40 comprobaciones SQL por rol y 11
  pruebas de reglas/API; la aceptación integral sigue en CAL-03.
- [x] **OP-02 · Alta · Código — Guardar mensajes leídos/no leídos.** Cerrado el
  26 de octubre de 2026 con las migraciones 00062–00063
  (`mensajes_leidos_personal` y su alineación, versiones remotas
  `20261027043633` y `20261027044010`), la RPC `staff_set_message_read()` y
  `POST /api/admin/messages`. Solo administración/caja con MFA; la pantalla
  cambia tras la confirmación del servidor, muestra error sin fingir el guardado
  y conserva el estado tras recargar. La migración también restauró la lectura
  del personal, exige que el alta pública nazca como no leída y retiró el
  `UPDATE`/`DELETE` directo sobre `messages`. Evidencia: 35 comprobaciones SQL
  por rol y 9 pruebas de reglas/API; la aceptación integral sigue en CAL-03.
- [x] **OP-03 · Alta · Código — Guardar activación/desactivación de
  disciplinas.** Cerrado el 27 de octubre de 2026 con la migración 00064
  (`disciplinas_activas`, versión remota `20261027060406`), la RPC
  `admin_set_class_active()` y `POST /api/admin/classes`. Solo administración
  con MFA puede cambiar el estado; caja no escribe catálogos y la pantalla solo
  cambia tras la confirmación del servidor. Al desactivar, la disciplina sale
  del catálogo y de Horarios y `book_session()` rechaza reservas nuevas con
  `CLASS_INACTIVE`; no se cancelan sesiones ni reservas ya hechas, y al
  reactivar vuelven la visibilidad y las reservas para sesiones programadas.
  La escritura directa sobre `classes` quedó cerrada y se conserva su lectura
  pública. Evidencia: 40 comprobaciones SQL por rol, 18 pruebas focalizadas de
  contrato/API/reserva y verificación remota sin cambios en 9 disciplinas, 52
  sesiones y 2 reservas; la aceptación integral sigue en CAL-03. Ajuste del
  27 de octubre: en la prueba desde el celular la pestaña Clases quedaba fuera
  de pantalla por el desplazamiento lateral; ahora las pestañas de Operación
  se ven en cuadrícula 2×2 en móvil, sin desplazar. Ajuste posterior del mismo
  día: los bloques promocionales fijos de la página principal y la tarjeta de
  precio asociada también siguen `is_active`; al desactivar Boxeo o Zumba ya
  no se anuncian en portada, cinta, tarjetas fijas, bloque especial, Precios,
  textos promocionales de Equipo, preguntas, pie, encabezado ni Horarios.
  La verificación pública detectó además que la lista de sesiones conectada a
  la base no aplicaba el filtro; ahora la vista pública excluye disciplinas
  inactivas y solo Operación puede pedirlas explícitamente.
- [x] **OP-04 · Alta · Código/operación — Generar sesiones futuras sin depender
  de SQL manual.** Cerrado y aprobado el 27 de octubre de 2026 con las
  migraciones 00065 (`generar_sesiones_futuras`, versión remota
  `20261028001706`) y 00066 (`coaches_specialties_generador`, versión remota
  `20261028011737`), la RPC `admin_generate_future_sessions()` y
  `POST /api/admin/sessions/generate`. En **Operación > Clases**, solo
  administración con MFA puede generar las próximas 4 semanas completas desde
  el próximo lunes, reutilizando la grilla vigente con candado por transacción
  e idempotencia. La primera pulsación real falló sin crear sesiones porque
  el generador histórico buscaba `coaches.specialties` y producción solo
  tenía el texto visible `specialty`; la 00066 restauró esa columna sin
  inferir slugs ni cambiar entrenadores, sesiones o reservas. El usuario
  repitió la prueba desde el celular: la primera pulsación creó **27 sesiones
  nuevas** y la segunda confirmó que no hacía falta crear ninguna. La
  verificación posterior encontró 79 sesiones, 9 en cada semana del 26 de
  octubre y del 2, 9, 16 y 23 de noviembre, 0 duplicados, 2 reservas sin
  cambios y última sesión el 26 de noviembre a las 20:00. Evidencia: 27
  comprobaciones SQL por rol/divergencia productiva y 10 pruebas de
  contrato/API/UI/migración; la aceptación integral sigue en CAL-03. La
  administración avanzada de grillas y excepciones queda en OP-05.
- [x] **OP-05 · Media · Código — Administrar disciplinas, grillas, sesiones y
  excepciones del calendario.** **Código cerrado, aplicado y desplegado**
  (00072–00079, PR #80 a #90 y el arreglo del incidente en #92). Falta solo el
  recorrido en celular, que está en **QA-09**. Alcance ampliado el 27 de
  octubre de 2026 a petición del usuario, después de aprobar OP-04.
  **Primera etapa hecha (migración 00072):** la grilla semanal dejó de ser una
  plantilla fija escrita en SQL y pasó a ser datos en
  `class_schedule_slots` (disciplina, día, hora, duración, cupo, sala,
  entrenador y vigencia desde/hasta). `generate_week_sessions()` lee esa
  tabla; la migración cargó como semilla los nueve horarios de Boxeo que ya
  existían, así que el calendario no cambió solo. Pantalla nueva
  **Administración → Horarios y clases** (`/panel/administracion/horarios`):
  agregar, editar, anular y reactivar horarios; al guardar se crean las
  sesiones de las próximas cuatro semanas sin duplicar y sin tocar reservas.
  Se rechazan choques de la misma sala o del mismo entrenador en el mismo día
  y horario. Solo administración con MFA; la tabla no es accesible desde la
  API. Anular un horario deja la fila (`is_active = false`) y conserva las
  sesiones ya creadas. Evidencia: 33 comprobaciones SQL nuevas y 4 de la
  pantalla; `typecheck`, `lint` y `build` limpios. Aplicada en producción como
  `20261029061123 grilla_horarios`; los hashes `md5(pg_get_functiondef)` de las
  cinco funciones coinciden con los locales salvo comentarios. Al aplicarla se
  confirmó que `coaches.sort_order` **no existe** en la base productiva
  (divergencia con las migraciones): la grilla ordena entrenadores por `id` y no
  depende de esa columna.
  **Orden y claridad del 29 de octubre (migración 00076, aplicada en
  producción como `horario_no_genera_solo`):** el usuario dijo que la pantalla
  se sentía confusa. Se encontró la causa de fondo: un efecto oculto. Guardar,
  editar, suspender o reactivar un horario creaba por su cuenta las clases de
  las próximas cuatro semanas, así que la misma clase podía aparecer por dos
  caminos distintos y nadie sabía de dónde salió. Ahora **guardar un horario
  solo cambia la semana fija**; las clases con fecha se crean únicamente en el
  paso 2 (`admin_apply_schedule`). Las firmas no cambian: `p_weeks` sigue
  aceptándose por compatibilidad pero ya no tiene efecto y `created_sessions`
  vuelve siempre en 0.
  La pantalla quedó en tres pasos numerados, con un recuadro «¿Cómo funciona
  esta pantalla?» arriba y textos en palabras del gimnasio (se dejó de decir
  «sesión» en pantalla y se dice «clase»; «anular» pasó a «suspender»;
  «bloqueo» pasó a «cerrar»): **1. Tu semana fija** (lo que se repite),
  **2. Pasar la semana al calendario** (crea las fechas, con previsualización y
  el período avanzado plegado, cuatro semanas por defecto), **3. Días que no
  abrís** (cierres, ahora con «primer día» y «último día» en vez de dos fechas
  con hora). Al guardar un horario, la pantalla avisa que falta pasarlo y
  prepara sola la previsualización, sin escribir nada. El menú pasó de
  «Horarios y grilla» a **«Horarios y clases»**. Pruebas: 82 comprobaciones SQL
  y 17 de pantalla (9 del tablero y 8 de cierres).
  **Corrección del 29 de octubre (migración 00073, aplicada en producción):** al
  abrir la pantalla mostraba «No pudimos confirmar estos datos» con el código
  `SCHEDULE_UNCONFIRMED`. La causa no era la pantalla sino la base: en
  producción `coaches` guarda el nombre en `full_name` y `admin_schedule_board()`
  (00072) leía `co.name`, así que PostgREST devolvía `42703` y el servidor lo
  traducía a un error genérico. `00073` lee el nombre con `to_jsonb(co)`: toma
  `full_name`, luego `name` y por último el identificador, sin depender de cómo
  se llame la columna. La prueba SQL arma el entrenador con `full_name` y `name`
  vacío para que ese fallo no vuelva a pasar desapercibido. El servidor además
  distingue los errores de base desalineada (`PGRST202`, `42883`, `42703`,
  `42P01`) y avisa que la grilla está desactualizada, en vez de un mensaje que
  invitaba a recargar sin salida.
  **Falta para cerrar OP-05** (sin SQL manual ni cambios de código):
  - **Hecho el 29 de octubre (migración `00077`, aplicada en producción como
    `disciplinas_administrables`): disciplinas editables.** Pantalla nueva
    **Administración → Disciplinas** (`/panel/administracion/disciplinas`):
    crear una disciplina desde cero —Zumba, Spinning, lo que sea— y corregir
    nombre en español e inglés, descripciones, intensidad, duración, cupo,
    color y orden de las que ya existen. Al guardarla queda disponible para
    cargarle horarios y venderle un plan, sin cambiar código. Cada fila dice
    qué tiene encima antes de tocarla: horarios fijos activos, clases por
    delante y planes que la cobran. El estado se cambia con el **mismo
    interruptor de OP-03** (`admin_set_class_active`, migración `00064`), que
    ahora deja bitácora de baja y reactivación; no se creó otro interruptor.
    Nada se borra: apagar una disciplina conserva sus clases y sus reservas.
    Toda alta o edición queda en `public.class_audit` con quién, cuándo, qué
    acción y los **nombres** de los campos cambiados (nunca los valores); la
    tabla no es legible desde la API, solo a través del catálogo y con RLS de
    administración. Guardar sin cambios responde «sin cambios» y no ensucia la
    bitácora. El identificador interno (`cls_<slug>`) se arma una vez al crear
    y no cambia al editar: sesiones, reservas y planes apuntan a él. Solo
    administración con MFA. Pruebas: 32 comprobaciones SQL nuevas y 8 de
    pantalla; `typecheck`, `lint`, `build` limpios; suite completa 803 en
    verde. Verificado en producción dentro de una transacción revertida:
    alta, edición con campos cambiados, guardado sin cambios, apagado,
    reactivación y catálogo con 4 entradas de bitácora; después del
    `rollback` quedó todo igual (79 sesiones, 0 entradas de bitácora, 0
    bloqueos). Después del despliegue se comprobó en producción que la API
    nueva responde `AUTH` sin sesión, que un cliente con sesión recibe `AUTH`
    al pedir el catálogo, que la tabla de bitácora no es legible desde la API
    —ni con una fila sembrada a propósito— y que las funciones no tienen
    permiso para el rol anónimo. Dato de hoy: la base productiva tiene **9
    disciplinas**, de las
    cuales en ese momento solo Pesas y máquinas y Boxeo estaban activas; **Zumba
    y bailoterapia existía apagada, sin horarios y sin plan**. **Actualizado el
    30 de octubre:** Zumba ya está prendida, con plan y horarios (ver «Zumba
    publicada» más abajo).
  - **Zumba publicada el 30 de octubre (noche) — hecho, no pendiente.** El
    dueño decidió: plan **C$300 al mes (30 días)** y clases **lunes, miércoles
    y viernes a las 7:00 p. m.**; prender la disciplina ahora. Cargado en
    producción: `cls_zumba` activa; plan `pln_zumba` (atado a `cls_zumba`,
    30 días, NIO 300, `access_kind = class`) —cobrable en Caja sin código
    nuevo—; 3 horarios fijos de 60 minutos, cupo 30, Salón de baile, con
    **María Rodríguez** (`coa_mr`); **9 clases futuras** generadas del 2 al 20
    de noviembre con `admin_apply_schedule` y la entrenadora puesta. La clase
    del sábado 31 de octubre que había salido mal fechada quedó **anulada con
    motivo**, no borrada. Verificado en la API pública (`/api/sessions`) y en
    `/es/horarios`: la clase del lunes 2/11 a las 19:00 sale «con María
    Rodríguez». Antes, la misma carga se había probado entera dentro de una
    transacción revertida: prender, cobrar el plan con
    `finance_record_movement_plan` (crea el segmento «class cls_zumba» con
    vencimiento a 30 días) y reservar como socia (`confirmed`).
  - **Convención de días, para no repetir el error:** en los horarios fijos el
    **0 es lunes** y el **6 es domingo**, igual en el panel (columna «Lunes»
    primero) y en el generador (`(extract(dow) + 6) % 7` en `00074`). Cargar
    «1, 3, 5» creyendo que es lunes/miércoles/viernes produce **martes, jueves
    y sábado**. Boxeo usa 1, 2 y 3 porque son martes, miércoles y jueves:
    coincide con el texto de su disciplina, no es un desfase.
  - **Pendiente de operación (sin código):** las clases concretas se generan
    de 1 a 8 semanas por vez (por defecto 4) y **no hay tarea automática**.
    Hoy están creadas hasta el 20 de noviembre; si nadie aprieta «Generar» otra
    vez, la grilla pública se queda sin fechas aunque los horarios fijos sigan
    existiendo. Conviene regenerar cada 2 o 3 semanas.
  - **Por confirmar con el dueño:** el texto público de Zumba todavía dice
    «Consultá el horario vigente por WhatsApp». Se puede cambiar por «Lunes,
    miércoles y viernes a las 7:00 p. m.», como ya hace Boxeo, pero es texto
    de marketing y no se tocó sin su palabra.
  - **Hecho el 29 de octubre (migración `00074`, aplicada en producción como
    `generar_sesiones_preview`):** generar sesiones para una fecha de inicio y
    1 a 8 semanas, mirando primero qué se crearía. `admin_preview_schedule()`
    no escribe nada y devuelve cada clase candidata con su motivo —se crea, ya
    existe, choca la sala, choca el entrenador, ya pasó o la disciplina está
    desactivada—; `admin_apply_schedule()` inserta exactamente lo que el plan
    marcó como «se crea» y nada más. En la pantalla **Horarios y grilla** hay
    un bloque «Generar sesiones» con fecha y semanas: primero «Ver qué se
    crearía», después «Crear N sesiones». Generar dos veces no duplica y no se
    crean sesiones pasadas. Pruebas: 53 comprobaciones SQL y 6 de pantalla.
    Sigue faltando que el generador omita **bloqueos** (llegan con los
    bloqueos y cierres) y que el botón de Operación muestre esta misma
    previsualización.
  - **Hecho el 30 de octubre (migración `00078`, aplicada en producción como
    `sesiones_sueltas`): sesiones sueltas y días especiales.** El paso **4. Un
    día puntual** de **Horarios y clases** crea una clase con fecha fuera de la
    grilla —un sábado especial, un horario corrido por feriado— y permite
    cambiarla de día, hora, duración, cupo, sala, entrenador o nota sin tocar la
    semana fija. Las clases sueltas quedan marcadas (`sessions.origin =
    'manual'`), así la pantalla las distingue sin adivinar. Mover una clase con
    reservas encima está permitido y las reservas siguen con ella; bajar el cupo
    por debajo de lo reservado o cambiar de disciplina con reservas se rechaza.
    Se rechazan choques de sala y de entrenador, fechas pasadas, días cerrados
    (`BLOCKED`) y clases repetidas. Cancelar una clase pide el motivo y, si hay
    gente anotada, confirmación explícita: la clase y sus reservas quedan
    canceladas con motivo, autor y fecha, y no se borra nada. Cancelar dos veces
    no cambia nada. Para suspender varios días seguidos se sigue usando el paso
    3 (bloqueos y cierres): no se duplicó esa herramienta. Además, la oferta
    pública dejó de mostrar clases canceladas (antes se veían y al reservar
    respondían «cancelada por el gimnasio»); Operación sigue viéndolas para el
    historial. Pruebas: 43 comprobaciones SQL nuevas, 9 de pantalla y 2 de
    lectura de datos; suite completa 814 en verde; `typecheck`, `lint` y `build`
    limpios. Verificado en producción dentro de una transacción revertida:
    crear una clase suelta, listarla con sus reservas, moverla, cancelarla con
    motivo y comprobar que la clase y la reserva siguen existiendo; después del
    `rollback` quedó todo igual (79 sesiones, 0 bloqueos).
  - Rangos elegidos de una serie: se cubren con un **cierre** del paso 3
    (alcance «una disciplina», con fecha desde y hasta), que ya cancela las
    clases del período con su motivo. No hace falta otra pantalla.
  - **Hecho el 29 de octubre (migración `00075`, aplicada en producción como
    `bloqueos_calendario`): bloqueos y cierres.** Tabla `schedule_blocks`:
    todo el gimnasio, una disciplina o un entrenador, entre dos fechas y horas,
    con motivo —feriado, vacaciones, enfermedad, mantenimiento u otro— y una
    nota. En **Horarios y grilla** hay un bloque «Bloqueos y cierres»: primero
    «Ver qué se afecta» (cuántas sesiones y cuántas reservas, con la lista) y
    después «Guardar bloqueo». Con reservas encima la base exige confirmación
    explícita (`CONFIRM_REQUIRED`). Al aplicar, las sesiones quedan
    `cancelled` y cada reserva afectada queda cancelada con el motivo escrito
    y quién la canceló (columnas nuevas `bookings.cancel_reason` y
    `bookings.cancelled_by`); no se borra nada. Si el bloqueo es de un
    entrenador y se elige sustituto, la sesión se reasigna en vez de
    cancelarse. El generador omite lo bloqueado (`_session_blocked()`), y el
    plan de generación lo muestra como «bloqueado». Levantar un bloqueo lo deja
    inactivo y **no** resucita sesiones canceladas. Pruebas: 79 comprobaciones
    SQL y 8 de pantalla. Verificado en producción dentro de una transacción
    revertida: 9 sesiones creadas, 3 afectadas, 3 canceladas, 1 bloqueo activo,
    3 bloqueadas en el plan y 0 al regenerar; los datos quedaron intactos
    (79 sesiones, 0 bloqueos).
  - **Hecho el 30 de octubre (migración `00079`, aplicada en producción como
    `entrenadores_admin`): entrenadores administrables y asignación con
    detección de choques.** Pantalla nueva **Administración → Equipo de
    entrenadores** (`/panel/administracion/equipo`): alta y edición de la
    plantilla con nombre, especialidad visible y **disciplinas que dicta**,
    elegidas de la lista de clases (nunca texto libre: `specialties` guarda los
    slugs de `classes`, que es lo que ya leía el generador). Se reutiliza el
    patrón de interruptor: dar de baja no borra nada y las clases ya programadas
    siguen con su entrenador. Bitácora en `public.coach_audit` con quién, cuándo,
    qué acción y los **nombres** de los campos cambiados; la tabla no es legible
    desde la API. En **Horarios y clases**, cada horario con entrenador tiene el
    botón **«Pasar a las clases ya creadas»**: primero muestra a cuántas clases
    afecta, cuántas ya lo tienen y cuáles se saltean por choque, y solo después
    asigna; guardar un horario sigue sin tocar el calendario. Además se corrigió
    una diferencia real entre la previsualización y la generación: ahora las dos
    resuelven el entrenador igual (el del horario y, si no hay, el primero
    activo que dicte esa disciplina), así el plan muestra a quién se le va a
    asignar y detecta también sus choques. Pruebas: 49 comprobaciones SQL
    nuevas —incluidas dos corridas sobre el **esquema productivo** de `coaches`,
    que no tiene `slug`, `name` ni `sort_order`—, 10 de pantalla y 3 nuevas de
    la grilla; suite completa 827 en verde; `typecheck`, `lint` y `build`
    limpios. Verificado en producción dentro de una transacción revertida: alta,
    edición, guardado sin cambios, baja, reactivación, catálogo con 4 entradas
    de bitácora y asignación del entrenador a las 4 clases de un horario; después
    del `rollback` quedó todo igual (3 entrenadores, 79 sesiones, 0 con
    entrenador, 9 horarios, 0 bloqueos).
    **Corregido el 30 de octubre (misma tanda):** la pantalla de Horarios y
    clases se caía al abrirla en producción desde la etapa 5. Causa exacta, tal
    como la mostró el registro de Vercel (digest `3768277961`): la página
    llamaba en el servidor a `sessionsBoardFrom()`, una función que vivía en un
    archivo marcado `"use client"`, y React prohíbe ejecutar funciones sueltas
    de un archivo de navegador desde el servidor. Ahora ese cálculo y sus tipos
    viven en `src/lib/admin/schedule-range.ts`, que usan la página y el
    componente por igual. Se sumó `tests/schedule-range.test.mjs`, que además
    de probar el cálculo revisa **todo el árbol** y falla si alguna página del
    servidor importa una función suelta desde un archivo `"use client"` (se
    comprobó que la prueba falla con el error puesto a propósito). Verificado
    en local con el servidor de desarrollo: con el defecto la página responde
    500 y con el arreglo 200.
    **Aclarado el 30 de octubre:** dije que la grilla pública no mostraba el
    entrenador y **era falso**. `src/components/schedule/schedule-board.tsx` ya
    pinta «con {nombre}» cuando la clase tiene entrenador; lo que faltaba era el
    **dato**, no la pantalla: las 79 sesiones productivas tenían `coach_id`
    nulo. Lo que había que hacer era del panel, en dos pasos: elegir el
    entrenador en cada horario y apretar «Pasar a las clases ya creadas». Se
    sumó `tests/public-schedule-coach.test.mjs` (2 casos) para que ese renglón
    no se pierda: muestra el nombre cuando existe y no inventa nada cuando no.
    **Cargado el 30 de octubre (noche):** María Rodríguez quedó en los 3
    horarios de Zumba y **José Luis Pérez** en los 9 de Boxeo, con «Pasar a las
    clases ya creadas» aplicado: **36 clases futuras de Boxeo** y **9 de Zumba**
    quedaron con entrenador, **0 sin entrenador**. Las clases ya dictadas se
    dejaron como estaban para no reescribir el historial. Comprobado en
    `/api/sessions`: cada clase futura devuelve su `coach` con nombre y
    especialidad.
    **Cerrado el 31 de octubre (00086):** la gestión de planes ya incluye
    cuánta gente tiene cada plan, quiénes son y qué precios tuvo antes (CLI-07).
  Todo el CRUD debe estar autorizado en pantalla, servidor y RLS/RPC, con
  bitácora, control de concurrencia e idempotencia, fechas en
  `America/Managua`, sin crear sesiones pasadas por error y sin borrar
  sesiones o reservas para corregirlas. Cierre: probar el esquema productivo
  divergente y, desde el celular, crear una disciplina de ejemplo, definir
  su grilla, generar sus sesiones, agregar un día suelto, bloquear un rango
  y comprobar el resultado en Horarios y en las reservas afectadas. Esos casos
  son los de **QA-09**: hasta que se recorran en el celular, OP-05 no se
  considera aceptada (aunque el código ya esté cerrado).
- [ ] **OP-06 · Media · Decisión y código — Cierre de reservas pasadas.**
  Existe `close_past_sessions()`, pero no se ejecuta automáticamente. Primero
  hay que decidir cuándo una reserva confirmada pasa a asistida o ausente; no
  convertir automáticamente en ausente a alguien que sí llegó pero no fue
  marcado. Cierre: regla aprobada, ejecución segura y prueba por rol.
- [ ] **OP-07 · Baja · Código — Cambio de día en páginas abiertas.** Horarios,
  Panel y Mi cuenta calculan «hoy» al montar; no hay un refresco general al
  cruzar medianoche en America/Managua. Cierre: la fecha/semana se actualiza
  sin recargar y sin perder el trabajo en curso.
- [ ] **OP-08 · Media · Código — Vincular después una ficha de recepción con
  una cuenta web.** La ficha sin cuenta ya puede operar, cobrar y tener deuda
  propia. Falta el flujo seguro para vincularla cuando la persona crea su
  cuenta. Cierre: verificación manual/segura, nunca unir solo por nombre o
  correo, y conciliar historial, visitas, progreso y saldos sin mezclarlos.
- [ ] **OP-09 · Baja · Decisión — Cerrar formalmente la navegación.** El panel
  ya está organizado en Inicio, Clientes, Finanzas, Operación, Administración
  y Mis clientes. Falta decidir si eso cierra la antigua Etapa 2 o si se quieren
  los nombres literales Agenda, Personal, Reportes y Configuración como módulos
  principales.

## 2. Clientes, planes, categorías y progreso

- [x] **CLI-01 · Alta · Código — Vigencias de planes.** **Código cerrado,
  aplicado y desplegado**; la aceptación en celular con un usuario de cada rol
  está en **QA-09**. Duraciones aprobadas contando el pago como día
  1: Día 1, Semana 7, Quincena 15, Mes 30 y Boxeo 30. Renovar o cambiar antes de
  vencer encadena desde el día siguiente al vencimiento; después de vencer
  empieza el día del pago. Gimnasio y Boxeo son accesos separados y
  simultáneos; reservar Boxeo exige vigencia en la fecha local de la clase
  (`PLAN_REQUIRED`). Recepción y entrada **solo avisan** por vencimiento o
  deuda: no bloquean. Ningún cobro anterior ni ningún abono crea vigencia.
  Implementación: migración 00067 (`vigencias_planes`, versión remota
  `20261029021510`), que reutiliza y endurece `payment_plans` (sin grants ni
  políticas para `anon`/`authenticated`; acceso solo por RPC), agrega
  `gym_clients.frozen_since`, términos estrictos por plan, registro idempotente
  por referencia y envoltorios `finance_record_movement_plan`,
  `finance_record_checkout_plan` y `crm_record_payment_plan`. La ficha, el
  directorio, las opciones de cobro, el cobro rápido, Mi Cuenta y el recibo
  muestran la vigencia. La ficha tiene un panel **Vigencias** con Gimnasio y
  Boxeo por separado y su propio botón «Cobrar»; Boxeo se cobra en dólares, sin
  productos y sin registrar entrada de gimnasio. El «plan asignado» quedó
  rotulado como etiqueta: no cobra ni activa nada. Evidencia local: 37 comprobaciones SQL por rol y
  encadenamiento, 768 pruebas de reglas/UI, `typecheck`, `lint` y `build` sin
  errores, más 2 pruebas nuevas del cobro de Boxeo y del panel de vigencias. Reversión: dejar de enviar `planId`, luego retirar las RPC `*_plan`;
  no se borran datos.
- [x] **CLI-06 · Alta · Código — Catálogo de planes y modalidades.** **Código
  cerrado, aplicado y desplegado**; la aceptación en celular va con **QA-09**.
  Decisión cerrada por el usuario (modelo C + opción 1): cada plan se ata a **una
  disciplina existente** o a **todo el gimnasio**, y su vigencia sale de los
  datos del plan, no de su slug. Así el dueño crea desde Administración un plan
  nuevo —por ejemplo Zumba mensual— y ese mismo plan aparece para cobrar con
  vigencia real en la ficha del cliente, sin pedir cambios de código.
  Implementación: migración 00068 (`catalogo_planes`) con columnas
  `access_kind`, `class_id`, `duration_days`, `validity_currency`,
  `validity_amount` y `updated_at` en `plans` (con checks), más `class_id` en
  `payment_plans`. `plan_validity_terms` deja de tener slugs escritos a mano.
  Boxeo y las cuatro tarifas NIO quedaron migrados al modelo nuevo; el acceso
  histórico `boxing` de los segmentos se conserva como valor permitido y la
  aplicación usa `class` con `class_id`. Funciones nuevas: `plan_class_state`,
  `plan_access_state` (puente), `plan_validity_summary` con `classes[]`,
  `plan_register_segment` con disciplina, `book_session` genérico (exige
  vigencia solo si hay un plan activo con duración para esa disciplina;
  `PLAN_REQUIRED`), `admin_plans_catalog()` y `admin_save_plan(...)`. Módulo
  **Administración → Planes y modalidades** con API propia (administrador con
  MFA, zod estricto, desactivar en vez de borrar). La ficha y Mi Cuenta
  recorren los planes activos: el panel **Vigencias** muestra una fila por
  acceso (gimnasio y cada disciplina con plan) con su botón de cobro, y el
  cobro de una disciplina no registra entrada de gimnasio. Evidencia local:
  cadenas `00001…00068` aplicadas en PGlite, 24 comprobaciones PASS de CLI-06
  más 37 de CLI-01, 769 pruebas de reglas/UI, `typecheck`, `lint` y `build` sin
  errores. La migración quedó aplicada en producción como
  `catalogo_planes@20261029042701`; una corrección posterior
  (`catalogo_planes_plan_class_state`) reparó la lectura de vigencias
  «por comenzar» y «vencidas», que se había transcrito con un nombre de columna
  equivocado al aplicarla. La aceptación en celular va con **QA-09**.
  Reversión: dejar de enviar `planId`; las
  columnas pueden quedar vacías sin afectar cobros ni vigencias ya creadas.
- [x] **CLI-07 · Alta · Código — Uso de cada plan y su historial de precios.**
  Cerrada el 31 de octubre (migración `00086_planes_uso_y_precio`, aplicada en
  producción). En Administración → Planes cada plan decía «Mes · 30 días ·
  C$560» y nada más: para contestar «¿cuánta gente tiene el Mes?» había que ir
  ficha por ficha, y al cambiar un precio el anterior se perdía sin rastro, así
  que un cobro de ayer a C$560 no se podía explicar. Ahora cada plan muestra
  **cuántas personas lo tienen vigente, cuántas lo tienen por empezar y cuántos
  cobros hubo este mes**, y el botón «Ver quiénes» abre la lista de esas
  personas con su vencimiento, los días que les quedan y lo que pagaron, sin
  salir de la pantalla. Debajo se lee el precio con su fecha: «C$600 desde el 2
  de noviembre (antes C$560)», con el historial de cambios en el mismo panel.
  El historial lo llena un **disparador en `plans`**, así cubre las dos puertas
  que tocan precios (el editor de tarifas rápidas y el catálogo) sin repetir la
  regla; solo escribe cuando el precio cambió de verdad, y los planes que ya
  existían **no** reciben una fecha inventada. Los conteos y la lista ignoran
  las vigencias anuladas (00085). Reglas por rol: `is_admin()` en las tres
  piezas, la tabla de precios no se entrega a `anon` ni a `authenticated`, y un
  fallo de lectura **no** se muestra como «nadie tiene el plan» sino con su
  aviso. Probado con `scripts/test-plan-usage-sql.mjs` (**23 casos** por rol en
  PGlite), `tests/plan-usage.test.mjs` (18 del texto y la validación),
  `tests/plans-catalog.test.mjs` (8 de la pantalla, incluidos error y respuesta
  rara) y `tests/plans-api.test.mjs` (6 de la ruta). Suite completa **943/943**.
  Comprobado en producción con `rollback`: el catálogo devuelve los 6 planes con
  sus conteos, `admin_plan_usage` responde y cambiar el precio de 560 a 570
  dejó su renglón con «antes 560 / después 570», sin escribir nada.
- [x] **CLI-02 · Media · Código — Categoría automática por vigencia real.**
  Hecho y aplicado en producción (migración `00070`, versión
  `20261029051354 categorias_automaticas`). La categoría deja de mirar el «plan
  asignado» y usa las fechas reales de `payment_plans`: un cliente con el mes
  vigente y otro vencido hace tres semanas ya no comparten categoría. Incluye
  `category_rules` (las cuatro categorías como datos editables con orden de
  prioridad, umbrales y categoría de reserva), `category_rules_history`,
  columnas `category_auto`/`category_override` en `gym_clients` y las funciones
  `client_category_eval`, `client_category`, `client_category_apply`,
  `crm_set_client_category`, `crm_clear_client_category`, `admin_category_rules`
  y `admin_save_category_rules`. Reglas por defecto: mes vigente + compra en 90
  días = Strong Gym; cualquier vigencia activa = Familia; sin vigencia y 3
  visitas en 30 días = Amigo; el resto Común. Módulo **Administración →
  Categorías** para cambiar números y orden sin código, con conteos, historial
  y «Recalcular todos». La ficha muestra la categoría con su motivo y permite
  fijarla o liberarla a mano; el listado de clientes muestra la categoría real
  (o la etiqueta histórica cuando todavía no se calculó) y filtra por las
  cuatro categorías o por la etiqueta. Evidencia: 40 comprobaciones SQL nuevas
  por rol, 38 pruebas de la ficha de clientes, 4 del editor de reglas, 777 de
  reglas/UI, `typecheck`, `lint` y `build` limpios, y los siete hashes
  `md5(pg_get_functiondef)` de producción coinciden con los locales. Los cuatro
  clientes del directorio quedaron con categoría asignada (3 Común, 1 Strong
  Gym) al ejecutar el recálculo. La migración `00071`
  (`20261029053617 directorio_categoria_en_vivo`) hace que el listado calcule
  en el momento la categoría de un cliente creado después del último
  recálculo, así no aparece con la etiqueta vieja ni se queda fuera del filtro;
  su hash de producción también coincide con el local. Desplegado en producción con
  `dpl_F3oHWLBBhNdEQeHN2PXMWkjsmVSx` (commit `86952ca`); `/api/admin/categories`
  responde 403 AUTH sin sesión (ya no PGRST202) y la página de Categorías
  redirige a Ingresar. La **aceptación en celular** va con **QA-09**.
  Reversión: dejar de llamar `client_category_apply`; las columnas nuevas
  pueden quedar vacías sin afectar cobros ni vigencias y no se borra nada.
- [x] **EX-01 · Alta · Código — Biblioteca de ejercicios y «Mi rutina».**
  Cerrada el 31 de octubre. El cliente ya puede buscar cómo se hace un ejercicio,
  ver qué músculos trabaja, con qué máquina, cuántas series y repeticiones y
  cuánto descansar, y guardar su propia lista de la sesión. Migraciones `00089`
  (`20261031225118 biblioteca_de_ejercicios`) y `00090`
  (`20261031225315 catalogo_peso_corporal`), aplicadas en producción.
  Catálogo real de **701 ejercicios** cargado desde el dataset público RepDB
  (repdb.co), con nombres, descripción, pasos y consejos **en español**; el
  archivo y las imágenes **no** se copian al repositorio, se importan a la base
  y las imágenes se sirven por `/api/exercises/image` (proxy con sesión y ruta
  validada). Licencia: uso comercial dentro de la app con **atribución visible**
  («Exercise data by RepDB (repdb.co)»), que las tres pantallas muestran y una
  prueba impide quitar.
  Pantallas en Mi cuenta: catálogo con búsqueda sin acentos y chips por zona del
  cuerpo (9), con qué se hace (máquinas, poleas, peso libre, accesorios, cardio,
  peso corporal) **con su conteo**, tipo de trabajo (fuerza, estiramiento,
  cardio, halterofilia, pliometría) y nivel, 24 por página; ficha con el
  movimiento animado, paso a paso, músculos, dosis sugerida y **cronómetro** de
  descanso (45/60/90/120 s, con vibración); y «Mi rutina», separada de la rutina
  que asigna el entrenador, con series, repeticiones, descanso, duración
  estimada y quitar.
  **El dibujo se mueve**: el origen publica dos fotos de cada movimiento
  (posición inicial y final) y la pantalla las alterna. Son 516 ejercicios
  animados y 185 con una sola foto. (Cómo se alternan cambió el 1 de noviembre,
  ver EX-03.)
  **Orden de gimnasio** (migración `00091`, `20261031234712`): la lista abre
  con los ejercicios de equipo y deja al final el trabajo sin equipo y los
  estiramientos, porque el dueño vio la primera pantalla y le pareció «casi
  todo de casa». Composición real del catálogo, contada por la base: 276 de peso
  libre, 216 de peso corporal, 108 de accesorios, 61 de máquina, 31 de polea y
  9 de cardio; 485 de 701 usan equipo.
  Búsqueda arreglada en serio: «glúteo» encuentra los 276 ejercicios que lo
  trabajan aunque la base diga `gluteus_maximus` — la web manda las etiquetas en
  español (`search_extra`) al importar, con **un solo** mapa de etiquetas que
  una prueba cuida contra slugs crudos. La 00090 corrigió el chip «Peso
  corporal» (216 ejercicios), que antes mostraba todo el catálogo.
  Seguridad: lectura sólo con sesión, escritura sólo por funciones que sacan el
  cliente de la sesión (el navegador nunca manda un `client_id`), importación
  sólo administración con segundo factor. Carga idempotente: dos corridas
  seguidas dejan 701 filas, no 1402. Evidencia: 37 comprobaciones SQL por rol en
  PGlite, 38 pruebas nuevas de etiquetas, importación, atribución, imagen
  animada y las dos rutas de la API, `typecheck`, `lint` y `test:auth` (999)
  limpios. Reversión: `drop table
  public.client_exercise_routine, public.exercises cascade;` y las funciones; no
  toca ninguna tabla existente. Queda como decisión del dueño, sin bloquear:
  favoritos, si la biblioteca se abre sin sesión y quién más puede importar.
- [x] **EX-02 · Alta · Código — Segunda ola del catálogo y biblioteca sólo de sala.**
  Cerrada el 1 de noviembre. El dueño miró la biblioteca y dijo que «casi todo
  se pudiera realizar en casa, eso es lo contrario de un gym»: se sumó un
  segundo origen y se dejó a la vista únicamente lo que usa equipo de gimnasio.
  **Migración `00092`** (`20261101010752 biblioteca_solo_de_gimnasio`): agrega
  `exercises.visible`, la regla `exercise_is_gym(equipment, category)` y dos
  funciones de administración (`admin_reset_library_visibility`,
  `admin_set_exercise_visible`); el catálogo y las facetas cuentan **sólo lo
  visible**, así los chips dicen la verdad. **No borra nada**: los 307
  ejercicios de casa siguen en la tabla y se pueden volver a mostrar uno por uno.
  Quedan **467 visibles** (301 de peso libre —barra, mancuerna, barra Z, pesa
  rusa, banco y discos—, 77 de máquina, 52 de polea, 29 de apoyo y 8 de cardio)
  y **307 ocultos** (peso corporal, bandas, balones,
  estiramientos y «otros»). Entran barra, banco plano, Smith, discos y pesas
  rusas, como pidió el dueño.
  **Segundo catálogo**: `yuhonas/free-exercise-db` (**dominio público,
  Unlicense**), del que se cargaron **73 ejercicios** nuevos con traducción
  escrita a mano (`src/lib/exercises/catalog-barbell.ts`,
  `catalog-equipment.ts`, `second-catalog-data.ts`), cada uno con nombre, tres
  pasos y un consejo en español. Filtro de duplicados en tres pasos: nombre en
  inglés normalizado, después mismo movimiento con el mismo implemento, y
  finalmente revisión a ojo de los 59 pares que quedaban; se descartaron 18
  repetidos exactos (por ejemplo el «cable crunch», el «Pallof press» y el
  «front squat», que ya estaban). Dos corridas de la importación dejan 827
  filas, no más.
  **Movimiento**: el segundo origen también publica dos fotos por ejercicio
  (posición inicial y final) y el proxy `/api/exercises/image` ahora sirve esos
  JPG además de los dibujos WebP, con la misma ruta validada y la misma caché de
  30 días.
  **Tema**: la grilla y la ficha llevan un hilo de 3 px con el color de la
  familia de equipo (rojo de la marca para el peso libre, azul acero para las
  máquinas, ámbar para las poleas, verde para los aparatos de peso corporal) y
  los chips sin ejercicios ya no se muestran. La atribución suma la línea del
  segundo origen.
  Evidencia: 49 pruebas de la biblioteca (9 nuevas del segundo catálogo y 2 del
  proxy de fotos) y **53 comprobaciones SQL** por rol en PGlite (15 nuevas de
  visibilidad, incluidas «lo oculto no se lista», «la faceta no cuenta lo
  oculto» y «administración puede volver a mostrarlo»), `typecheck` y `lint`
  limpios. Reversión: `alter table public.exercises drop column visible;` y las
  funciones de la `00092`; los 126 nuevos se reconocen por
  `source = 'free-exercise-db'`. Queda como decisión del dueño, sin bloquear:
  qué más quiere ver de su sala y si algún ejercicio oculto debe volver.
- [x] **EX-03 · Alta · Código — El movimiento tiene que verse en todos los teléfonos.**
  Cerrada el 1 de noviembre. El dueño probó la ficha en su celular, tocó el
  botón y la imagen no se movió. La causa: la alternancia de las dos fotos era
  una animación de CSS metida dentro de `@media (prefers-reduced-motion:
  no-preference)`, y el teléfono tenía activada la opción de reducir movimiento
  (Android la trae en Accesibilidad), así que la imagen quedaba quieta. El botón
  «Ver movimiento» existía, pero dependía de la misma animación y no arreglaba
  nada en esos aparatos.
  **Arreglo**: el cambio de foto ya no es una animación de CSS. Ahora lo hace
  el componente (`src/components/exercises/exercise-figure.tsx`) con un
  temporizador de 900 ms que alterna la opacidad de las dos fotos. No depende de
  ninguna preferencia del sistema, así que **se mueve en todos los dispositivos**
  y desde la grilla, no sólo en la ficha. Para no gastar batería: se detiene
  cuando la tarjeta sale de pantalla (IntersectionObserver) y cuando la pestaña
  queda en segundo plano. El botón de la ficha pasó a ser **«Pausar
  movimiento»**: antes servía para encender lo que el sistema apagaba; ahora
  sirve para lo contrario, apagarlo si a alguien le molesta.
  Los ayudantes sin estado (`exerciseFrames`, `exerciseImage`, `figureUrl`)
  pasaron a `src/lib/exercises/figure.ts` para que las pantallas del servidor
  los usen sin arrastrar código de cliente.
  Evidencia: 9 pruebas de la imagen (una comprueba que no vuelva la animación de
  CSS ni `prefers-reduced-motion`), 53 de la biblioteca y 53 comprobaciones SQL,
  `typecheck` y `lint` limpios.
- [ ] **EX-04 · Media · Decisión del dueño — Fotos del segundo catálogo en todo el catálogo.**
  El dueño preguntó si la biblioteca nueva tiene todos los ejercicios de la
  anterior para quedarse sólo con esas fotos. **No los tiene**: el segundo
  origen (876 ejercicios) coincide **por nombre** con unos 76 de los 701 del
  catálogo anterior, y de los 394 ejercicios visibles anteriores muchos menos
  tienen foto allí; el resto son máquinas y variantes que ese origen no publica. Hoy la biblioteca
  mezcla dibujos (RepDB) y fotos (segundo origen), y así queda hasta que el
  dueño decida. Las dos salidas posibles: (a) dejar la mezcla, o (b) cambiar la
  imagen de los ejercicios que sí tienen foto en el segundo origen, uno por uno
  y sin duplicar fichas. Requiere su palabra; ninguna de las dos rompe la
  biblioteca.
- [ ] **CLI-03 · Media · Revisión profesional — Calculadora, dieta y rutinas.**
  La herramienta, el consentimiento, la aprobación del personal y el bloqueo de
  menores ya existen. Falta que un profesional revise fórmulas, mínimos de
  calorías, guía de comidas, rutinas y avisos. Si se quieren alimentos con
  porciones, deben salir de una fuente verificable y contemplar alergias,
  condiciones médicas, medicamentos y embarazo; hoy son textos genéricos y
  macros, no una tabla USDA validada.
- [ ] **CLI-04 · Baja · Decisión — Rangos de medidas y tolerancia de meta.**
  Confirmar con el dueño/entrenador los rangos que disparan aviso y si la
  tolerancia de mantenimiento de 2 kg es la regla definitiva.
- [ ] **CLI-05 · Baja · Decisión — Permisos finos por entrenador.** El modelo
  actual usa rol, asignación aprobada e interruptor de herramientas por cliente.
  Solo si el dueño lo pide, separar permisos de medir, meta, rutina y nutrición.

## 3. Finanzas, productos e inventario

- [x] **FIN-01 · Alta · Código — Fase C: anulación controlada.** Cerrada el
  30 de octubre con la migración `00080_anulacion_controlada.sql` aplicada a
  producción. Anular **no borra ni modifica** el movimiento original: inserta
  una reversa con el signo contrario en la misma cuenta, moneda, método y
  cliente, devuelve el saldo y guarda motivo (5 a 300 caracteres), actor, rol,
  fecha y comprobante en `finance_voids`; el pedido es idempotente por
  `request_id`. Reglas probadas por rol en una transacción revertida:
  administración siempre; caja solo con `cashier_can_void` encendido, con sus
  propios movimientos y del día en curso (`ALREADY_VOIDED`, `IS_REVERSAL`,
  `PERMISSION_OFF`, `NOT_YOURS`, `NOT_TODAY`, `REQUEST_CONFLICT`,
  `NOT_VOIDABLE`). Pantalla: botón «Anular» en cada movimiento de Caja, con
  motivo obligatorio y comprobante de la reversa. **Fuera de esta tarea, a
  propósito:** una transferencia no se anula con una sola reversa (se rechaza
  y se corrige con otra transferencia). El día cerrado llegó con FIN-04: desde
  la 00088, un cobro en efectivo de una caja ya cerrada no se anula.
  **Corrección del 31 de octubre (migración `00083`, aplicada y
  registrada como `20261031093000`):** la 00080 volvió a crear
  `finance_permission_enabled` copiando el `revoke all` de la 00056 **sin** el
  `grant execute ... to authenticated`. Como cuatro políticas RLS la llaman
  dentro de su condición, cualquier lectura de `client_debt_entries`,
  `client_debt_balances`, `member_balances` y `bank_accounts` fallaba con
  `42501` para todo el personal, administración incluida; se veía como
  «Información financiera no disponible · FIN_REPORT_DEBT_42501» en
  Reportes. La 00083 devuelve el permiso, deja una auditoría que corta la
  migración si vuelve a pasar y queda cubierta por
  `tests/sql-policy-grants.test.mjs`, que lee las migraciones en orden y
  detecta el mismo error.
- [x] **FIN-02 · Alta · Código — Efectivo recibido y vuelto en cobros por
  servicio y productos.** Cerrada el 30 de octubre con la migración
  `00081_efectivo_y_vuelto.sql` aplicada a producción. Los cuatro escritores de
  cobro (`finance_record_movement`, `finance_record_movement_plan`,
  `finance_record_checkout` y `finance_record_checkout_plan`) aceptan
  `p_cash_received`: el vuelto se calcula sobre el total (servicio + productos),
  exige una caja activa en la misma moneda (`CASH_ACCOUNT_REQUIRED`), dos
  decimales y que alcance (`INVALID_CASH_RECEIVED`), y queda guardado en el
  comprobante, en el evento del cliente y en el grupo del checkout. Un gasto no
  admite efectivo. Reintentar con el mismo pedido devuelve el mismo comprobante;
  con otro efectivo da `REQUEST_CONFLICT`. La pantalla de cobro muestra el campo
  opcional, el vuelto a entregar y lo avisa en la confirmación; el comprobante
  interno lo imprime.
- [ ] **FIN-03 · Media · Código — Cuentas, catálogos y transferencias.** Falta
  administrar cuentas de caja/banco, métodos y categorías desde la app, y
  registrar transferencias entre cuentas sin contarlas como ingreso o gasto.
  Cierre: reglas por moneda/FX, permisos, saldos antes/después y auditoría.
- [x] **FIN-04 · Media · Código — Apertura, cierre y arqueo de caja.**
  Cerrada el 31 de octubre en dos PR (#110 y #111) y dos migraciones.
  **Antes:** `cash_sessions` existía y Caja mostraba «0 sesiones abiertas
  informadas», pero nadie podía abrir ni cerrar una caja; la única política era
  `ALL` para cualquier personal, así que un cajero podía insertar o borrar
  sesiones sueltas sin arqueo, y el efectivo nunca se comprobaba. **Ahora:**
  · `finance_cash_open` abre **una** caja (índice único: no puede haber dos),
    con el efectivo inicial en córdobas y dólares y el nombre de quien abre.
  · Lo esperado es **apertura + ingresos − egresos de efectivo desde la
    apertura**. «Efectivo» es la cuenta de caja (`account_type =
    'caja_fuerte'`), no el nombre del método: la misma regla de la 00081.
  · `finance_cash_close` guarda lo contado, lo esperado y la diferencia; si no
    cuadra, **exige el motivo por escrito** (`CASH_DIFFERENCE_REASON_REQUIRED`).
    El arqueo cerrado no se edita y se lee con lo guardado, no con el historial
    que cambie después.
  · Sólo quien abrió —o un administrador— cierra (`CASH_NOT_YOURS`).
    Reintentar el mismo pedido devuelve la misma caja, no abre otra.
  · `cash_sessions` dejó de aceptar escrituras sueltas: sin política `ALL` y sin
    permisos de tabla para `anon` ni `authenticated`; se escribe sólo por las
    funciones, que dejan arqueo.
  · **Día cerrado:** desde la 00088, un cobro en efectivo que cayó dentro de una
    caja ya cerrada no se anula (`CASH_SESSION_CLOSED`), para ningún rol,
    porque el arqueo es un hecho guardado. Un movimiento de banco o uno
    posterior al cierre se sigue anulando igual.
  · Pantalla: módulo **«Cierre y arqueo»** en Caja (tarjeta propia), con
    apertura, conteo por moneda, diferencia en vivo («Cuadra exacto», «Falta
    C$40»), motivo obligatorio y los últimos 20 cierres. El encabezado de Caja
    dice «Caja cerrada · abrir» o «Caja abierta · ir al arqueo».
  · Pruebas: `npm run test:caja:arqueo` (39 comprobaciones en PGlite, en CI),
    `tests/cash-session.test.mjs` y `tests/cash-session-api.test.mjs`.
  · **Queda para la aceptación (QA-09):** abrir con el usuario de caja, cobrar
    en efectivo, ver subir lo esperado y cerrar con una diferencia real.
- [x] **FIN-05 · Media · Código — Historial completo de Movimientos en Caja.**
  Cerrada el 31 de octubre. La pantalla usaba los últimos 30 movimientos y
  filtraba en el navegador: un cobro viejo existía y no había forma de
  encontrarlo. Ahora el servidor resuelve la consulta: `finance_movements_page`
  (migración `00084_movimientos_paginados`, aplicada en producción) devuelve en
  una sola pasada **el total que cumple los filtros y solo la página pedida**
  (25 filas), ordenada siempre por `occurred_at desc, id desc` para que la
  paginación no repita ni saltee filas. Filtra por texto (concepto, notas,
  nombre del cliente y del socio), tipo, estado, moneda y método —incluido «sin
  método informado»—, y **escapa `%`, `_` y `\`**, así que escribir un comodín
  no trae todo el historial. La pantalla pide la página a
  `/api/admin/finance/movements`; ya no filtra ni pagina nada por su cuenta, y
  la búsqueda espera 400 ms antes de consultar para no mandar una petición por
  tecla. Reglas por rol: la ruta exige administración o caja con segundo
  factor y la función vuelve a exigir `crm_is_staff()`; sin sesión no hay
  `execute`. El interruptor de gastos lo aplica el **servidor**
  (`p_hide_expenses`): con egresos apagados no se devuelven ni se cuentan. Un
  fallo de lectura responde 503 y la pantalla dice «no pudimos leer», nunca una
  lista vacía. Los movimientos anulados siguen marcándose con su motivo dentro
  de cualquier página. Reportes y exportaciones no se tocaron: ya leían por
  páginas. Probado con `scripts/test-finance-movements-sql.mjs` (28 casos por
  rol con PGlite, incluidos el comodín, el total, la segunda página, el
  interruptor y la idempotencia de la migración),
  `tests/finance-movements-page.test.mjs` (8),
  `tests/finance-movements-api.test.mjs` (5) y la prueba de la pantalla en
  `tests/finance-charts.test.mjs`. Suite completa **898/898**.
- [x] **FIN-09 · Alta · Código — Anular un cobro da de baja la vigencia que
  activó.** Cerrada el 31 de octubre (migración
  `00085_anular_da_de_baja_la_vigencia`, aplicada y registrada en producción).
  Antes, anular un cobro devolvía el dinero y **la membresía seguía corriendo**:
  la persona que pidió la devolución conservaba los días pagados y nadie lo
  veía en pantalla. Ahora el segmento de vigencia que nació de ese cobro queda
  **anulado** —no se borra: `voided_at`, `voided_reason`, `voided_by`,
  `void_id`— y los meses que venían encadenados detrás **se adelantan** los días
  quitados, así nadie pierde ni gana días. Un hueco real (dejó vencer y volvió
  después) se respeta: solo se encoge una cadena contigua. Todo movimiento de
  fechas queda en la nueva tabla `plan_validity_log` con las fechas de antes y
  de después, quién lo hizo, el motivo y la anulación que lo provocó, de modo
  que se puede reponer. Se engancha por disparador en `finance_voids`, no por
  cada pantalla: cualquier anulación —Caja o ruta interna— aplica la misma
  regla, y anular una venta de producto o un gasto no cambia nada porque no
  tiene segmentos. Las lecturas de vigencia (`plan_class_state`,
  `plan_validity_summary`, `plan_register_segment` y la categoría automática)
  ignoran los segmentos anulados, así que tampoco se encadenan renovaciones
  sobre un mes devuelto. La pantalla de Caja avisa **antes** de confirmar qué
  vigencia se da de baja y con qué fechas
  (`finance_void_plan_impact`, misma puerta de personal con segundo factor), y
  la página de resultado lo cuenta después con la frase ya consumada. Datos
  productivos alineados en la misma migración: de los tres meses de C$560 de la
  socia de prueba, dos tenían la anulación guardada y siguen mostrándose como
  anulados; el mes que sí pagó quedó del 28 oct al 26 nov. Probado con
  `scripts/test-plan-void-sql.mjs` (**24 casos** por rol en PGlite: rechazo sin
  sesión de personal, marca sin borrado, adelanto encadenado, hueco respetado,
  segunda pasada sin mover nada, ficha con un solo segmento vivo, renovación
  encadenada a lo vivo y baja de un producto sin efecto),
  `tests/void-plan-impact.test.mjs` (9 casos del aviso y del resultado),
  `tests/void-result-page.test.mjs` (8) y `tests/void-button.test.mjs`
  (2 nuevos: el aviso aparece antes de confirmar y no aparece cuando el cobro
  no activó ninguna vigencia). Suite completa **911/911**.
  Prueba en producción, con `rollback`: llamar a la anulación real como
  administración dejó el segmento marcado como anulado, sin tocar los datos
  guardados. **Las reservas ya hechas no se tocan**: si hay que liberar un
  lugar, se cancela desde Operación como cualquier reserva (OP-01). Se decidió
  así porque una devolución no siempre significa que la persona deje de venir.
- [ ] **FIN-06 · Media · Decisión y código — Importación de saldos e
  históricos.** El importador actual crea fichas de clientes desde CSV con
  mapeo, vista previa y avisos. No importa saldos, deudas, personal ni reservas,
  y un Excel debe guardarse antes como CSV. Cierre si el dueño lo necesita:
  procedencia, fecha y moneda por fila, validación, duplicados, informe de
  resultados y reintento seguro. Los cuatro saldos iniciales también pueden
  cargarse manualmente por ficha con el flujo ya existente.
- [ ] **FIN-07 · Baja · Código — Auditoría integral.** Ya hay eventos de
  clientes, cambios de rol, personal y comprobantes financieros. Falta decidir
  y completar una cobertura uniforme para dinero, reservas, configuración y
  anulaciones, con lectura solo autorizada y sin guardar valores sensibles
  innecesarios.
- [x] **FIN-08 · Media · Código — Devolver stock al anular una venta con
  productos.** Cerrada el 31 de octubre con la migración
  `00082_anulacion_devuelve_stock.sql` aplicada a producción. La anulación ya
  no deja la venta descontada: `finance_void_stock_restore` repone, dentro de la
  misma transacción, una entrada por cada movimiento `venta` de la transacción
  original, con `note = 'Anulación de venta'`, el precio unitario de la venta y
  el vínculo a la reversa. No se borra ni se edita ningún movimiento de stock
  anterior: se agrega el nuevo. Un solo tope: si la reversa ya tiene su entrada,
  la función devuelve lo registrado y no repone dos veces. Si el cobro no tenía
  productos, no toca nada y el comprobante no cambia. El comprobante de la
  anulación suma `stockRestored` (`{productId, name, qty}`) y el diálogo de Caja
  muestra «Stock devuelto» con los productos y cantidades; un comprobante con
  cantidades rotas se rechaza entero. Probado por rol con `rollback`: venta de 3
  unidades (stock 11 → 8) → anulación → 11 y una sola entrada; doble anulación
  rechazada sin reponer dos veces; cobro de plan con productos (el `+` del
  servicio no devuelve stock y la línea del producto sí); cobro sin productos
  devuelve `[]`. Cubierto por `tests/finance-void.test.mjs`.
  **Ampliado el 31 de octubre:** si la respuesta se pierde después de anular,
  el resultado no se muestra como fallo. La ruta consulta la bitácora
  (`findStoredVoidReceipt`) y devuelve el comprobante guardado; si igual no se
  puede confirmar, el aviso dice que no se sabe, invita a mirar Caja y a
  reintentar con el mismo `requestId` —que no anula dos veces— en vez de
  afirmar que no se modificó nada. Una anulación real hecha así en
  producción (venta de 2 aguas, 31 de octubre 09:21) sí quedó guardada:
  dinero, stock y bitácora correctos; lo que falló fue el aviso.
  **Segunda tanda del 31 de octubre (mismo día, 09:56):** volvió a pasar con
  «Gimnasio mensual» de C$560, y otra vez la base sí lo anuló (reversa,
  saldo, bitácora y comprobante correctos, sin stock porque el plan no lleva
  productos). El detalle medido: la función tarda 33 ms y responde bien a una
  sesión de administración, así que el problema está en llevar la respuesta
  hasta el celular, no en la anulación. Ahora la ruta **vuelve a preguntar
  antes de avisar nada**: si el movimiento ya está anulado devuelve ese
  comprobante (sin llamar dos veces a la base), reintenta la lectura tres
  veces y, si aún así no confirma, muestra un código corto
  (`ANULACION_<etapa>_<código>`) para ubicar dónde se cortó. La pantalla
  hace lo mismo: ante una respuesta perdida consulta la base hasta tres veces
  y, si la anulación existe, muestra el comprobante real en vez del error.
  Probado con `tests/void-button.test.mjs` (respuesta perdida → aparece
  «Anulación registrada» con el stock devuelto).
  **Cierre de raíz del 31 de octubre (tercera tanda):** los registros del
  despliegue mostraron `POST 200` seguido de tres `GET 200` del mismo endpoint
  y, aun así, la pantalla decía «no pudimos confirmar»: el resultado escrito
  era correcto y lo que se perdía era **leer la respuesta** en el celular. Se
  dejó de depender de ella. Ahora la anulación de Caja es un **formulario del
  navegador** que termina en una **página armada en el servidor**
  (`/[locale]/panel/caja/anulacion/[id]`): esa página lee `finance_void_plan`
  y el comprobante guardado y muestra la verdad —«la anulación quedó
  guardada» con cuenta, saldo, motivo, quién, cuándo y stock devuelto, o «no
  quedó guardada» con el motivo de la base y un formulario para reintentar—.
  Si el enlace de la consulta previa falla, la pantalla ya no bloquea el
  botón: la regla vive en la base y la página explica el resultado. Además la
  lista de Caja **marca los movimientos anulados** («Anulada · motivo») leyendo
  `finance_voids_recent` y deja de ofrecer «Anular» en ellos; antes se veían
  igual que antes de anular, y eso empujaba a reintentar. También se corrigió
  un defecto real de validación: un comprobante ya guardado se rechazaba al
  volver a validarlo porque el esquema exigía `id`. Cubierto por
  `tests/void-result-page.test.mjs` (6 casos, incluidos el error de lectura, el
  «no se sabe» sin afirmar nada y el id inválido), `tests/void-button.test.mjs` (formulario, marca de anulada
  y consulta previa caída) y `tests/finance-read.test.mjs` (`getRecentVoids`).
  **Cerrado el 31 de octubre (migración 00085):** anular un cobro ahora **da
  de baja la vigencia que ese cobro activó**. La fila no se borra: queda
  marcada (`voided_at`, `voided_reason`, `voided_by`, `void_id`) y los meses
  encadenados detrás se adelantan los días quitados, sin perder ni ganar días;
  un hueco real (dejó vencer y volvió) no se toca. Todo movimiento de fechas
  queda en `plan_validity_log` con antes/después, quién y por qué. Se engancha
  por disparador en `finance_voids`, así vale para toda anulación. La pantalla
  de Caja avisa **antes** de confirmar («al anular, esa vigencia se da de baja
  y los días se adelantan») y la página de resultado cuenta qué quedó anulado.
  Ver FIN-09 más abajo.

## 4. Personal, roles y sesiones

- [x] **PER-01 · Alta · Decisión y código — Cierre automático a los 15
  minutos.** Cerrado y aceptado el 28 de octubre de 2026 tras aplicar la regla
  solo a **administración y caja**. `session-policy.ts` ahora usa
  `ADMIN_CASHIER_INACTIVITY_MS` —15 minutos— para `admin` y `cashier`, y
  `AppProvider` reutiliza el guardia existente de actividad y `signOut`, sin
  un segundo temporizador. Para administración, los 15 minutos reemplazan el
  límite anterior de 2 horas; entrenador, clientes, visitantes y demo siguen
  sin cierre automático. Es una regla del navegador y se revisa cada 30
  segundos. Evidencia: 3 pruebas por rol y de borde exacto en
  `tests/session-policy.test.mjs`, más la confirmación en celular del usuario:
  administración y caja cerraron tras la inactividad, mientras entrenador y
  cliente permanecieron con la sesión abierta. La aceptación integral del
  conjunto sigue en CAL-03.

## 5. Seguridad, Auth y correo

- [x] **SEG-01 · Alta · Configuración manual — Mínimo de contraseña remoto en
  12.** Cerrado el 27 de octubre de 2026. El usuario subió
  `password_min_length` de 6 a **12** en Supabase Dashboard (Authentication
  → Sign In / Providers → Email) y la lectura posterior con el conector lo
  confirmó en 12, alineado con la regla única de la app (12–128 en registro
  y recuperación). No se tocaron requisitos de caracteres. El cambio no
  invalida contraseñas actuales ni cierra sesiones; solo aplica a registros
  y cambios de contraseña nuevos.
- [ ] **SEG-02 · Alta · Dato del dueño y configuración — Correo propio y
  recuperación real.** Faltan remitente, dominio y proveedor SMTP autorizados.
  Después hay que revisar plantillas, límites y entregabilidad, y aceptar el
  recorrido completo con un correo controlado, incluida la app instalada.
  Mientras tanto no se promete recuperación general por correo.
- [ ] **SEG-03 · Alta · Dato del dueño — Segundo administrador y recuperación
  MFA.** La app no tiene códigos de respaldo MFA. Antes de retirar el acceso
  temporal, el dueño debe quedar como administrador con su propio MFA y acceso
  comprobado, usando su correo y autorización. Nunca se piden contraseñas,
  semillas ni códigos por chat.
- [x] **SEG-04 · Media · Revisión de código — CSRF uniforme.** **Cerrado el 30
  de octubre de 2026 (PR #96).** Había **cuatro copias** de la misma
  comprobación de origen —once rutas con una función `sameOrigin` repetida y
  cuatro con la lógica escrita a mano dentro del `POST`— y **nueve rutas que
  escriben no la tenían**. Ahora hay **un solo guardia** en
  `src/lib/security/same-origin.ts` que usan **las 26 rutas con métodos que
  escriben**; la única excepción es el endpoint retirado que solo responde 410.
  El guardia rechaza `sec-fetch-site: cross-site`, exige que `origin` coincida
  con la URL o con el encabezado `host` (por el proxy del despliegue) y deja
  pasar los pedidos sin `origin`, que son los que no vienen de un navegador.
  Al reemplazar el chequeo de socios se corrigió además un defecto real: un
  `origin` inválido hacía fallar la ruta en vez de responder «origen no
  permitido». Pruebas: `tests/same-origin.test.mjs` con **8 casos**, seis de la
  función y dos guardianes que fallan si alguna ruta que escribe queda sin el
  guardia o si alguien vuelve a escribir una copia local; suite **846 en
  verde**; `typecheck`, `lint` y `build` limpios. Comprobado con el servidor de
  desarrollo: pedido cruzado `403` en contacto, boletín, socios, finanzas,
  deudas, reservas, progreso y cuenta; mismo sitio entra al camino normal
  (401/503/422 según el caso) y las páginas siguen respondiendo 200.
  **Queda abierto con ID propio:** SEG-07.
- [ ] **SEG-07 · Media · Código/operación — Límites de abuso y Storage.** El
  antispam de los formularios públicos es por IP y en memoria: no se comparte
  entre instancias ni sobrevive a un despliegue. Cierre: un límite común para
  las rutas que escriben, con respuesta clara al usuario legítimo, y políticas
  revisadas si algún día se usa Supabase Storage.
- [ ] **SEG-05 · Media · Código/operación — Registro de errores y alertas.**
  Hoy hay mensajes seguros en consola/logs de plataforma, sin un servicio de
  monitoreo con alertas. Cierre: errores de servidor/cliente agrupados, sin
  datos sensibles, con aviso al responsable y una forma de relacionarlos con la
  versión desplegada.
- [ ] **SEG-06 · Baja · Higiene de base — Reducir grants directos amplios.**
  La auditoría encontró RLS activo y sin exposición anónima fuera de las vistas
  públicas previstas, pero quedan grants directos más amplios que lo mínimo en
  algunas tablas/funciones. Cierre: inventario por objeto y reducción probada
  por rol, sin romper RLS/RPC ni reaplicar migraciones viejas.

## 6. Respaldo, calidad y operación técnica

- [ ] **CAL-01 · Alta · Decisión y operación — Respaldo automático y
  restauración ensayada.** No hay un flujo semanal propio en el repositorio.
  Hay que elegir entre plan de Supabase con copias o respaldo externo cifrado,
  definir retención, dueño del acceso y periodicidad, y ensayar la restauración
  en un proyecto separado o base desechable. Registrar la fecha del ensayo.
- [ ] **CAL-02 · Media · Operación — Completar la guía de incidentes.**
  `docs/GUIA-INCIDENTES.md` sigue con contactos y fecha de restauración entre
  corchetes. Completar responsable del gimnasio, administrador técnico, canal
  de aviso y criterio legal para comunicar incidentes con datos personales.
- [ ] **CAL-03 · Alta · Pruebas — Aceptación integral conectada.** CI ya corre
  tipos, lint, 717 pruebas de aplicación al cierre del PR #56, SQL por rol,
  layout con Chromium y concurrencia PostgreSQL desechable. Falta un recorrido
  formal en un entorno de ensayo: alta → vigencia cuando exista → reserva o
  entrada → cobro/producto → gasto/deuda → reporte/exportación, con admin,
  caja, entrenador, cliente y anónimo; clientes A/B; doble clic; respuesta
  perdida; red/sesión expirada; y revocación de rol.
- [ ] **CAL-04 · Baja · Decisión — Dominio final.** Hoy manda el subdominio de
  Vercel. Si el dueño compra un dominio, hay que configurar DNS/TLS, URL del
  sitio, redirecciones de Supabase Auth, canonical/SEO y verificar que no haya
  contenido mixto ni enlaces al dominio anterior.
- [ ] **CAL-05 · Baja · Mantenimiento condicional — Retirar el parche de
  `braces`.** Solo cuando exista una versión corregida aguas arriba o
  `micromatch` deje de depender de `braces`: actualizar, retirar
  `patches/braces+3.0.3.patch` si ya no hace falta y repetir pruebas.

## 7. Datos del negocio, contenido y legal

- [ ] **NEG-01 · Alta · Datos del dueño — Información final del gimnasio.**
  Confirmar razón social si difiere del nombre comercial, correo de contacto,
  dominio, código postal/coordenadas si se publican, Instagram/TikTok/YouTube,
  clase de prueba gratuita, precios/horarios definitivos y si Douglas García,
  José Luis Pérez y María Rodríguez son entrenadores reales o nombres de
  ejemplo que deben cambiarse antes de mostrar la app.
- [ ] **NEG-02 · Baja · Decisión — Google Sheets.** Ya existen exportaciones
  manuales en Excel/CSV. Falta decidir si eso basta o si se quiere una
  sincronización viva app → hoja. No construir la sincronización sin revisar
  permisos, datos personales y qué sistema manda ante una diferencia.
- [ ] **LEG-01 · Alta · Revisión legal — Textos y reglas publicadas.** Un
  abogado en Nicaragua debe revisar privacidad, términos, cookies,
  consentimiento de salud, descargo de ejercicio, menores/tutor, descargas con
  datos personales, plazos de retención/respuesta y la redacción final. También
  hay que alinear las reglas comerciales y de monedas con las tarifas reales
  NIO/USD. Mientras tanto, los textos siguen siendo borrador.

## 8. Pruebas guiadas pendientes

Estas no son funciones nuevas: son cierres de aceptación. No repetir cobros ni
crear operaciones ficticias en producción sin coordinarlo.

- [x] **QA-01 · Alta · Celular — CSP obligatoria.** Cerrada el 27 de octubre
  de 2026: el usuario recorrió en el celular la portada con fotos y mapa,
  Horarios, ingreso/MFA, Panel y Caja sin recursos en blanco por la CSP. El
  encabezado obligatorio de `next.config.ts` además se verifica en CI en
  cada PR con `test:metadata`.
- [x] **QA-02 · Media · Celular — INP del código MFA.** Cerrada el 27 de
  octubre de 2026: en el mismo celular del aviso de 207,1 ms, escribir el
  código dígito a dígito y pegarlo completo respondió sin traba, tras dejar
  el campo no controlado (el estado solo cambia al completar los 6
  dígitos).
- [ ] **QA-03 · Media · Celular — Cierre formal de Productos y ficha.** La venta
  real ya funcionó y Caja fue aprobada. Falta cerrar la lista guiada de tarjetas,
  paginación de 25, entrar/salir de producto, abrir cada módulo de la ficha y
  verificar que entrenador/cliente no ven el catálogo de venta.
- [ ] **QA-04 · Media · Cuenta real — Calculadora y resumen del socio.** Probar
  con una sesión real de cliente lo que no se puede validar en demo: resumen,
  calculadora, consentimiento, aprobación y «Mi progreso».
- [ ] **QA-05 · Media · Cuenta real — Ciclo de personal.** Con una cuenta de
  prueba, dar de alta, editar, desactivar y reactivar; verificar bitácora y que
  la baja bloquea el acceso según lo diseñado.
- [ ] **QA-06 · Media · Dispositivo real — QR.** Escanear con la cámara del
  celular, detener la cámara, usar búsqueda manual, imprimir/guardar el carnet
  y comprobar que un QR reemplazado ya no abre la ficha.
- [ ] **QA-07 · Media · Prueba coordinada — Deuda en USD.** Recorrer cargo,
  abono parcial, efectivo/vuelto y saldo en USD sin alterar NIO, en un entorno
  o con datos de prueba coordinados. No repetir el simple cobro USD1 ya probado.
- [ ] **QA-08 · Media · Celular — Zumba publicada y entrenadores.** Tres
  comprobaciones: **(1)** en `/es/horarios`, Zumba aparece lunes, miércoles y
  viernes a las 19:00 con «María Rodríguez», y las clases de Boxeo con «José
  Luis Pérez»; **(2)** en Caja, el plan «Zumba» se cobra a C$300 y da 30 días
  de vigencia de la disciplina `cls_zumba`; **(3)** en Administración →
  Horarios, Zumba figura en las columnas lunes, miércoles y viernes. Si algún
  día no cuadra, revisar la convención `0 = lunes` antes de tocar los datos.
- [ ] **QA-09 · Alta · Celular — Aceptación conjunta de vigencias, categorías y
  administración del calendario.** Es lo que falta para dar por aceptadas
  **CLI-01, CLI-02, CLI-06 y OP-05**, cuyo código ya está cerrado y desplegado.
  Con un usuario de cada rol: **(1)** cobrar un plan y ver la vigencia en la
  ficha, Mi Cuenta y el recibo; renovar antes de vencer y comprobar que
  encadena días; **(2)** ver la categoría cambiar sola tras el cobro y editar
  umbrales en Administración → Categorías; **(3)** crear una disciplina de
  ejemplo, definir su grilla, generar sus sesiones, agregar un día suelto,
  bloquear un rango y comprobar el resultado en Horarios y en las reservas.
  Al terminar, borrar la disciplina de ejemplo (apagarla, no borrarla).

## 9. Entrega al dueño — no ejecutar todavía

El usuario indicó que todavía está lejos el día de entrega. **No quitar la
apariencia demo, no limpiar ficticios y no retirar cuentas de prueba hasta una
orden nueva.**

- [ ] **ENT-01 · Entrega — Fase 1, antes de que el dueño pruebe.** Cambiar los
  textos visibles de «Modo demo» por un aviso de falta de conexión, limpiar las
  frases de demo de la guía interna, renombrar `demoGallery` y decidir si los
  registros de prueba se marcan «PRUEBA» o se explican en persona. Depende de
  NEG-01 para los entrenadores de portada.
- [ ] **ENT-02 · Entrega — Inventario de ficticios y aprobación.** Mapear
  dependencias y clasificar con el usuario clientes, ventas, reservas,
  mediciones, personal y usuarios de Auth de prueba. Mostrar conteos y alcance
  antes de borrar; abortar ante relaciones no clasificadas. Requiere CAL-01.
- [ ] **ENT-03 · Entrega — Limpieza, carga real y conciliación.** Con respaldo
  verificado y autorización expresa, retirar solo lo aprobado —incluida la
  parte de Auth por su procedimiento separado— y cargar datos reales. Conciliar
  saldos de cuentas y los cuatro saldos por cliente sin deducirlos de cobros
  históricos. Después, humo completo sin ficticios.
- [ ] **ENT-04 · Entrega — Acceso, demostración y manual.** Verificar al dueño
  como administrador antes de retirar el acceso temporal (SEG-03), hacer la
  demostración con límites documentados y entregar manual/mantenimiento.
- [ ] **ENT-05 · Entrega — Retirar el modo demo del código.** Solo después de
  entregar: quitar `demo-*`, `DemoBanner`, `DEMO_MODE` y ramas `isDemo`, y
  actualizar las guías. No hacerlo antes porque hoy sirve para abrir una copia
  local sin credenciales.

## 10. Futuro u opcional — no bloquea la operación actual

- [ ] **FUT-01 · Passkey/huella/rostro como método adicional.** Solo tras
  verificar que la función de Supabase ya no es experimental, saber si el dueño
  usa Android o iPhone y mantener TOTP como respaldo.
- [ ] **FUT-02 · Captcha/Turnstile.** Requiere cuenta externa, claves y la
  interacción en los formularios. No activarlo solo en Supabase.
- [ ] **FUT-03 · Endurecimientos Auth opcionales.** Valorar HIBP, exigir
  contraseña actual o reautenticación para cambiar la contraseña y un Auth Hook
  de bloqueo MFA por usuario/factor. Hoy mandan la política de la app, AAL2 y
  los límites de Supabase por IP.
- [ ] **FUT-04 · CSP con nonce.** Retirar `unsafe-inline`/`unsafe-eval` cuando
  se haga una tanda específica compatible con Next y probada en navegador.
- [ ] **FUT-05 · Límites nativos de sesión en Supabase.** Timebox/inactividad
  del proveedor siguen en 0 y pueden requerir plan pago. Es distinto del cierre
  en navegador de PER-01.
- [ ] **FUT-06 · Boletín completo.** El formulario guarda suscriptores, pero no
  hay administración, baja ni campañas. Decidir si se construye eso o se retira
  la promesa de novedades.
- [ ] **FUT-07 · Cambio de correo dentro de la app.** Hoy la cuenta puede
  recuperar/cambiar contraseña por el flujo de correo, pero no cambiar su
  correo desde Mi cuenta. Construirlo solo si el dueño lo necesita.
- [ ] **FUT-08 · Ampliaciones no prometidas.** Mantenimiento de equipos,
  nómina, facturación fiscal, campañas y automatizaciones requieren alcance y
  reglas propios; no se consideran parte faltante del producto actual.

---

## Mapa de fases contra esta lista

Se mantiene como referencia histórica del plan; el estado vivo está en
**Resumen de avance al 30 de octubre de 2026**, arriba. No duplicar números acá:
si cambia un estado, se cambia en el resumen.

| Fase o etapa | Plan original | Dónde está el detalle |
|---|---|---|
| Etapa 1 — Proteger lo construido | Seguridad, Auth y calidad | Sección 5 y QA-01/QA-02 |
| Etapa 2 — Ordenar navegación | Módulos del panel | OP-09 |
| Etapa 3 — Operación diaria | Clases, horarios, reservas, personal | Sección 1 y PER-01 |
| Etapa 4 — Gestión y finanzas | Cobros, planes, gastos, reportes | Secciones 2 y 3 |
| Etapa 5 — Aceptación integral | Pruebas por rol en celular | Sección 8 y CAL-03 |
| Etapa 6 — Entrega | Datos reales, limpieza y manual | Sección 9 |
| Roles A/B y Calculadoras A/B/D/E | Cerradas y aplicadas | «Cerrado y comprobado» |
| Calculadora C — Plan y rutina | Construida | CLI-03 y QA-04 |
| Seguridad 1A/1B/1C | Código cerrado | SEG-02 para la prueba con correo real |
| Demo/entrega | Aplazada por decisión del usuario | ENT-01 a ENT-05 |

## Cerrado y comprobado — no volver a abrir por documentos viejos

Esta sección es un resumen, no otra lista de tareas.

- Seguridad de accesos: RLS/RPC endurecidos, `crm_is_staff`/`is_staff` con
  AAL2, MFA TOTP del personal, rechazo de valores no escalares en MFA/PKCE,
  demo imposible en producción, recuperación PKCE y contraseñas de la app de
  12–128 caracteres.
- Origen de los pedidos (SEG-04, PR #96): un único guardia
  `sameOrigin` en `src/lib/security/same-origin.ts`, usado por las **26 rutas**
  con métodos que escriben, con `tests/same-origin.test.mjs` como guardián
  contra una copia nueva o una ruta sin proteger.
- CSP obligatoria y JSON-LD serializado de forma segura en el PR #56, con
  confirmación visual en celular de que ningún recurso queda bloqueado
  (QA-01).
- Lecturas B.1: sin datos ficticios ante errores conectados y sin convertir
  fallos en cero/vacío. El endpoint antiguo de reset quedó retirado con 410;
  la limpieza final segura es ENT-02/ENT-03.
- Roles: fases A y B, asignación de roles con bitácora, entrenadores con
  accesos aprobados, «Mis clientes» y seis permisos separados de caja. Un
  cliente puede tener dos o más entrenadores.
- Operación ya construida: clientes con o sin cuenta, recepción manual/QR,
  tarifas Día C$40, Semana C$150, Quincena C$280 y Mes C$560, Boxeo US$20,
  venta de productos con stock, ficha por módulos y Caja por módulos.
- Reservas OP-01: asistencia, inasistencia y cancelación administrativa se
  guardan con `staff_set_booking_status()` (00061), con estado esperado,
  idempotencia, control de cupo y sin escritura directa a `bookings`.
- Consultas OP-02: el estado leído/no leído se guarda con
  `staff_set_message_read()` (00062–00063), con lectura solo para personal con
  MFA, alta pública siempre como no leída y sin escritura directa a `messages`.
- Disciplinas OP-03: la activación se guarda con `admin_set_class_active()`
  (00064), solo para administración con MFA y sin escritura directa a
  `classes`; desactivar oculta la oferta y frena reservas nuevas sin cancelar
  sesiones ni reservas ya hechas, y reactivar restaura ambas cosas.
- Sesiones futuras OP-04: `admin_generate_future_sessions()` (00065–00066)
  permite a administración con MFA generar desde Operación las próximas 4
  semanas de la grilla vigente, sin duplicados ni sesiones pasadas. La prueba
  real creó 27 sesiones y la repetición confirmó que ya estaban generadas.
- Contraseñas y MFA (SEG-01, QA-02): la app y Supabase Auth comparten el
  mínimo de 12 caracteres, verificado por lectura remota tras el cambio en
  Dashboard; escribir y pegar el código TOTP responde sin traba en el
  celular donde aparecía el aviso de INP.
- Inactividad PER-01: administración y caja cierran sesión en el navegador
  tras 15 minutos sin actividad; entrenador y clientes no tienen cierre
  automático. La prueba móvil por rol fue aprobada por el usuario.
- Finanzas ya construidas: cobros, gastos, deudas/abonos NIO y USD, vuelto en
  abonos, comprobantes internos, reportes y exportaciones con filtros.
- Cierre y arqueo de caja (FIN-04, PR #110 y #111, migraciones `00087` y
  `00088`): abrir una sola caja por turno, contar por moneda y cerrar
  comparando contra la apertura más los ingresos y egresos de efectivo. La
  diferencia se guarda y, si no cuadra, exige motivo escrito. Sólo cierra quien
  abrió o un administrador, el mismo pedido no duplica nada y la tabla ya no
  acepta escrituras sueltas. Un cobro en efectivo de una caja cerrada no se
  anula (`CASH_SESSION_CLOSED`).
- Anulación de movimientos (FIN-01, PR #101, #102 y #103): el resultado ya no
  depende de que llegue el cuerpo de una respuesta. «Anular» en Caja envía un
  formulario del navegador y la ruta responde 303 a
  `/{idioma}/panel/caja/anulacion/{id}`, una página armada en el servidor que
  **lee la base** (`finance_void_plan` más el comprobante guardado) y cuenta lo
  que pasó: cuenta, saldo antes y después, motivo, quién, cuándo y stock
  devuelto, o el motivo por el que no se pudo. Si no se puede leer el estado,
  el título no afirma que no se hizo. La lista de Caja marca los movimientos
  anulados con su motivo y deja de ofrecer «Anular» en ellos.
- Uso e historial de precios de los planes (CLI-07, migración 00086): cada plan
  dice cuánta gente lo tiene y cuántos cobros hubo este mes, «Ver quiénes» abre
  la lista con vencimientos, y cada cambio de precio queda con su valor anterior,
  quién y cuándo.
- Baja de vigencia al anular (FIN-09, migración 00085): anular un cobro deja
  el segmento marcado como anulado —nunca borrado—, adelanta los meses
  encadenados sin perder ni ganar días, respeta los huecos reales y deja
  bitácora con antes/después en `plan_validity_log`; la pantalla avisa antes de
  confirmar y cuenta el resultado después.
- Historial de Caja (FIN-05, migración 00084): buscar y paginar todo el
  historial desde el servidor, con el total real, sin comodines accidentales,
  con el interruptor de gastos aplicado en el servidor y sin convertir un
  fallo de lectura en una lista vacía.
- Horarios públicos sin datos fijos (31 de octubre): el subtítulo de
  `/horarios` ya no afirma «las clases de boxeo son martes, miércoles y jueves»
  —con Zumba publicada eso era falso— y la tarjeta de Zumba dejó de mandar a
  preguntar el horario por WhatsApp. Los dos textos remiten a la agenda, que es
  la que manda y se edita desde el panel, así no quedan viejos cada vez que se
  cambia un día u hora.
- Progreso: medidas, altura única corregible solo por admin, asistencia por
  día/semana/mes, calculadora con consentimiento/aprobación, menores bloqueados
  en herramientas de salud y personal sin botón de reservar.
- Personal: alta, edición, baja, reactivación y auditoría construidas en la
  00049; solo falta QA-05.
- Calidad: lint en cero con `react-hooks/set-state-in-effect` como error,
  parche probado de `braces`, CI con SQL por rol, layout y concurrencia.
- Auditoría de secretos del árbol actual: sin contraseñas reales, claves
  privadas, JWT/tokens externos ni `service_role` real en el alcance revisado.
  Las direcciones completas de prueba se quitaron de los archivos actuales; las
  cuentas siguen intactas y el historial antiguo de Git no se reescribió.

## Documentos eliminados al consolidar

El 26 de octubre de 2026 se eliminaron las listas y planes que duplicaban esta
fuente. Todo lo que seguía abierto quedó incorporado arriba. Si alguna vez hace
falta consultar el texto histórico, está en Git hasta el commit `3bede94`:

- `docs/MAPA-PENDIENTES.md`
- `docs/LISTA-PENDIENTES-DUENO.md`
- `docs/PENDIENTE-DEMO-Y-ENTREGA.md`
- `docs/TAREA-LINT-REACT-HOOKS.md`
- `docs/PLAN-PRODUCTO.md`
- `docs/INVENTARIO-FUNCIONAL.md`
- `docs/VALIDACION-INVENTARIO.md`
- `docs/ROLES-MIGRACION-PLAN.md`
- `docs/ROLES-CAJA-ENTRENADOR.md`
- `docs/ANALISIS-CALCULADORA-Y-CATEGORIAS.md`
- `docs/SPEC-CATEGORIAS-PRODUCTOS-ASISTENCIA.md`

Los documentos que quedan en `docs/` son guías, decisiones o notas técnicas e
históricas de implementación. **Ninguno es una segunda lista de pendientes.**
