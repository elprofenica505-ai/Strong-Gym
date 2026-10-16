# FASE 2 — Clientes, etiquetas y recepción manual/QR

## Decisiones del negocio

- En Nicaragua se usa **clientes**, no “socios”. La interfaz en español, plantilla
  CSV y textos administrativos usan ese término. Se conservan rutas históricas,
  nombres internos `member` y claves SQL para no romper integraciones.
- Etiquetas: **Clientes**, **Clientes amigos**, **Clientes familia Strong**.
  Sólo el administrador cambia la etiqueta; staff atiende, registra y cobra.
  Son segmentación comercial. No son roles, planes, descuentos ni promociones.
- Frecuencia separada: días de visita en los últimos 30 días (hoy y los 29
  anteriores), aproximación semanal y última visita. Sin clasificación moral de
  “buen cliente”, ascensos automáticos ni umbrales comerciales inventados.
- Una visita por cliente/día, en America/Managua. Reingresar ese día no duplica
  la estadística. No es asistencia a una clase: no modifica bookings.
- QR y búsqueda manual abren la misma ficha. Escanear NO cobra ni registra
  asistencia automáticamente. Confirmar cada acción por separado.
- Cliente sin teléfono/correo/cuenta: alta rápida sólo con nombre, carnet impreso
  o búsqueda manual por nombre/número. Revisar coincidencias antes de dar de alta.
- Se bloquea asistencia si la ficha está congelada/cancelada. No hay bloqueo
  automático por deuda. Un saldo desconocido se muestra como desconocido, no cero.

## Arquitectura y límites

`profiles` sigue siendo la tabla de identidades del sitio, enlazada a Supabase
Auth. `gym_clients` NO es una tabla de usuarios: es la ficha comercial que puede
existir sin cuenta web. `profile_id` es opcional y único. No se crean cuentas
falsas, correos artificiales ni contraseñas para clientes de recepción.

La migración crea fichas vinculadas para los perfiles `member` existentes y un
trigger para registros web nuevos. No vincula fichas por email automáticamente.
Una persona dada de alta en recepción que posteriormente se registre en la web
puede quedar con dos fichas: esta primera entrega NO incluye fusión/vinculación
administrativa de historiales. Antes de habilitar esa transición masivamente,
implementar un proceso verificado; no unir por coincidencia de correo ni editar
IDs a ciegas. Puede usar el carnet de recepción sin cuenta mientras tanto.

El directorio busca nombre/teléfono/número y filtra etiqueta, 30 resultados por
página. La ficha muestra últimas 60 visitas, 40 transacciones y 40 eventos.
Los cambios de etiqueta y estado guardan valor anterior/nuevo y actor en auditoría.
Los datos opcionales del CSV (emergencia, nacimiento, dirección, notas médicas)
se conservan en campos separados de la ficha; esta versión no incluye su editor
visual. No usar notas comerciales para almacenar información médica.

Los cobros guardan `transactions.client_id` y son visibles en Caja. Si existe un
perfil vinculado, también usan `member_id` y los triggers financieros existentes.
Una ficha sin cuenta web tiene historial de cobros, pero NO se inventa saldo,
no se emite factura, no se genera deuda ni se renueva un plan automáticamente.
Asignar plan aquí es un dato comercial, no un contrato con vencimiento calculado.

## Seguridad y confiabilidad

- Guards de servidor, API y SQL: admin/staff. El cliente sólo obtiene su propio
  carnet con `crm_my_pass`; no tiene directorio ni permiso para registrar visitas.
- RLS activo; tablas CRM sin escritura directa por navegador. Operaciones vía
  funciones con validación y auditoría, EXECUTE revocado a PUBLIC.
- Se impide cambiar `profiles.role` desde la antigua edición de perfil propio.
  Sólo un admin puede cambiar roles; el SQL Editor sin identidad conserva su
  administración. La migración no promueve a nadie.
- QR: token aleatorio, sin nombre, teléfono, deuda, UUID de login ni URL pública.
  Se envía por POST, no por querystring. Es identificador, no contraseña ni
  prueba antifraude de presencia. Recepción debe confirmar el nombre.
- Reemplazar el QR invalida el anterior. El carnet se entrega personalmente o en
  papel/PDF; no publicarlo. Cámara con permiso explícito, HTTPS y botón detener.
  Permiso denegado o dispositivo sin cámara: búsqueda manual siempre disponible.
- Cobros con confirmación, cuenta/moneda/método activos y tasa explícita para USD.
  Referencia idempotente por intento: repetir el mismo no duplica transacciones;
  cambiar el contenido con la misma referencia genera conflicto.
- Intento pendiente se conserva en sessionStorage de esa pestaña y sobrevive a
  recarga. No abrir otra pestaña para “reintentar”: revisar historial y misma
  referencia. Descartar sólo tras comprobar el resultado, pues un intento nuevo
  puede duplicar un pago ya guardado. Si el almacenamiento está bloqueado, el
  formulario no envía el cobro. No hay escritura offline ni éxito simulado.
- Los endpoints de CRM/carnet responden private/no-store. Sin migración se muestra
  error explícito; no hay fallback a datos ficticios en producción.

## Instalar desde el celular (sin merge obligatorio)

1. Tener Fase 1 y el fix de lectura propia 00012 ya instalados. Hacer backup.
2. Preferir una base de pruebas antes de producción: FASE2.sql modifica el esquema
   compartido y agrega fichas para perfiles member, aunque el frontend sea Preview.
3. Abrir `supabase/FASE2.sql`, copiar TODO en SQL Editor y ejecutarlo una vez.
   Es transaccional e idempotente. No usar SETUP/ACTUALIZAR completos para este paso.
4. Opcional: ejecutar `supabase/migrations/00021_clients_seed.sql`. Son 6 fichas
   FICTICIAS, marcadas como Ejemplo/is_demo, con distintas etiquetas/frecuencias.
   No crea cuentas, teléfonos falsos ni transacciones. No se carga automáticamente.
5. Abrir Preview del PR con Supabase configurado, iniciar sesión como admin.
6. Panel → Clientes y recepción (también desde Caja y menú). Si aparece modo demo,
   las acciones están deshabilitadas: eso no valida el flujo real.
7. No mergear hasta autorizarlo y revisar los checks y el siguiente recorrido.

### Recorrido de aceptación

1. Buscar un cliente por nombre/número. Crear otro de prueba sólo con nombre.
2. Repetir alta: comprobar aviso de coincidencia; sólo confirmar duplicado si es
   otra persona. Homónimos reales están permitidos con revisión explícita.
3. Como admin cambiar etiqueta; como staff comprobar que no puede cambiarla.
4. Confirmar entrada manual. Repetir: debe avisar sin duplicar.
5. Imprimir/guardar carnet y escanear desde otro dispositivo. La ficha debe abrir
   sin registrar entrada ni cobro. Confirmar nombre y luego entrada.
6. Denegar cámara: probar la búsqueda manual. Retirar permiso o salir de pantalla:
   la cámara debe apagarse. Probar en el teléfono real de caja, no sólo escritorio.
7. Reemplazar carnet: el QR antiguo debe fallar y el nuevo funcionar.
8. Con cuenta de pruebas y autorización, registrar un cobro controlado. Verlo en
   historial y Caja. No hacer cobros ficticios en producción para “probar”.
9. Importar CSV de pruebas sin email y repetirlo: no debe crear login ni duplicar.
10. Con una cuenta cliente: directorio/API rechazados, carnet propio disponible.
11. Confirmar que precios y etiqueta siguen iguales al registrar visitas.

Para quitar sólo el seed CRM, sin tocar clientes reales:

```sql
-- Antes: revisar exactamente qué se va a borrar.
select id, full_name from public.gym_clients where is_demo;
-- Sólo tras confirmar; borra carnet/visitas/eventos por cascada.
-- Si tiene transacciones, la FK impide borrarlo para conservar contabilidad.
delete from public.gym_clients where is_demo;
```

El reset anterior de Herramientas es de Fase 1; NO elimina estos ejemplos CRM.
No borrar pagos reales ni usar el reset para revertir cobros.

## Pruebas

```sh
npm ci
npm run typecheck
npm run lint
npm run build
npm run test:auth
npm run test:sql
node scripts/build-sql.mjs --check
```

La suite SQL usa PostgreSQL/PGlite, roles y RLS reales. La suite de auth incluye
API con fronteras simuladas, validación y generación/decodificación real del QR
con ZXing. Se hizo además una prueba de componente en Chromium a 390×844 con APIs
simuladas: alta sin contacto, entrada duplicada, identificación QR, reintento de
cobro tras recarga y permiso de cámara denegado. No equivale a probar Supabase
real ni una cámara física: esas comprobaciones siguen en el recorrido de aceptación.

Marketing/envío de promociones, fusión de cuentas posteriores, membresías con
vencimiento, lector de torniquete, autoservicio y sincronización offline NO están
incluidos en esta entrega. Las etiquetas y métricas preparan esa evolución.
