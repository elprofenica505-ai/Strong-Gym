# Strong Gym — Plan de producto y entrega

## 1. Objetivo acordado

Construir un **sitio web con sistema de gestión del gimnasio**, no una maqueta.
Incluye presencia pública, clientes, reservas, recepción, administración,
finanzas operativas y seguridad. Se seguirá ampliando por entregas comprobables.

Durante el desarrollo se usan datos inventados **guardados realmente en Supabase**
para verificar operaciones completas. El funcionamiento no debe ser simulado.
El modo local sin Supabase existente NO sustituye esta demostración conectada.

Secuencia acordada con el usuario:

1. Construir los módulos y completar las fases.
2. Probar los recorridos integrados con información inventada.
3. Presentar el producto al dueño y obtener su aprobación.
4. Respaldar y limpiar exclusivamente la información inventada mediante SQL
   revisado y probado, conservando estructura, funciones, permisos y aplicación.
5. Cargar información real manualmente o por importación validada.
6. Verificar saldos iniciales, acceso del dueño y comenzar la operación real.

El permiso para continuar el desarrollo **no es autorización para borrar datos,
ejecutar SQL remoto, cambiar administradores ni mergear el PR**.

## 2. Punto de partida y seguimiento

Inventario de código y pendientes: [INVENTARIO-FUNCIONAL.md](./INVENTARIO-FUNCIONAL.md).
Avance B.1: [lecturas corregidas y pruebas locales](./B1-LECTURAS.md).

Ese documento diferencia implementación, prueba local y evidencia remota; abrir
una pantalla no implica que sus botones guarden ni que sus números concilien.

No se reinicia el proyecto. Se conserva el trabajo previo y se corrigen las
brechas detectadas. Las fases siguientes son un orden de entrega del producto;
no cambian los números de las migraciones ni invalidan los documentos históricos.

| Etapa | Entregable | Condición de salida |
|---|---|---|
| A. Inventario | Acciones existentes, dependencias, riesgos y cola priorizada | Revisión inicial documentada; cada brecha tiene evidencia y aceptación. No equivale a E2E completo. |
| B. Operación diaria | Clientes, recepción, reservas, clases y consultas del sitio | Acciones administrativas persisten; recargar/otra sesión conserva cambios; errores no se disfrazan de datos ficticios. |
| C. Finanzas | Cobros, gastos, cuentas, movimientos, deuda/crédito y comprobantes internos | Escrituras atómicas y autorizadas; reintentos no duplican; cuenta/moneda correctas; reportes concilian con movimientos de prueba conocidos. |
| D. Personal y seguridad | Gestión de personal y responsabilidades, permisos e historial de acciones | Matriz de permisos comprobada en servidor y base; sin escalada desde navegador; acceso del dueño preparado sin quitar antes el acceso actual. |
| E. Control del dueño | Reportes, filtros, exportación y configuración operativa | Totales reproducibles; fechas Managua; desconocido distinto de cero; exportaciones con alcance claro y acceso autorizado. |
| F. Demostración integral | Recorridos conectados, móviles y pruebas adversas | Alta → reserva/entrada → cobro → gasto → reportes verificados; permisos, fallos de red, concurrencia y duplicados probados. |
| G. Transición | Respaldo, limpieza, carga real y entrega de acceso | Ensayo en base descartable; limpieza verificada; importación revisada; dueño entra como admin antes de retirar el acceso temporal. |

La etapa A contiene el inventario inicial, no una declaración de que ya se revisó
manualmente cada botón en un navegador conectado. La etapa B empieza por los
bloqueantes P0 de persistencia y lecturas, sin habilitar un escritor financiero
inseguro para aparentar avance.

## 3. Reglas que se mantienen

- Clientes, no “socios”, en la interfaz. Alta sólo con nombre; correo, teléfono,
  cuenta web y QR opcionales. `gym_clients` y `profiles` no son intercambiables.
- Búsqueda manual siempre; escanear sólo abre ficha. Una visita/día Managua;
  cliente activo; no bloquear entrada automáticamente por deuda.
- Etiquetas Clientes / Clientes amigos / Clientes familia Strong sólo las cambia
  admin. No son privilegios, planes ni descuentos automáticos.
- No usar tasas de cambio inventadas, mezclar unidades ni descontar deuda de dos
  monedas con un solo pago. Las reglas financieras pendientes se documentan antes
  de implementarlas; el objetivo de cobros funcionales no autoriza escogerlas
  silenciosamente. Por ahora se conserva el bloqueo protector del esquema legado.
- No prometer facturación fiscal, nómina legal ni contabilidad formal por tener
  Caja y Reportes. Requieren alcance, reglas y validaciones adicionales.
- Estética oscura/roja; sin fotos IA; acceso desde celular; instrucciones numeradas.
- Fallos de Supabase no deben transformarse silenciosamente en éxito, ceros,
  listas vacías o datos de ejemplo. Un vacío válido sí se muestra como vacío.
- Cada entrega incluye resultados reales y limitaciones de las pruebas; no se
  cierra un módulo por compilar o por abrir una página.

## 4. Definición de terminado por acción

1. Validación en UI, servidor y base según corresponda.
2. Permiso correcto para admin, staff, cliente y anónimo; denegaciones probadas.
3. Cambio persistido y visible después de recargar y en una segunda sesión.
4. Fallo de red/base y respuesta perdida tratados sin éxito falso.
5. Prevención de duplicados e idempotencia cuando crea dinero u otras operaciones
   no repetibles; conflictos y reintentos explícitos.
6. Historial del actor y efecto relacionado donde sea necesario.
7. En dinero: montos/monedas/cuentas/estado y reversión definidos; nunca borrar
   movimientos reales para corregirlos. Comprobar resultados con un caso conocido.
8. Prueba móvil, estados de carga/vacío/error y navegación utilizable.
9. Pruebas automatizadas y recorrido conectado documentados por separado.
10. Identificación y dependencias de sus datos de prueba contempladas para la
    limpieza final. Eso no habilita su borrado durante el desarrollo.

## 5. Limpieza final: requisitos de diseño, no SQL listo para ejecutar

- Hacer un mapa de dependencias del esquema que exista al finalizar los módulos.
- Identificar lotes/registros de prueba de forma verificable. `is_demo` actual
  sólo identifica ciertas fichas; no marca automáticamente todos los pagos,
  reservas, trabajadores o clientes creados manualmente durante las pruebas.
- Inventariar también los datos históricos y clasificarlos con el usuario. No
  asumir que cualquier fila anterior a una fecha es ficticia ni cambiar marcas
  de datos existentes automáticamente.
- Mostrar antes del borrado el alcance y conteos, incluyendo dependencias y
  configuración que se conservará; abortar ante relaciones no clasificadas.
- Respaldar y ensayar restauración en entorno descartable. SQL de limpieza de
  información transaccional, con comprobaciones y rollback ante fallos; no
  DROP/TRUNCATE CASCADE indiscriminado ni desactivar RLS/triggers a ciegas.
- Limpiar efectos financieros de prueba y comprobar saldos, no sólo borrar las
  filas de transacciones. Conservar/cargar explícitamente saldos reales iniciales.
- Preservar tablas, funciones, vistas, políticas, permisos y configuración válida.
  Definir qué planes, categorías, cuentas y horarios se conservan antes de limpiar.
- El cambio de acceso Supabase Auth se trata como un procedimiento aparte y
  verificado; no borrar `auth.users` con SQL improvisado. El dueño debe tener un
  acceso admin comprobado antes de retirar el del desarrollador.
- Probar que después se puede iniciar sesión, crear clientes, reservar, cobrar,
  registrar gastos y obtener reportes coherentes sin registros ficticios.
- Entregar al usuario el SQL final completo para copiar y pegar cuando corresponda,
  con previsualización y ejecución claramente separadas. No se entrega ahora un
  borrado incompleto para un esquema que todavía va a ampliarse.

## 6. Carga real y mejoras futuras

Primera carga: clientes y configuración; después saldos/deudas iniciales y los
históricos que el dueño quiera conservar, con moneda, fecha y procedencia claras.
El CSV actual de clientes no es un importador financiero ni de personal/reservas.
Prever previsualización, validación por fila, duplicados, informe de resultados y
reintento seguro antes de prometer importación Excel general.

Mejoras a priorizar con el dueño: venta de productos/inventario, mantenimiento de
equipos, alertas, automatizaciones y otras herramientas. No se consideran ya
implementadas ni se inventan reglas laborales, fiscales o comerciales para ellas.

## 7. Control de entregas

Trabajar en `arena/9bdd978c-strong-gym`, PR #10 sin merge automático.
Documentar cada bloque: cambios, pruebas, pendientes y SQL si corresponde.
Revisión inicial: 2026-10-17, código base `9910268`.

Reparación posterior a B.1: [reservas sin embeddings, shell móvil y seguridad de entrega](./REPARACION-RESERVAS-MOVIL.md). La escritura compatible de C.1 se entregó después de esta reparación.

C.1: SQL instalado por el usuario; cobro NIO10, gasto NIO4 y cobro USD1
contrastados mediante capturas, con separación de cuentas/monedas. También se
comprobaron redirecciones de Caja/Gastos como cliente, rechazos de lectura API y
recuperación del gasto desde el historial actualizado. No repetir la instalación.
[Instalación y límites](./COBROS-GASTOS.md).

Concurrencia: seis controles con conexiones PostgreSQL separadas pasaron en local
y CI. Recuperación integrada: formulario real en JSDOM → API real → funciones SQL
reales en PostgreSQL local, con respuesta perdida después del COMMIT y reintento
sin duplicar en NIO/USD. No equivale a una prueba HTTP/Next/PostgREST ni remota.
[Evidencia y pendientes](./VALIDACION-FINANCIERA-2026-10-17.md).

Pendientes: escritura denegada y respuesta perdida en Supabase remoto bajo
identidades reales, aceptación integral B–F, deudas/créditos con reglas explícitas,
vigencias y demás módulos del plan. C.1 no aplica deudas/créditos ni renueva planes.
Sin merge, limpieza o cambios de acceso del dueño todavía.

Operación diaria validada posteriormente por el usuario: entrada manual persistida
y segunda entrada del día rechazada sin duplicado; edición de plan y nota
persistida tras recarga. Se detectó discrepancia del plan entre ficha y Mi cuenta.
[Reparación y SQL de lectura propia](./PLAN-CUENTA.md): no es una renovación ni
una prueba de vigencia/pago. Aplicación remota de PLAN-CUENTA pendiente.
