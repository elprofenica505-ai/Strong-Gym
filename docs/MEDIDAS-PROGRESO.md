# Medidas y progreso por cliente

Estado: **diseño APROBADO por el dueño (20 oct 2026)**. Construido en código y pruebas; SQL 00039 APLICADA en Supabase (20 oct 2026, con autorización expresa del dueño).
Parte de la etapa B (operación diaria), según decisión del dueño del 19 oct 2026.
Calorías, macros y plan alimenticio quedan para una fase posterior, con fuentes
públicas y verificables (sección 6).

## Resumen para el dueño (en simple)

- Cada cliente tiene un **historial de medidas**: peso, altura y 8 circunferencias
  del cuerpo. Una medida que no se tomó queda **vacía**, nunca en cero ni copiada
  de la vez anterior.
- El **IMC** se calcula solo con peso y altura, y se clasifica con la tabla de la
  OMS. No se escribe a mano.
- Las medidas **no se editan ni se borran**. Si hubo un error, se registra una
  medición nueva. Así siempre queda el historial real.
- Cada cliente tiene **una meta activa**: pérdida, ganancia, mantenimiento u otra.
  El plazo máximo es **12 meses** y se revisa **cada 3 meses**. Si cambias la
  meta, la anterior queda marcada como cancelada, no desaparece.
- Cada cliente tiene **una rutina activa**. Al cambiarla, la anterior se cierra y
  queda guardada.
- Si un número se sale del rango normal (por ejemplo, 12 cm de cintura), el
  sistema **pide confirmar**. Si es cero o negativo, lo **rechaza**.

## 1. Qué se registra

Por cliente, con fecha (día de Managua):

- **Peso** (kg), obligatorio. **Altura** (cm), opcional; sirve para el IMC.
- **Ocho circunferencias** (cm), todas opcionales, según el protocolo ISAK:
  cintura, pecho, bíceps relajado, bíceps contraído, antebrazo, glúteo, muslo y pantorrilla.
- Notas de la medición (hasta 300 letras).

Fuentes de las medidas:
- ISAK (protocolo internacional de medición antropométrica). Ejemplo de sitios
  medidos en un protocolo ISAK: https://pmc.ncbi.nlm.nih.gov/articles/PMC10975034/
  (brazo relajado y contraído, cintura, glúteo, muslo, pantorrilla).
- Hoja de referencia ISAK nivel 1 con cintura mínima, glúteo máximo y antebrazo máximo:
  https://theiopn.com/wp-content/uploads/2014/09/Example-ISAK-Assessment-Report.pdf

Reglas de datos:
- **Vacío** = no tomada. **Cero o negativo** = error, se rechaza.
- Límites duros (rechazan): peso hasta 500 kg, altura hasta 250 cm, circunferencias hasta 300 cm.
- Rangos de **aviso** (piden confirmar, no rechazan): peso 30 a 250 kg, altura 120 a 230 cm,
  circunferencias 15 a 200 cm. **Son provisionales**: detectan errores de digitación,
  no son normas clínicas. El dueño debe confirmarlos.

## 2. Meta y seguimiento

Por cliente, **una meta activa**:

- Tipo: pérdida de peso, ganancia de peso o masa, mantenimiento, u otra (se describe con texto).
- Fecha de inicio y fecha límite. **Máximo 12 meses**.
- Peso objetivo (obligatorio salvo en "otra").
- Revisiones: cada 3 meses desde el inicio (a los 3, 6, 9 y 12 meses).

Cómo se mide el avance:
- **Pérdida:** porcentaje = lo bajado / lo que había que bajar. Tope 100 %.
- **Ganancia:** igual, al revés.
- **Mantenimiento:** "en rango" si el peso está a menos de 2 kg del objetivo
  (tolerancia provisional).
- **Otra:** se revisa a mano, no se calcula porcentaje.
- Si falta el peso inicial o el actual, se muestra **"sin datos"**, nunca un porcentaje inventado.

Fuente del IMC y de la clasificación (usada para mostrar peso sano por altura):
- OMS, obesidad y sobrepeso: https://www.who.int/news-room/fact-sheets/detail/obesity-and-overweight
  (IMC ≥ 25 sobrepeso, ≥ 30 obesidad).
- OMS / referencia de categorías, bajo peso < 18.5, normal 18.5 a 24.9:
  https://apps.who.int/nutrition/landscape/help.aspx?menu=0&helpid=420

## 3. Rutina asignada

- Nombre, días de la semana, ejercicios con series, repeticiones y descanso.
- Una rutina activa por cliente. Cambiarla cierra la anterior con fecha de fin.
- Quién la asignó y cuándo.

## 4. Quién ve y registra

| Rol | Registra medidas | Ve medidas | Metas y rutinas |
|---|---|---|---|
| Administrador | Sí | Todos | Todas: crea y cambia |
| Caja | Sí | Todos | Sólo lectura |
| Entrenador | Sí, sólo clientes con acceso aprobado | Sólo esos clientes | Crea y cambia sólo esos clientes |
| Cliente | No | No (pendiente, sección 7) | No |
| Personal | No es cliente; no aparece en listas de clientes | — | — |

Todas las lecturas y escrituras requieren sesión segura (MFA, aal2) para el personal,
y la base lo revisa. Caja no cambia metas ni rutinas por separación de funciones.

## 5. Modelo de datos (SQL 00039, aplicada)

Archivo: `docs/SQL-PENDIENTE/00039_medidas_metas_rutinas.sql`.

- `body_measurements`: una fila por medición; ocho circunferencias como columnas
  opcionales; bloqueo de UPDATE y DELETE; no admite fechas futuras.
- `client_goals`: tipo, plazo máximo de 12 meses, peso objetivo, una activa por cliente.
- `client_routines`: nombre, días, ejercicios (lista JSON), una activa por cliente.
- Funciones de escritura: `record_body_measurement`, `set_client_goal`, `set_client_routine`.
- Pruebas: `npm run test:medidas` (13 de reglas de negocio y 43 de base de datos por rol,
  sobre la cadena de migraciones hasta 00036). Todas pasan.

## 6. Calorías, macros y plan alimenticio (fase posterior)

- Cálculo del requerimiento con fórmulas publicadas (Mifflin-St Jeor para gasto basal,
  con factor de actividad). Se muestra la fuente y se aclara que es una estimación.
- Alimentos con calorías y macros por porción de una base pública (por ejemplo USDA
  FoodData Central). Los alimentos sin fuente verificable **no se muestran** o se marcan
  "sin dato", nunca cero.
- El prototipo del dueño tiene cifras de alimentos marcadas como "aproximadas";
  no se portan tal cual hasta verificarlas.
- Ninguna afirmación de "certificado" sin una certificación real y verificable.

## 7. Pendientes

1. **Pantallas**: registro, historial y metas en caja, administrador y entrenador
   (se construyen después de aplicar 00039, para probar con datos reales).
2. **Cliente ve su progreso**: pendiente de decisión. Hoy no tiene acceso.
3. **Confirmar rangos de aviso** (sección 1) y la tolerancia de mantenimiento (2 kg).
4. **Permisos por entrenador** (medir, meta, rutina, plan por separado, como en el
   prototipo): hoy el modelo es por rol; si el dueño quiere permisos finos, es una
   decisión aparte.

## 7b. Pantallas construidas

- `/panel/progreso`: lista de clientes para el entrenador (sólo los asignados y aprobados).
  Administración y caja abren la ficha desde Clientes ("Progreso y medidas").
- `/panel/progreso/[id]`: IMC y peso sano para su altura, avance de la meta, historial de
  mediciones (un guion = no tomada), meta activa y rutina activa.
- Formularios: medición (caja, administrador y entrenador asignado), meta y rutina
  (administrador y entrenador asignado). Un valor fuera de rango pide confirmación explícita.
- `POST /api/progress`: valida otra vez en el servidor y llama a las funciones de la 00039.
- Pruebas nuevas: 22 de formularios y reglas (`tests/progress-forms.test.mjs`, `tests/progress-rules.test.mjs`).

## 8. Entrega propuesta

1. Diseño aprobado por el dueño (hecho).
2. Pantallas de registro, historial y metas (con datos reales de prueba, marcados como tales).
3. Pruebas de regresión y recorrido en navegador.
4. Verificación con el dueño antes de cualquier dato real.
