# Especificación: categorías de cliente, productos y stock, asistencia

Fecha: 2026-10-21. Fuente: instrucciones del dueño. Estado: **especificación. Nada programado.**
Los puntos marcados con ⚠ necesitan confirmación antes de programar.

## 1. Categorías de cliente (de menor a mayor)
Se calculan automáticamente cada día (zona America/Managua). El administrador puede fijar una categoría manual con motivo escrito.

| Categoría | Regla del dueño | Regla propuesta para programar |
|---|---|---|
| **Cliente Común** | Primera visita o casi no viene; no es activo. | Menos de 3 visitas en los últimos 30 días y sin membresía. ⚠ confirmar el número. |
| **Cliente Amigo** | Viene 3 o más veces al mes sin membresía mensual; o paga semanal y viene 3 o más veces por semana pero paga diario sin compromiso. | Sin membresía activa y 3 o más visitas en 30 días. ⚠ ver conflicto A. |
| **Cliente Familia** | Paga membresía semanal (un pago por semana) o mensual (un pago al mes). | Membresía semanal o mensual activa, sin compra de suplemento que cumpla la regla de Strong Gym. |
| **Cliente Strong Gym** | Paga membresía mensual y compró al menos 1 suplemento en 3 meses. Si pasan 3 meses sin comprar ningún producto, pasa a Familia. | Membresía mensual activa y al menos una compra de producto en los últimos 90 días. |

Orden de prioridad (gana la más alta): **Strong Gym > Familia > Amigo > Común**.

**Conflicto A ⚠:** el pago semanal aparece en Amigo (cuando viene 3 o más veces por semana pagando diario) y en Familia (membresía semanal). Propuesta: cliente con membresía semanal activa = Familia, sin importar cuántas veces venga; "paga diario" = sin membresía.

**Conflicto B ⚠:** la regla de Amigo dice "3 a más veces al mes" y luego "3 a más veces por semana". Propuesta: usar 3 o más visitas en los últimos 30 días para Amigo, y tratar "por semana" como un caso de la misma regla.

**Conflicto C ⚠:** "casi no viene" y "no es activo" no tienen número. Propuesta: Común = menos de 3 visitas en 30 días.

## 2. Aviso obligatorio en la herramienta de dieta y rutina
Texto propuesto (aprobación del dueño pendiente):
> **Aviso importante:** las dietas y rutinas que ves aquí son propuestas generales generadas por una herramienta. **No están certificadas por un nutricionista ni por un entrenador profesional.** Para un plan más preciso y seguro, busca el apoyo de un nutricionista profesional y de un entrenador capacitado.

Debe mostrarse de forma visible en la calculadora, en el plan alimenticio y en la rutina, para el cliente y para el personal.

## 3. Módulo de productos (caja y administración)
Editable: se puede cambiar de productos y precios cuando el dueño lo decida. Los productos y precios reales se definen al final, con aprobación del dueño.

Campos de cada producto:
- Nombre del producto.
- Categoría y subcategoría, seleccionables y editables (por ejemplo: suplementos → proteína; ropa → camisa). Dentro de cada subcategoría, atributos como tamaño, peso (gramos, libras, kilogramos), color, talla, etc.
- Estado (activo/inactivo).
- Precio de compra.
- Precio de venta.
- **Ganancia automática** = precio de venta − precio de compra (ejemplo: compra 20, venta 35 → ganancia 15).
- Imagen desde la galería o la cámara del dispositivo. Se comprime automáticamente antes de guardar, para que no pase de **600 KB**.
- Botón "Crear nuevo producto".

## 4. Stock (módulo nuevo, conectado a productos y finanzas)
- Entradas (compra de inventario), salidas (venta), ajustes (conteo físico) por producto y por variante (talla, color, peso).
- Alerta de stock bajo (nivel mínimo editable).
- **Finanzas:** cada venta suma en Finanzas (caja). Cada compra de inventario se registra como gasto. ⚠ confirmar si la compra se registra como gasto al momento de comprar o como costo cuando se vende.

## 5. Asistencia por cliente (tabla desplegable)
- Por día, por semana y por mes, para cada cliente, tenga o no plan.
- Visible para administración y caja (todos los clientes), entrenador (solo sus clientes asignados) y el cliente (solo las suyas).
- Fuente: registros existentes de visitas (una por cliente y día). Sin cambios en la base para la lectura básica.

## 6. Orden propuesto de construcción
1. Asistencia por cliente (día, semana, mes) — no depende de las reglas ⚠.
2. Módulo de productos con imagen comprimida.
3. Stock conectado a productos.
4. Conexión de ventas y compras con Finanzas.
5. Categoría automática (cuando confirmes las reglas ⚠).
6. Aviso de nutrición y ficha de progreso con calculadora, plan y rutina (incluye interruptor del administrador).

Cada paso necesita: prueba, guía en español y autorización si toca la base de datos.
