# Strong Fitness Gym — Lista única de pendientes

**Esta es la única lista viva de tareas del proyecto.**

Si otro documento dice «pendiente», «fase siguiente» o «sin implementar», se
interpreta como una nota histórica y **manda esta lista**. Los demás documentos
pueden explicar decisiones, guías de uso o cómo se construyó una parte, pero no
crean tareas nuevas.

Última auditoría completa: **26 de octubre de 2026**, sobre producción
`main@3bede94525cbfb0b958ebb7275189a4affa97f6e` (PR #56) y Supabase
`hcnuepdxmbsmlzdmvwhx`.

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

- Producción: PR #56 fusionado; Vercel `dpl_HHuLnBJAnvhEzqxSPpahdxkXPtbj`
  READY/PROMOTED.
- GitHub al auditar: sin PR ni issues abiertos. No se encontró trabajo de una
  fase esperando en un PR sin fusionar.
- Supabase: proyecto ACTIVE_HEALTHY. La última migración del repositorio y del
  historial remoto es la **00066** (`coaches_specialties_generador`, versión
  remota `20261028011737`). El siguiente número libre es **00067**.
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
| 1 | **CLI-01** | Las vigencias ordenan planes, categorías y operación diaria. |
| 2 | **FIN-01 y FIN-02** | Anulaciones y vuelto son los huecos financieros más visibles. |
| 3 | **CAL-01, CAL-03, LEG-01 y NEG-01** | Preparan una entrega segura cuando el dueño entregue datos y decisiones. |

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
- [ ] **OP-05 · Media · Código — Administrar disciplinas, grillas, sesiones y
  excepciones del calendario.** Alcance ampliado el 27 de octubre de 2026 a
  petición del usuario, después de aprobar OP-04. Hoy el generador solo sigue
  la grilla fija de Boxeo y el botón crea cuatro semanas completas; las demás
  acciones de esta tarea todavía no se pueden hacer desde Operación. OP-05
  debe permitir, sin SQL manual ni cambios de código:
  - Crear, editar y desactivar disciplinas nuevas o existentes, con sus
    textos, duración, cupo, intensidad, color y orden. Debe reutilizarse el
    interruptor persistente de OP-03 y no borrarse una disciplina con
    historial.
  - Crear, editar y desactivar **una o varias grillas recurrentes por
    disciplina** —por ejemplo, una futura grilla de Zumba— con días de la
    semana, horas de inicio, duración, sala, cupo, entrenador y vigencia
    desde/hasta. La grilla actual de Boxeo debe pasar a ser la primera
    grilla administrable sin duplicar sesiones ya generadas.
  - Generar sesiones desde una grilla para un horizonte o rango elegido,
    mostrando antes cuántas se crearían y cuáles se omitirían por duplicado,
    choque o bloqueo. El botón de OP-04 puede quedar como atajo de cuatro
    semanas, pero no debe seguir siendo la única forma de generar.
  - Crear, editar, mover y cancelar **sesiones sueltas o días especiales**
    fuera de la grilla, además de sesiones individuales o rangos elegidos de
    una serie. Al bajar un cupo o mover una sesión no debe permitirse
    sobreventa ni perderse el efecto sobre las reservas futuras.
  - Registrar **bloqueos y cierres por rango de fechas u horas** para todo
    el gimnasio, una disciplina o un entrenador, con motivo —feriado,
    vacaciones, enfermedad, mantenimiento u otro—. El generador debe
    omitir lo bloqueado. Si ya existen sesiones, antes de confirmar debe
    mostrar las afectadas y sus reservas; las sesiones se cancelarán sin
    borrar historial, las reservas quedarán canceladas por el gimnasio con
    motivo y también debe poder asignarse un entrenador sustituto en vez de
    cancelar. Levantar un bloqueo no resucitará sesiones canceladas sin una
    acción explícita.
  - Asignar entrenadores por grilla y por sesión, usando especialidades
    estructuradas, y detectar choques del mismo entrenador o de la misma
    sala en el mismo horario. También debe completarse la gestión de
    catálogos operativos de planes y entrenadores más allá de las cuatro
    tarifas NIO ya editables.
  Todo el CRUD debe estar autorizado en pantalla, servidor y RLS/RPC, con
  bitácora, control de concurrencia e idempotencia, fechas en
  `America/Managua`, sin crear sesiones pasadas por error y sin borrar
  sesiones o reservas para corregirlas. Cierre: probar el esquema productivo
  divergente y, desde el celular, crear una disciplina de ejemplo, definir
  su grilla, generar sus sesiones, agregar un día suelto, bloquear un rango
  y comprobar el resultado en Horarios y en las reservas afectadas. Sin esos
  casos, OP-05 no se considera terminada.
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

- [ ] **CLI-01 · Alta · Código — Vigencias de planes.** Decisión cerrada y
  código aplicado el 28 de octubre de 2026; **falta la aceptación en celular
  con un usuario de cada rol**. Duraciones aprobadas contando el pago como día
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
- [ ] **CLI-02 · Media · Código — Completar la categoría automática.** Ya se
  calcula Común/Amigo/Familia/Strong Gym al leer, usando visitas, plan asignado
  y compras de 90 días. Falta usar la vigencia real de CLI-01, guardar historial
  de cambios y permitir una fijación manual del administrador con motivo. Hay
  que confirmar los umbrales y la prioridad cuando una regla se cruza con otra.
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

- [ ] **FIN-01 · Alta · Código — Fase C: anulación controlada.** Crear la
  reversa de un movimiento sin borrarlo, con motivo, actor, fecha y bitácora.
  Regla ya conversada: si `cashier_can_void` está apagado, el administrador
  autoriza y aplica; si está encendido, caja solo anula sus cobros del día.
  Falta definir y probar ventas con productos/stock, abonos, gastos,
  devoluciones/crédito y qué ocurre con un día ya cerrado.
- [ ] **FIN-02 · Alta · Código — Efectivo recibido y vuelto en cobros por
  servicio y productos.** Ya existe en abonos de deuda. Falta llevarlo al cobro
  general y al checkout con productos, en la misma moneda y cuenta habilitada,
  con comprobante e intento idempotente que conserve el dato ante un reintento.
- [ ] **FIN-03 · Media · Código — Cuentas, catálogos y transferencias.** Falta
  administrar cuentas de caja/banco, métodos y categorías desde la app, y
  registrar transferencias entre cuentas sin contarlas como ingreso o gasto.
  Cierre: reglas por moneda/FX, permisos, saldos antes/después y auditoría.
- [ ] **FIN-04 · Media · Código — Apertura, cierre y arqueo de caja.** Hoy hay
  reportes de cierre del día y tablas legadas `cash_sessions`/`cash_registers`,
  pero no un flujo único de abrir, contar efectivo, cerrar, registrar
  diferencias y conciliar por cuenta/responsable. Cierre: un solo modelo, sin
  duplicar tablas, y bloqueo o aviso claro para movimientos de un día cerrado.
- [ ] **FIN-05 · Media · Código — Historial completo de Movimientos en Caja.**
  La pantalla reutiliza los últimos 30 y los pagina de 25 en 25. Falta buscar y
  paginar todo el historial desde el servidor, respetando los permisos de caja.
  Reportes y exportaciones ya leen por páginas; no hay que duplicar esa lógica.
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
- [ ] **SEG-04 · Media · Revisión de código — CSRF y abuso de forma uniforme.**
  Finanzas, clientes y deudas ya revisan origen/`sec-fetch-site`; falta una
  pasada sistemática por todas las rutas que escriben y una política común de
  límites. El antispam actual de formularios públicos es por IP y en memoria.
  No se usa Supabase Storage hoy; si se introduce, sus políticas entran en esta
  revisión antes de publicar archivos.
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

| Fase o etapa | Estado al 26 oct 2026 | Lo abierto vive en |
|---|---|---|
| Etapa 1 — Proteger lo construido | Muy avanzada | SEG-01 a SEG-06, CAL-03, QA-01, QA-02 |
| Etapa 2 — Ordenar navegación | Hecha con módulos actuales | OP-09 |
| Etapa 3 — Operación diaria | Parcial | OP-04 a OP-08, CLI-01, PER-01, QA-03, QA-06 |
| Etapa 4 — Gestión y finanzas | Parcial | FIN-01 a FIN-07, CLI-02 |
| Etapa 5 — Aceptación integral | Sin cerrar | CAL-01 a CAL-04, QA-01 a QA-07, LEG-01, NEG-01 |
| Etapa 6 — Entrega | No empezada, a propósito | ENT-01 a ENT-05, SEG-03 |
| Roles A/B | Cerradas y aplicadas | — |
| Roles C — Anulación | Sin empezar | FIN-01 |
| Calculadora A — Asistencia | Cerrada | — |
| Calculadora B — Categoría | Parcial | CLI-02 |
| Calculadora C — Plan/rutina | Construida | CLI-03, QA-04 |
| Calculadora D — Interruptor | Construida para entrenador | CLI-05 solo si se piden permisos más finos |
| Calculadora E — Productos | Cerrada | — |
| Seguridad 1A/1B/1C | Código cerrado | SEG-02 para la aceptación con correo real |
| B.1 lecturas / B04/B05/B07 | Cerrada | — |
| B.2 acciones persistentes | Cerrada | — |
| Demo/entrega 1 | Aplazada | ENT-01 |
| Demo/entrega 2 | Aplazada | ENT-02 a ENT-04 |
| Demo/entrega 3 | Aplazada | ENT-05 |

## Cerrado y comprobado — no volver a abrir por documentos viejos

Esta sección es un resumen, no otra lista de tareas.

- Seguridad de accesos: RLS/RPC endurecidos, `crm_is_staff`/`is_staff` con
  AAL2, MFA TOTP del personal, rechazo de valores no escalares en MFA/PKCE,
  demo imposible en producción, recuperación PKCE y contraseñas de la app de
  12–128 caracteres.
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
