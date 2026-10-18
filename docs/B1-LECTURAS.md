# B.1 — Lecturas conectadas sin datos ficticios ni vacíos falsos

## 1. Alcance de esta entrega

Se implementan las correcciones locales de B04, B05 y B07 del inventario inicial.
Es una entrega de código probado localmente, **no la aceptación de todo el
producto ni una prueba nueva contra Supabase remoto**.

- Con Supabase configurado, clases, entrenadores y planes devuelven la lista
  real, incluso si está vacía. Un fallo no resucita tarjetas de ejemplo.
- Horarios no fabrica sesiones ante errores. Un fallo al consultar ocupación
  impide anunciar cupos; conteos inválidos también se rechazan. Si la consulta de
  ocupación sí fue exitosa y no hay fila para una sesión, cero es válido: la
  vista agrupa reservas, no incluye sesiones sin reservas.
- Lecturas de reservas propias/administrativas, IDs reservados y mensajes no
  convierten errores en listas vacías. Relaciones de sesión/clase ausentes no
  hacen desaparecer silenciosamente una reserva.
- El conteo CRM cae a `profiles` únicamente si falta la tabla `gym_clients`
  (`42P01`/`PGRST205`); RLS, conexión, columna incorrecta o conteo nulo no son cero.
- Las lecturas SQL operativas y las solicitudes de horarios/reservas desde el
  navegador tienen límite de 15 segundos **por consulta**, no de todo el render.
- Sin configuración se conserva la vista local de ejemplo; no representa una
  demostración comercial conectada ni permite simular éxito en las APIs de
  contacto, newsletter o actualización de perfil.

## 2. Presentación y reintentos

`src/lib/data/read-result.ts` contiene un contrato puro de error/resultado.
Sólo expone códigos seguros, no detalles SQL, emails ni payloads.

Las secciones de disciplinas, planes y equipo muestran error/reintento de forma
independiente. Las demás secciones de la landing siguen disponibles. Planes
vacíos tienen mensaje explícito; equipo vacío mantiene los datos generales
confirmados que ya existían, sin nombres inventados.

Panel y Mi cuenta, cuando falla una lectura necesaria, muestran el aviso en vez
de un resumen vacío o ceros. Horarios no publica eventos JSON-LD si no pudo
confirmarlos. Se retiró de la landing una consulta privada de reservas cuyo
resultado no se utilizaba; no se quitó un módulo visible.

Las APIs de lectura responden 503 con `private, no-store` ante error. Reservas
propias sin sesión responden 401, no 200 con una lista vacía aparentemente válida.

En el navegador:

- Horarios diferencia carga, error y semana correctamente vacía.
- Reintentar sólo repite GET; si falla la semana siguiente, reintenta esa semana.
- Una respuesta tardía de otra semana no pisa el resultado más reciente.
- El provider mantiene estado de lectura de reservas asociado al usuario.
  Cambiar sesión invalida respuestas anteriores; una mutación tardía de la
  sesión anterior tampoco puede iniciar una recarga que bloquee a la nueva.
- Mientras las reservas están sin confirmar, la UI no ofrece acciones basadas
  en datos desconocidos ni métricas vacías como si fueran definitivas.
- Si una reserva fue confirmada pero falla su lectura posterior, no se reenvía
  la operación automáticamente. Se solicita recuperar la lectura.

## 3. Éxitos de escritura falsos

Contacto/newsletter ya no responden `ok:true, mode:demo` sin base ni ante fallo
de creación del cliente. Las excepciones de transporte tienen respuesta de
error, sin detalles privados. No se implementaron campañas de email.

Actualizar perfil propio requiere cliente disponible y una fila retornada por
`.select('id').single()`; una respuesta SQL sin fila afectada no se toma como
actualización confirmada. Se mantienen validación, sesión y permisos existentes.

Un fallo de transporte después de enviar una escritura no demuestra que no se
guardó. Esta entrega no agrega reintentos automáticos de esas escrituras ni una
promesa de idempotencia general para contacto/perfil/newsletter.

## 4. Pruebas reales ejecutadas

Fecha: 2026-10-17. Rama `arena/9bdd978c-strong-gym`.
Logs de sesión fuera del repositorio: `/home/user/reads-*.log`.

Se agregaron **100 pruebas** que ejercitan consultas/APIs/componentes reales con
fronteras controladas: 62 de lecturas/SSR de catálogos, 23 de APIs/páginas y 15
interactivas con React/JSDOM (errores, reintentos y respuestas tardías).
Ya se incluyen en CI porque `test:auth` ejecuta `tests/*.test.mjs`.

```text
npm run typecheck
> tsc --noEmit
exit 0

npm run lint
✖ 10 problems (0 errors, 10 warnings)
exit 0 — mismos avisos previos; no se agregaron avisos

npm run test:auth
# tests 231
# pass 231
# fail 0
exit 0

npm run test:finance:rsc
✅ Next/RSC: Cuentas y Reportes prerenderizados con filas y vacíos, sin llamadas servidor→función cliente.
exit 0

npm run build
✓ Compiled successfully
✓ Generating static pages using 1 worker (40/40)
exit 0 — sin aviso metadataBase

npm run test:metadata
✅ /es y /en: idioma, canonical, OG/Twitter absolutos; PNG 1200×630/200
✅ enlace anterior de imagen por redirección; ruta inexistente 404; sin aviso metadataBase
exit 0

npm run test:sql
🎉 Todo pasó
🎉 CRM: 48 comprobaciones pasaron
🎉 Compatibilidad CRM: 67 comprobaciones pasaron
exit 0 — PostgreSQL/PGlite local descartable

node scripts/build-sql.mjs --check
✅ Todo al día — 9 clases por semana.
exit 0
```

Se verificó que la sección financiera de `queries.ts` desde FASE 1 es idéntica
byte por byte a la versión anterior. No se modificaron SQL, seeds, reglas de
cobros/deuda/FX, RLS ni saldos. No se ejecutó SQL remoto, reset o cambio de admin.

## 5. Qué sigue pendiente

- B01/B02/B03: botones administrativos que sólo cambian React (reservas,
  leído/no leído y activación de disciplinas). **No los repara esta entrega.**
- B06: reset legado inseguro; no usar para limpiar la demostración completa.
- Escritor compatible de cobros, registro de gastos y decisiones financieras
  explícitas antes de sustituir el guard protector.
- Recorridos conectados con la sesión real y móvil físico. JSDOM no sustituye
  navegador real, cámara, conciliación financiera ni comprobación de esquema remoto.
- Validación funcional completa de los demás módulos, importación real y limpieza
  SQL final; siguen el plan de producto, no se dan por entregados con este bloque.

Para revisar sin escribir datos: abrir el Preview configurado, navegar Inicio,
Horarios, Mi cuenta y Panel; comprobar listados y, cuando haya un error visible,
compartir sólo su código. No provocar fallos cambiando claves/políticas remotas,
no usar reset ni realizar cobros para validar este bloque. No es necesario que el
usuario ejecute SQL por esta corrección.
