# Tarea: 10 advertencias de lint `react-hooks/set-state-in-effect`

**Estado:** pendiente, prioridad baja (calidad de código).
**Qué son:** avisos del revisor ESLint (`eslint-plugin-react-hooks`). No son errores: `npm run lint` termina con 0 errores, el build y las pruebas pasan.
**Qué indican:** la pantalla actualiza estado React justo al montarse o cuando cambia una propiedad, dentro de un efecto. Puede causar renders de más o parpadeos. No hay un fallo confirmado.
**Origen:** código de las pantallas ya existente antes de la rama de esta tarea. No depende de datos ni de usuarios.

**Qué NO afecta:** la base de datos. Ninguna de estas líneas lee o escribe datos de forma distinta por sí misma. Los datos ficticios de prueba no se tocan.

**Qué SÍ podría afectar:** la lógica de carga de la pantalla (cuándo se piden los datos y cómo se muestran). Por eso cada cambio se prueba en navegador antes de seguir.

## Inventario (verificado con `npx eslint .`)

| # | Archivo | Línea | Qué hace el efecto | Riesgo al cambiar | Tratamiento sugerido |
|---|---|---|---|---|---|
| 1 | `src/components/providers/app-provider.tsx` | 194 | Copia `initialUser` al estado cuando cambia la prop | Alto (sesión y usuario) | Derivar el usuario desde la prop o usar `key` en el proveedor |
| 2 | `src/components/providers/app-provider.tsx` | 260 | Carga reservas al cambiar de usuario | Alto (reservas) | Mover la carga a un manejador o a un hook dedicado; probar reservar y cancelar |
| 3 | `src/components/schedule/schedule-board.tsx` | 146 | Carga la semana al montar o cambiar de semana | Alto (horarios) | Pasar a un hook de datos con estado inicial; probar cambiar de semana |
| 4 | `src/components/products/product-manager.tsx` | 83 | Carga productos al montar | Medio (inventario) | Mismo patrón que 3; probar alta, edición y venta |
| 5 | `src/components/nutrition/nutrition-calculator.tsx` | 129 | Carga al cambiar la búsqueda | Medio (calculadora) | Mover a manejador de búsqueda; probar búsqueda y guardado |
| 6 | `src/components/account/account-dashboard.tsx` | 451 | Limpia sesiones cuando no hay reservas activas | Medio (Mi cuenta) | Limpiar el estado en el manejador que cambia las reservas |
| 7 | `src/components/account/member-summary.tsx` | 166 | Limpia sesiones cuando no hay reservas confirmadas | Medio (resumen de socio) | Igual que 6 |
| 8 | `src/components/layout/side-nav.tsx` | 50 | Cierra el menú y reinicia la sección al cambiar de ruta | Bajo (navegación) | Reiniciar desde el cambio de ruta con `key` o al hacer clic |
| 9 | `src/components/layout/demo-banner.tsx` | 19 | Lee `localStorage` para mostrar el aviso de demo | Bajo, pero puede dar diferencias entre servidor y navegador | Leer el almacenamiento con un patrón de sincronización externa que no rompa el primer render |
| 10 | `src/components/ui/reveal.tsx` | 32 | Muestra el contenido si el navegador no tiene IntersectionObserver | Bajo | Calcular el estado inicial sin efecto, cuidando el render del servidor |

**Ya resuelta:** `src/components/layout/language-switcher.tsx` (la escritura de la cookie se movió fuera del componente; sin cambio de comportamiento; commit `3814cc7`).

## Cómo tratarlas

1. **No silenciarlas** con comentarios `eslint-disable` ni bajando la regla. Eso esconde el aviso sin resolverlo.
2. **Orden:** primero las de riesgo bajo (8, 9, 10), luego las medias (4 a 7), y al final las altas (1 a 3), que tocan sesión, reservas y horarios.
3. **Un cambio por commit,** con su prueba. Después de cada uno:
   - `npm run typecheck`
   - `npx eslint .` (debe bajar en uno)
   - pruebas de `tests/*.test.mjs`
   - `npm run build`
4. **Prueba en navegador antes de subir,** para la pantalla afectada:
   - Carga normal y recarga de página.
   - Cambio de idioma, si aplica.
   - En celular y en escritorio.
   - Que los datos existentes aparezcan igual que antes del cambio (incluidos los datos ficticios).
5. **Criterio de aceptación:** `npx eslint .` sin advertencias de `react-hooks/set-state-in-effect`, sin cambios visibles en las pantallas, y sin cambios en la base de datos.
6. **Aprobación del dueño:** cualquier cambio de comportamiento necesita su visto bueno antes de subirlo.
