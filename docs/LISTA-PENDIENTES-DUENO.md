# Lista única de pendientes (dueño) — estado real

Estado: **Existe** = funciona en código y pruebas. **Parcial** = hay una parte, falta lo pedido. **No existe** = no está construido.
Última revisión: 2026-10-20. Nada de esta lista está en producción salvo lo marcado como "Existe" en `main`.

## Asistencia
| Pedido | Estado | Detalle |
|---|---|---|
| Registro de entrada (asistencia) del cliente | Parcial | Existe `client_visits` (un registro por día) y botón de entrada en la ficha, por QR o manual. |
| Módulo de asistencia en el panel del administrador | No existe | No hay lista, historial ni reporte por fecha. |
| Asistencia en caja | Parcial | Caja usa la misma ficha, pero no tiene vista de asistencia. |
| Asistencia en entrenador | Parcial | Tarjetas con asistencia reciente en "Mis clientes"; falta historial. |
| Asistencia del cliente en su cuenta | No existe | El cliente no ve sus entradas. |

## Progreso, medidas, rutinas y plan
| Pedido | Estado | Detalle |
|---|---|---|
| Medidas (peso, altura, 8 circunferencias) | Existe (en `main` tras PR #20) | Registro append-only, historial, IMC. |
| Metas (máx. 12 meses, revisión cada 3) | Existe (PR #20) | Una meta activa por cliente. |
| Rutina personalizada | Existe (PR #20) | Una rutina activa por cliente. |
| **Rutinas prediseñadas por objetivo** (ganar peso distinto de bajar peso) | No existe | Pedido desde el inicio. |
| **Plan alimenticio** | No existe | No está en esta fase. |
| **Calculadora automática** (calorías, macros) | No existe | Requiere fórmulas con fuente verificable antes de programar. |
| **Plan personalizado** para el cliente | No existe | |
| Cliente ve su progreso | Parcial (PR #21) | Sección "Mi progreso" de sólo lectura; función 00040 aplicada en Supabase. |
| Cliente ve su plan, rutina prediseñada y calculadora | No existe | |

## Finanzas y Excel
| Pedido | Estado | Detalle |
|---|---|---|
| Exportar a Excel maestro (`Strong-Gym-Maestro.xlsx`) | Existe, pero **manual** | El botón descarga un archivo nuevo; no se actualiza solo. |
| Excel maestro que se actualice solo al registrar un pago en caja | No existe | Requiere decidir el mecanismo (ver abajo). |
| Cierre del día, comparativo mensual, comisiones | Existe (PR #17, #18) | Pendiente de prueba en navegador. |

## Otros pendientes del dueño
- Rangos de aviso definitivos para medidas.
- Tolerancia ±2 kg en mantenimiento (provisional).
- (Hecho) 00040 aplicada en Supabase.
- Recuperación de contraseña abre en navegador (pendiente de prueba).
- Caja no ve cierre del día (00038 aplicada; pendiente de prueba).

## Tareas pendientes (en orden, sin empezar)
- [ ] T1. Asistencia completa: módulo de asistencia para admin, caja, entrenador y cliente (historial por fecha y reporte).
- [ ] T2. Rutinas prediseñadas por objetivo (ganar peso distinto de bajar peso).
- [ ] T3. Calculadora automática de calorías y macros (requiere fórmulas con fuente, explicadas al dueño antes de programar).
- [ ] T4. Plan alimenticio y plan personalizado para el cliente.
- [ ] T5. Excel maestro que se actualiza solo al registrar un pago en caja (mecanismo por decidir).
- [x] T6. Aplicar 00040 en Supabase (aplicada 2026-10-20 con autorización del dueño).
- [ ] T7. Pruebas en navegador de: cierre del día, recuperación de contraseña, reportes.

## Decisiones que necesita el dueño
1. Mecanismo del Excel que se actualiza solo: (a) Google Sheets conectado, (b) Excel en OneDrive, (c) manual (descarga, como ahora).
2. Orden de prioridad de T1 a T5 (propuesta: T1, T2, T3, T4, T5).
3. Calculadora (T3): ¿explicar primero las fórmulas con fuentes profesionales y no programar nutrición hasta aprobarlas?
