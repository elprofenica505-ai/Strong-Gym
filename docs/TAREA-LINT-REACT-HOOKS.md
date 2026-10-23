# Tarea resuelta: 10 avisos de lint `react-hooks/set-state-in-effect`

**Estado:** resuelta el 23 de octubre de 2026. `npx eslint .` termina con **0 errores y 0 avisos**, y la regla quedó como **error** en `eslint.config.mjs` para que no vuelva a colarse.

**Qué eran:** avisos de `eslint-plugin-react-hooks` (regla del React Compiler) sobre pantallas que actualizaban estado React dentro de un efecto. Podían causar renders de más o parpadeos.

**Cómo se resolvieron:** sin `eslint-disable`, sin bajar la regla y sin tocar la base de datos. Cada caso se reescribió con el patrón que React recomienda:

| # | Archivo | Antes | Ahora |
|---|---|---|---|
| 1 | `src/components/providers/app-provider.tsx` | Copiaba `initialUser` al estado con un efecto | El usuario se deduce del prop; el cierre de sesión se marca con `signedOutUser` |
| 2 | `src/components/providers/app-provider.tsx` | Cargaba reservas desde un efecto con estado síncrono | Lectura pura `fetchBookings` + efecto que espera la respuesta antes de aplicar el estado |
| 3 | `src/components/schedule/schedule-board.tsx` | Cargaba la semana con estado síncrono en el efecto | `fetchWeek` puro; la primera carga espera la respuesta y los cambios de semana los dispara el usuario |
| 4 | `src/components/products/product-manager.tsx` | Carga inicial con `setData` desde una función llamada en el efecto | `fetchProducts` puro + `applyProducts` después de la respuesta |
| 5 | `src/components/nutrition/nutrition-calculator.tsx` | Igual que 4 | `fetchSheet` puro + `applySheet` después de la respuesta |
| 6 | `src/components/account/account-dashboard.tsx` | Limpiaba el mapa de sesiones dentro del efecto | Guarda la clave consultada junto con las sesiones y deduce el valor vigente |
| 7 | `src/components/account/member-summary.tsx` | Igual que 6 | Igual que 6 |
| 8 | `src/components/layout/side-nav.tsx` | Reiniciaba la sección activa en un efecto al cambiar de ruta | La sección se deduce comparando la ruta guardada con la actual |
| 9 | `src/components/layout/demo-banner.tsx` | Leía `localStorage` en un efecto y hacía `setVisible` | `useSyncExternalStore` lee el almacenamiento como fuente externa; en el servidor se oculta |
| 10 | `src/components/ui/reveal.tsx` | Activaba la visibilidad si no había `IntersectionObserver` | La compatibilidad se consulta con `useSyncExternalStore` y la visibilidad se deduce |

**Verificación:** `npm run typecheck`, `npx eslint .`, todas las pruebas de `tests/*.test.mjs` y `npm run build`, todo en verde.

**Prueba de navegador:** el entorno de trabajo no tiene navegador. Las pantallas afectadas que conviene mirar cuando haya uno: horarios (cambiar semana, reservar, cancelar), Mi cuenta (cargar reservas, cerrar sesión), productos (alta y edición), calculadora (buscar cliente y guardar), aviso de demo (cerrarlo y recargar) y animaciones de inicio.

**Nota:** un cambio de comportamiento en estas pantallas necesita el visto bueno del dueño; este trabajo se hizo con su pedido explícito de repararlas.
