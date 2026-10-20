# Medidas y progreso por cliente (diseño, sin aplicar)

Estado: **borrador de diseño**. No hay SQL aplicado ni código escrito todavía.
Parte de la etapa B (operación diaria), según decisión del dueño del 19 oct 2026.
Calorías, macros y plan alimenticio quedan para una fase posterior, con fuentes
públicas y verificables (ver sección 6).

## 1. Qué se registra

Por cliente, con fecha (día de Managua):

- **Peso** (kg), **altura** (cm).
- **Circunferencias** (cm): cintura, cadera, pecho, bíceps, tríceps, antebrazo,
  muslo, glúteo, pantorrilla. Cada medida es opcional.
- **Índice de masa corporal**: se calcula de peso y altura (kg / m²), con la
  clasificación de la OMS. No se guarda como dato ingresado.
- Notas de la medición.

Regla de datos: una medida no tomada se guarda como **vacía**, nunca como cero.
Un cero real (por ejemplo, 0 kg) se rechaza por validación. Un reporte que muestre
"0.0 cm" donde no hay dato es un error, no un resultado.

## 2. Meta y seguimiento

Por cliente, una o más metas activas:

- Fecha de inicio.
- Tipo de meta (pérdida, ganancia, mantenimiento u otra, a confirmar con el dueño).
- Métrica objetivo (peso o una medida), valor objetivo y fecha objetivo.
- Progreso: diferencia entre la primera medición de la meta y la última, y
  porcentaje hacia el objetivo. Si faltan datos, se muestra "sin datos", no un
  porcentaje inventado.

## 3. Rutina asignada

- Nombre de la rutina, días de la semana, ejercicios con series y repeticiones.
- Quién la asignó (administrador o entrenador) y fecha de inicio y fin.
- Una rutina vigente por cliente a la vez; cambiarla cierra la anterior, no la borra.

## 4. Quién ve y registra

| Rol | Registra medidas | Ve medidas | Metas y rutinas |
|---|---|---|---|
| Administrador | Sí | Todos | Todas |
| Caja | Sí | Todos (sin permiso de cambiar metas) | Sólo lectura |
| Entrenador | Sí, sólo sus clientes asignados | Sólo sus clientes asignados | Sólo sus clientes; puede asignar rutina |
| Cliente | Por decidir | Por decidir (propias) | Por decidir (propias) |
| Personal | No es cliente; no aparece en listas de clientes | — | — |

Caja no cambia metas ni rutinas, por la separación de funciones del plan.
La visibilidad del cliente sobre su propio progreso queda pendiente de decisión.

## 5. Modelo de datos propuesto (no aplicado)

- `body_measurements`: id, client_id → gym_clients, measured_on (date Managua),
  weight_kg, height_cm, circumferences (jsonb con claves fijas), notes, recorded_by,
  created_at. Restricciones: valores positivos y dentro de rangos razonables; medidas
  opcionales; no se edita ni se borra la medición, se corrige con una nueva nota
  (historial).
- `client_goals`: id, client_id, goal_type, metric, target_value, starts_on,
  target_date, status (activa, cumplida, cancelada), created_by.
- `client_routines`: id, client_id, name, days, exercises (jsonb), starts_on,
  ends_on, assigned_by, status. Una activa por cliente (índice único parcial).

Seguridad: RLS por rol según la tabla anterior, usando las funciones de rol ya
existentes (`crm_is_staff`, `is_trainer` y la asignación `trainer_client_access`).
Pruebas SQL por rol antes de aplicar, como en 00033 a 00038.

## 6. Calorías, macros y plan alimenticio (fase posterior)

- Cálculo del requerimiento con fórmulas publicadas (por ejemplo Mifflin-St Jeor
  para gasto basal, con factor de actividad). Se muestra la fuente y se aclara que
  es una estimación, no un diagnóstico.
- Alimentos con calorías y macros por porción tomados de una base pública
  (por ejemplo USDA FoodData Central). Los alimentos locales se agregan sólo con
  fuente verificable; si no hay dato, se muestra "sin dato", nunca cero.
- Ninguna afirmación de "certificado" sin una certificación real y verificable.

## 7. Pendientes de decisión

1. Lista exacta de circunferencias que el dueño quiere (¿agregar antebrazo o pantorrilla?).
2. Tipos de meta permitidos.
3. ¿El cliente ve su propio progreso en Mi cuenta?
4. Rangos válidos para cada medida (para rechazar errores de digitación).
5. Plazo de metas: ¿una meta puede durar más de un año?

## 8. Entrega propuesta

1. Aprobación de este documento por el dueño.
2. Migración 00039 en borrador, con pruebas SQL por rol (sin aplicar).
3. Pantallas de registro, historial y metas en caja, administrador y entrenador.
4. Pruebas de regresión y recorrido con datos ficticios marcados.
5. Autorización expresa para aplicar la 00039 en Supabase.
