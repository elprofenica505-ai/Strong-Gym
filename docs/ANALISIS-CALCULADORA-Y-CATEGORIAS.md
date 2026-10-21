# Análisis: calculadora Strong Fitness, categorías de cliente y ficha de progreso

Fecha: 2026-10-21. Archivo analizado: `calculadora-strong-fitness.html` (subido por el dueño).
Estado: **análisis y propuesta. Nada de esto está programado todavía.**

## 1. Respuesta corta
Sí se puede incorporar. No es un botón: son cuatro bloques de trabajo que dependen uno del otro:
1. Asistencia completa (por día, semana y mes, para cada cliente, tenga o no plan).
2. Categoría del cliente (Amigo, Familia, Strong Gym) calculada desde datos reales.
3. Ficha de progreso del cliente con calculadora, objetivo, plan alimenticio y rutina, editable por entrenador, caja y administración, con interruptor del administrador.
4. Seguridad: cada permiso aplicado en la base de datos, no sólo en pantalla.

Condiciones: (a) el dueño aprueba las reglas de categoría y las fórmulas; (b) un nutricionista revisa los planes alimenticios antes de entregarlos a clientes; (c) el catálogo de productos (creatina y otros) se crea antes de usar la regla de compras.

## 2. Lo que existe hoy en la base de datos
| Dato que se necesita | Existe | Observación |
|---|---|---|
| Visitas por día | Sí, `client_visits` | Un registro por cliente y día (zona horaria Managua). Base de la asistencia. |
| Reservas de clases | Sí, `bookings` | Sirve para la regla "reserva de clase". |
| Planes (membresía) | Sí, `plans` y `gym_clients.plan_id` | Hay que confirmar que un plan pagado activo es lo que usted llama membresía. |
| Compras de productos (creatina, etc.) | **No** | No hay catálogo de productos ni ventas de productos. Hay que crearlo. |
| Medidas, metas y rutinas | Sí (00039) | Ya en `main`. |
| Calculadora y plan alimenticio | **No** | Sólo existe el HTML de referencia. |

## 3. Reglas de categoría: lo que entendí y lo que necesito confirmar
Según su mensaje:
- **Cliente nuevo o que paga por día y llega poco:** Amigo.
- **Paga por día y llega 3 veces o más por semana:** usted escribió "Amigo" otra vez. ¿Debe ser una categoría distinta? Propongo una "Amigo frecuente" o confirmar que sigue siendo Amigo.
- **Plan pagado (membresía) activo:** Familia.
- **Membresía activa + usa el gimnasio + (reserva de clase o compra de producto):** Strong Gym.

Propuesta de orden de prioridad (la más alta gana): Strong Gym > Familia > Amigo. Un cliente se recalcula cada día, y el administrador puede fijar una categoría manual con motivo escrito.

## 4. La calculadora del archivo: qué hace y qué fuentes usa
Entradas: sexo, edad, peso, altura, nivel de actividad (4 niveles) y objetivo (5 objetivos). Opcional: cintura, cuello y cadera para estimar grasa corporal.

Cálculos:
- **IMC** con las categorías de la OMS (bajo peso <18.5; normal 18.5–24.9; sobrepeso 25–29.9; obesidad ≥30). Fuente ya usada en el proyecto.
- **Gasto basal:** ecuación de Mifflin-St Jeor. Es la más confiable entre las ecuaciones comparadas en una revisión sistemática que predijo el gasto en reposo dentro del 10 % en más personas que las demás [Journal of the American Dietetic Association](https://www.jandonline.org/article/S0002-8223(05)00149-5/abstract); publicada en [American Journal of Clinical Nutrition, 1990](https://tdeecalculator.org/mifflin-st-jeor-equation/).
- **Gasto total:** basal × factor de actividad (1.2 a 1.725).
- **Ajuste por objetivo:** bajar −20 %; definir −10 %; mantener 0 %; ganar masa +10 %; ganar peso +18 %.
- **Proteína:** 2.0 g/kg para bajar y definir; 1.8 para masa; 1.6 para peso y mantener. La posición de la ISSN (2017) dice que 1.4–2.0 g/kg/día basta para la mayoría de personas que hacen ejercicio, y que en déficit con fuerza pueden necesitarse 2.3–3.1 g/kg/día [ISSN Position Stand, Springer](https://link.springer.com/article/10.1186/s12970-017-0177-8); [PubMed](https://pubmed.ncbi.nlm.nih.gov/28642676/). Por eso 2.0 para bajar es un valor razonable, no el máximo.
- **Grasa corporal:** fórmula de la Marina de EE. UU. (medidas de cintura, cuello y cadera). Es una estimación, la propia calculadora lo dice.
- **Mínimos de calorías:** 1200 mujeres, 1500 hombres. Son valores de seguridad habituales; el nutricionista debe confirmarlos.

Rutinas: cada objetivo tiene su propia rutina semanal (cuerpo completo, torso/pierna, cardio, intervalos). "Ganar peso" usa cuerpo completo más una caminata opcional; "ganar masa" usa torso y pierna. Así se diferencian ya por objetivo.

Alimentos: 30 alimentos con valores "aproximados" de USDA. No están verificados contra la tabla oficial, no tienen alergias ni preferencias, y las porciones se redondean.

## 5. Problemas que veo en el archivo (sin excusas)
1. Los valores de alimentos son aproximados. Deben verificarse con la tabla oficial de USDA antes de entregarlos a un cliente.
2. No hay consideración de alergias, intolerancias, condiciones médicas ni embarazo. Eso lo debe revisar un profesional.
3. Las rutinas genéricas no se adaptan al nivel del cliente. Por eso usted pide que el entrenador las edite, y es correcto.
4. La calculadora no guarda nada: los resultados se pierden al cerrar la página. En el sistema, cada cálculo debe guardarse con fecha para ver la evolución.
5. Los textos de "Ejemplo" y los datos iniciales son de demostración y no deben salir en producción.

## 6. Cómo lo incorporaría (propuesta por fases)
- **Fase A — Asistencia (T1):** vista por día, semana y mes para cada cliente; reporte para administración, caja y entrenador; el cliente ve sus propias visitas.
- **Fase B — Categoría (T1b):** cálculo automático con las reglas que usted confirme; historial de cambios; cambio manual con motivo.
- **Fase C — Ficha de progreso del cliente:** calculadora integrada (guarda cada cálculo), objetivo, plan alimenticio y rutina generados desde las plantillas, todo editable por el entrenador asignado, caja y administración según permisos.
- **Fase D — Interruptor por cliente:** el administrador decide si entrenador y caja pueden usar esta herramienta para cada cliente. Se aplica en la base de datos (políticas de seguridad), no sólo en pantalla.
- **Fase E — Catálogo de productos:** para la regla de compras (creatina, etc.).

Cada fase llega con pruebas y con su guía en español. No empiezo una fase sin su aprobación.

## 7. Preguntas que necesito que responda
1. ¿Las reglas de categoría de la sección 3 son correctas? En especial, la diferencia entre "Amigo" y "Amigo frecuente".
2. ¿Está de acuerdo en que un nutricionista revise los planes antes de entregarlos?
3. ¿Qué productos se venden (creatina, proteína, otros) y a qué precio?
4. ¿Quiere que empiece por la Fase A (asistencia)?
