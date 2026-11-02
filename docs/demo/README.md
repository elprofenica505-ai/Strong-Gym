# Recorrido demostrativo de la app

Vídeo informativo y demostrativo de **86 segundos** (720×1280, 24 fps, sin sonido).

- Archivo: [`recorrido-demostrativo.mp4`](./recorrido-demostrativo.mp4) (2 MB, H.264, se ve en el navegador y en el teléfono).
- Guion y dibujo: proyecto `videotools` (fuera del repo). Se regenera con `node build.mjs <salida.mp4>`.

## Qué muestra

| Escena | Tema | Duración |
| --- | --- | --- |
| 1 | Portada con el emblema | 6 s |
| 2 | Panel de gestión (clientes, reservas, mensajes) | 9 s |
| 3 | Clientes: búsqueda y vigencia | 9,5 s |
| 4 | Ficha del cliente: plan, deuda, peso | 9 s |
| 5 | Cobro con vuelto y comprobante | 10 s |
| 6 | Cierre de caja con arqueo | 9,5 s |
| 7 | Horarios, reservas y carnet QR | 9,5 s |
| 8 | Biblioteca de ejercicios con movimiento | 8,5 s |
| 9 | Administración y roles | 8 s |
| 10 | Cierre | 7 s |

## Honestidad

Es una **reconstrucción animada del diseño real**, no una grabación de una sesión en vivo.
Los rótulos lo dicen en pantalla y los datos son de ejemplo.

Las fotos de los ejercicios son de [free-exercise-db](https://github.com/yuhonas/free-exercise-db)
(dominio público); el catálogo real de la app se acredita dentro del sistema
(`EXERCISE_ATTRIBUTION` en `src/lib/exercises/terms.ts`).
