# Mapa de pendientes: dónde está cada cosa

Creado el 23 de octubre de 2026 para reunir en un solo lugar lo que quedó a medias. Revisa primero esta página; después abre el documento que indica cada punto.

## 1. Fuentes de verdad, por tema

| Tema | Dónde está | Estado de la fuente |
|---|---|---|
| Ruta general y etapas 1 a 6 | `docs/PENDIENTES-ACTUALES.md` | **La más completa.** Última sección con fecha: 24 oct (foto actual al final). |
| Lista corta para el dueño | `docs/LISTA-PENDIENTES-DUENO.md` | **Retirada** el 23 oct. Apunta a las dos fuentes vigentes. |
| Inventario por código de función (B01, ACC05, CRM08, FIN04…) | `docs/INVENTARIO-FUNCIONAL.md` | Útil para estado de cada función. Revisar contra PR fusionados. |
| Seguridad: decisiones y pendientes de información | `docs/DECISIONES-SEGURIDAD.md` | Vigente. Tiene la sección «Pendientes de información». |
| Seguridad: detalle de cada etapa | `docs/SEGURIDAD-ACCESOS.md`, `docs/DEMO-PRODUCCION.md`, `docs/AUTH-RECUPERACION.md`, `docs/MFA-PERSONAL.md` | Cada uno describe su etapa y lo que falta. |
| Correo y recuperación de contraseña | `docs/REVISION-CORREO-AUTH.md`, `docs/AUTH-RECUPERACION.md` | Pendiente: remitente, dominio, SMTP y prueba real. |
| Roles de caja y entrenador | `docs/ROLES-CAJA-ENTRENADOR.md`, `docs/ROLES-MIGRACION-PLAN.md` | Fase C pendiente. |
| Finanzas: cobros, gastos, deudas, vuelto | `docs/COBROS-GASTOS.md`, `docs/DEUDAS-ABONOS.md`, `docs/VUELTO-ABONOS.md`, `docs/SALDO-CLIENTE.md` | Ver secciones «pendiente» de cada uno. |
| Clientes (CRM), recepción y QR | `docs/FASE2-CLIENTES.md` | Varios puntos sin validación remota. |
| Calculadora, categorías y fases A a E | `docs/ANALISIS-CALCULADORA-Y-CATEGORIAS.md` | Propuesta. Cada fase requiere aprobación. |
| Medidas, metas y rutinas | `docs/MEDIDAS-PROGRESO.md` | Ver estado en PENDIENTES-ACTUALES. |
| Lint y React Hooks | `docs/TAREA-LINT-REACT-HOOKS.md` | **Resuelto el 23 oct:** 0 avisos; la regla `set-state-in-effect` quedó como error. |
| Apariencia de demo y entrega | `docs/PENDIENTE-DEMO-Y-ENTREGA.md` | **Pendiente por decisión del dueño (23 oct).** Sin tocar código ni datos. |
| Incidentes y respaldo | `docs/GUIA-INCIDENTES.md` | **Borrador:** faltan datos entre corchetes. |
| Reservas y conciliación | `docs/RESERVAS-CONCILIACION.md`, `docs/REPARACION-RESERVAS-MOVIL.md` | Revisar en navegador. |
| Lecturas y validación financiera | `docs/B1-LECTURAS.md`, `docs/VALIDACION-FINANCIERA-2026-10-17.md`, `docs/VALIDACION-INVENTARIO.md` | Registros de validación. |

## 2. SQL: fuente única

- `supabase/migrations/`: **única fuente de migraciones**, de la **00001** a la **00055**. Las 00031 a 00049 estaban antes en `docs/SQL-PENDIENTE/` y se movieron aquí el 23 de octubre, sin cambiar su contenido.
- `supabase/*.sql` (SETUP, ACTUALIZAR, FASE2, etc.): archivos antiguos para pegar a mano. No son la fuente de verdad.

Estado en Supabase (verificado en solo lectura el 24 de octubre):
- **Aplicadas y comprobadas en la base:** 00031 y 00032 (`is_staff` exige aal2), 00033 y 00034 (`is_admin`, `admin_set_role`, `role_changes`), 00035 (`trainer_client_access`), 00036, de la 00037 a la 00048 según el historial de Supabase, y **00049** (tabla de personal, funciones de baja y reactivación). Después: 00050 y 00051 (vista pública de entrenadores), 00052 (altura en ficha), 00053 (corrección de altura solo admin), 00054 (`ficha_height_cm` en `my_progress`) y 00055 (menores bloqueados en guardar/aprobar por el personal); la última del historial remoto es `menores_rutas_personal` (00055, versión remota `20261024190943`).
- **Pendiente:** ninguna migración está lista para aplicar; el siguiente número libre es 00056.
- **Advertencia:** la 00049 aparece aplicada, pero no en el historial de migraciones de Supabase. Se registró a mano. No vuelvas a ejecutarla.

## 3. Ramas de Git

Verificado con el historial completo del repositorio:
- **Todos los PR del #1 al #40** están fusionados en `main` (`1e493a9`); sin PR abiertos al 24 oct antes de esta actualización.
- Casi todas las ramas `arena/*` ya están contenidas en `main`. No se perdió trabajo en ellas.
- La rama `arena/85c54d7d-strong-gym` se integró en esta rama (solo el archivo de la 00031). Su resto ya está en `main`.

## 4. Pendientes reales por área (resumen)

Para el detalle, usa la fuente indicada en la sección 1.

**Seguridad y legal**
- Sin abrir: CSP (activar en modo informativo), verificador anti-bots (requiere cuenta externa), llave de acceso (cuando Supabase la saque de versión experimental).
- Sin empezar: revisión de Storage, CSRF y cabeceras completa; revisión del bundle final.
- Requiere abogado: política de privacidad, términos, consentimiento de datos de salud, descargo de ejercicio, flujo de menores con tutor.
- Dependencias: 0 vulnerabilidades en producción. `braces` (herramienta de desarrollo) quedó corregido con el parche `patches/braces+3.0.3.patch`: rechaza los patrones con llaves muy anidadas que desbordaban la pila. `npm audit` puede seguir nombrando el aviso porque la versión publicada no cambió. Detalle en `docs/DECISIONES-SEGURIDAD.md`.

**Correo**
- Remitente, dominio y SMTP propios: esperan datos del dueño.
- Prueba de recuperación con correo real: depende del punto anterior.

**Navegación y roles**
- Rediseño por etapas (Inicio, Clientes, Agenda, Finanzas, Personal, Reportes, Configuración): sin empezar.
- Roles de caja y entrenador, fase C: sin empezar. Vista «Mis clientes» probada con cuenta real de entrenador el 23 oct 2026 (rol, MFA, asignación, pedido, aprobación, revocación y reasignación OK). Decisión: un cliente puede tener dos o más entrenadores (ver `docs/ROLES-MIGRACION-PLAN.md`).

**Operación diaria**
- Planes y vigencias, reservas y cupos, mensajes leídos y disciplinas, QR en dispositivo real, hora de Managua en páginas abiertas, asistencia en Mi cuenta, categoría del cliente: pendientes.

**Finanzas**
- Personal: alta, edición, desactivación y auditoría. Falta la prueba con cuenta real.
- Recibido y vuelto en todos los cobros (hoy solo en abonos).
- Conciliación y cierres por cuenta, transferencias, reversiones.
- Importación de Excel validada. Comprobantes PDF para celular. Verificación de deudas en USD.

**Calidad**
- Revisión visual en navegador de las páginas reescritas por el lint: hecha el 23 oct (demo local con Chromium). Sin probar todavía, por falta de sesión real: calculadora y resumen del socio en Mi cuenta.
- Pruebas de extremo a extremo, concurrencia y recorrido completo con datos ficticios: sin empezar.
- Apariencia de demo y limpieza para la entrega: plan en tres fases en `docs/PENDIENTE-DEMO-Y-ENTREGA.md`. No ejecutar hasta que el dueño lo pida.
- Registro de errores y alertas: pendiente.

**Decisiones y datos del dueño**
- Datos del gimnasio (nombre legal, dirección, si hay menores).
- Plan Pro de Supabase para sesiones con tiempo límite.
- Cuenta de prueba: la crea el dueño. Con ella se prueba la baja, el bloqueo y la reactivación de personal.
- Segundo administrador (dueño): requiere correo y autorización escrita.
- Qué hacer con metas y rutinas asignadas a mano; cómo recalcular clientes anteriores.

**Entrega (no ejecutar todavía)**
- Limpieza de datos ficticios (solo con autorización), carga de datos reales, conciliación de saldos, acceso del dueño antes de retirar el administrador temporal, demostración y manual.

## 5. Cómo mantener este mapa

1. Cuando se cierre un pendiente, márcalo en la fuente de la sección 1, no aquí.
2. Cuando se fusione una rama, verifica su estado con `git merge-base --is-ancestor <rama> origin/main` después de `git fetch --unshallow`.
3. Si un documento queda desactualizado, márcalo con su fecha y el PR que lo cambió.
