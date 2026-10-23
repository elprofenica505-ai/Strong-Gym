# Mapa de pendientes: dónde está cada cosa

Creado el 23 de octubre de 2026 para reunir en un solo lugar lo que quedó a medias. Revisa primero esta página; después abre el documento que indica cada punto.

## 1. Fuentes de verdad, por tema

| Tema | Dónde está | Estado de la fuente |
|---|---|---|
| Ruta general y etapas 1 a 6 | `docs/PENDIENTES-ACTUALES.md` | **La más completa.** Última sección con fecha: 19 oct. |
| Lista corta para el dueño | `docs/LISTA-PENDIENTES-DUENO.md` | **Desactualizada** (20 oct). Dice que la calculadora, el plan y las rutinas por objetivo «no existen»; ya se hicieron en los PR #21 a #23. No usar sin revisar. |
| Inventario por código de función (B01, ACC05, CRM08, FIN04…) | `docs/INVENTARIO-FUNCIONAL.md` | Útil para estado de cada función. Revisar contra PR fusionados. |
| Seguridad: decisiones y pendientes de información | `docs/DECISIONES-SEGURIDAD.md` | Vigente. Tiene la sección «Pendientes de información». |
| Seguridad: detalle de cada etapa | `docs/SEGURIDAD-ACCESOS.md`, `docs/DEMO-PRODUCCION.md`, `docs/AUTH-RECUPERACION.md`, `docs/MFA-PERSONAL.md` | Cada uno describe su etapa y lo que falta. |
| Correo y recuperación de contraseña | `docs/REVISION-CORREO-AUTH.md`, `docs/AUTH-RECUPERACION.md` | Pendiente: remitente, dominio, SMTP y prueba real. |
| Roles de caja y entrenador | `docs/ROLES-CAJA-ENTRENADOR.md`, `docs/ROLES-MIGRACION-PLAN.md` | Fase C pendiente. |
| Finanzas: cobros, gastos, deudas, vuelto | `docs/COBROS-GASTOS.md`, `docs/DEUDAS-ABONOS.md`, `docs/VUELTO-ABONOS.md`, `docs/SALDO-CLIENTE.md` | Ver secciones «pendiente» de cada uno. |
| Clientes (CRM), recepción y QR | `docs/FASE2-CLIENTES.md` | Varios puntos sin validación remota. |
| Calculadora, categorías y fases A a E | `docs/ANALISIS-CALCULADORA-Y-CATEGORIAS.md` | Propuesta. Cada fase requiere aprobación. |
| Medidas, metas y rutinas | `docs/MEDIDAS-PROGRESO.md` | Ver estado en PENDIENTES-ACTUALES. |
| Lint (10 advertencias) | `docs/TAREA-LINT-REACT-HOOKS.md` | Tarea documentada, sin empezar. |
| Incidentes y respaldo | `docs/GUIA-INCIDENTES.md` | **Borrador:** faltan datos entre corchetes. |
| Reservas y conciliación | `docs/RESERVAS-CONCILIACION.md`, `docs/REPARACION-RESERVAS-MOVIL.md` | Revisar en navegador. |
| Lecturas y validación financiera | `docs/B1-LECTURAS.md`, `docs/VALIDACION-FINANCIERA-2026-10-17.md`, `docs/VALIDACION-INVENTARIO.md` | Registros de validación. |

## 2. SQL: lo que está en el repositorio y lo que no

- `supabase/migrations/`: migraciones versionadas. Llegan hasta la **00030**.
- `docs/SQL-PENDIENTE/`: migraciones **00032 a 00049**, todavía fuera de `supabase/migrations/`.
- `supabase/*.sql` (SETUP, ACTUALIZAR, FASE2, etc.): archivos antiguos para pegar a mano. No son la fuente de verdad.

Estado en Supabase (verificado en esta sesión o en documentos):
- **Aplicadas:** 00034 a 00048 según el historial de Supabase; **00049** aplicada sin aparecer en el historial.
- **00031 y 00032:** documentos de PENDIENTES-ACTUALES dicen que están aplicadas. No aparecen en el historial de Supabase; confirmar.
- **00033:** no aparece en el historial; confirmar con `list_migrations` o la consulta de la base.
- **Pendiente:** ninguna migración nueva está lista para aplicar. La 00050 no se creó.

## 3. Ramas de Git

Verificado con el historial completo del repositorio:
- **Todos los PR del #1 al #27** están fusionados en `main`.
- Casi todas las ramas `arena/*` ya están contenidas en `main`. No se perdió trabajo en ellas.
- **Sin fusionar:**
  - `arena/10c75b47-strong-gym` (esta sesión): 2 commits (tarea de lint y cambio del selector de idioma). Sin PR.
  - `arena/85c54d7d-strong-gym`: 1 commit (`cd3464e`), documentación preparada de la 00031 (MFA obligatorio para personal). Decidir si se integra o se descarta.

## 4. Pendientes reales por área (resumen)

Para el detalle, usa la fuente indicada en la sección 1.

**Seguridad y legal**
- Sin abrir: CSP (activar en modo informativo), verificador anti-bots (requiere cuenta externa), llave de acceso (cuando Supabase la saque de versión experimental).
- Sin empezar: revisión de Storage, CSRF y cabeceras completa; revisión del bundle final.
- Requiere abogado: política de privacidad, términos, consentimiento de datos de salud, descargo de ejercicio, flujo de menores con tutor.
- Dependencias: 0 vulnerabilidades en producción. Quedan 5 altas de desarrollo (`braces`), sin parche publicado.

**Correo**
- Remitente, dominio y SMTP propios: esperan datos del dueño.
- Prueba de recuperación con correo real: depende del punto anterior.

**Navegación y roles**
- Rediseño por etapas (Inicio, Clientes, Agenda, Finanzas, Personal, Reportes, Configuración): sin empezar.
- Roles de caja y entrenador, fase C: sin empezar. Vista «Mis clientes» pendiente de prueba con cuenta real de entrenador.

**Operación diaria**
- Planes y vigencias, reservas y cupos, mensajes leídos y disciplinas, QR en dispositivo real, hora de Managua en páginas abiertas, asistencia en Mi cuenta, categoría del cliente: pendientes.

**Finanzas**
- Personal: alta, edición, desactivación y auditoría. Falta la prueba con cuenta real.
- Recibido y vuelto en todos los cobros (hoy solo en abonos).
- Conciliación y cierres por cuenta, transferencias, reversiones.
- Importación de Excel validada. Comprobantes PDF para celular. Verificación de deudas en USD.

**Calidad**
- Lint: 10 advertencias (`docs/TAREA-LINT-REACT-HOOKS.md`).
- Revisión visual en navegador de las páginas nuevas: pendiente (el entorno no tiene navegador).
- Pruebas de extremo a extremo, concurrencia y recorrido completo con datos ficticios: sin empezar.
- Retirar código de demo (`src/lib/data/demo-*`): pendiente.
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
