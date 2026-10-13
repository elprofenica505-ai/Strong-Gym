#!/usr/bin/env node
/**
 * ============================================================
 *  Genera los iconos de la app a partir del emblema de la marca
 * ============================================================
 *  El emblema de STRONG FITNESS GYM es un triángulo rojo con la
 *  silueta negra de un atleta. Acá lo dibujamos por código y lo
 *  exportamos a PNG, así los iconos quedan nítidos y no dependen
 *  de ninguna librería externa.
 *
 *  Uso:
 *    node scripts/build-icons.mjs
 *
 *  Escribe:
 *    public/icon-192.png   (maskable, con margen de seguridad)
 *    public/icon-512.png
 *    public/apple-icon.png (180×180)
 *
 *  El favicon vectorial se mantiene a mano en src/app/icon.svg.
 */

import { deflateSync } from "node:zlib";
import { writeFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

/* ------------------------------------------------------------
   Colores de la marca
   ------------------------------------------------------------ */

const NEGRO = [12, 12, 14, 255];
const ROJO = [216, 26, 34, 255];

/* ------------------------------------------------------------
   Geometría: tests de "¿este punto está dentro de la figura?"
   ------------------------------------------------------------ */

function enTriangulo(px, py, [ax, ay], [bx, by], [cx, cy]) {
  const d1 = (px - bx) * (ay - by) - (ax - bx) * (py - by);
  const d2 = (px - cx) * (by - cy) - (bx - cx) * (py - cy);
  const d3 = (px - ax) * (cy - ay) - (cx - ax) * (py - ay);
  const neg = d1 < 0 || d2 < 0 || d3 < 0;
  const pos = d1 > 0 || d2 > 0 || d3 > 0;
  return !(neg && pos);
}

function enCirculo(px, py, cx, cy, r) {
  return (px - cx) ** 2 + (py - cy) ** 2 <= r * r;
}

function enPoligono(px, py, puntos) {
  let dentro = false;
  for (let i = 0, j = puntos.length - 1; i < puntos.length; j = i++) {
    const [xi, yi] = puntos[i];
    const [xj, yj] = puntos[j];
    const cruza = yi > py !== yj > py && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi;
    if (cruza) dentro = !dentro;
  }
  return dentro;
}

/** Segmento con punta redonda: sirve para dibujar brazos y piernas. */
function enCapsula(px, py, [ax, ay], [bx, by], r) {
  const dx = bx - ax;
  const dy = by - ay;
  const largo2 = dx * dx + dy * dy;
  let t = largo2 === 0 ? 0 : ((px - ax) * dx + (py - ay) * dy) / largo2;
  t = Math.max(0, Math.min(1, t));
  const cx = ax + t * dx;
  const cy = ay + t * dy;
  return (px - cx) ** 2 + (py - cy) ** 2 <= r * r;
}

function enRectRedondeado(px, py, x, y, w, h, r) {
  if (px < x || py < y || px > x + w || py > y + h) return false;
  // Punto más cercano dentro del rectángulo "encogido" r en cada lado:
  // si queda a menos de r, el punto está dentro de la esquina redondeada.
  const ix = Math.min(Math.max(px, x + r), x + w - r);
  const iy = Math.min(Math.max(py, y + r), y + h - r);
  return (px - ix) ** 2 + (py - iy) ** 2 <= r * r;
}

/* ------------------------------------------------------------
   El emblema, en coordenadas de 0 a 100
   ------------------------------------------------------------ */

/**
 * Devuelve el color del punto (x, y) — en un lienzo de 100×100 —
 * o null si ahí no hay nada pintado.
 */
function emblema(x, y, { fondo = true } = {}) {
  // Triángulo rojo
  const A = [50, 12];
  const B = [93, 85];
  const C = [7, 85];

  // Silueta negra: cabeza, torso en V y brazos en doble bíceps.
  // Todo entra dentro del triángulo, sin tocar los bordes.
  const cabeza = enCirculo(x, y, 50, 46.5, 5.6);
  const torso = enPoligono(x, y, [
    [42, 54.5],
    [58, 54.5],
    [55.5, 77],
    [44.5, 77],
  ]);
  const brazoIzq =
    enCapsula(x, y, [43, 56], [33.5, 60.5], 3.3) ||
    enCapsula(x, y, [33.5, 60.5], [37, 49.5], 3.3);
  const brazoDer =
    enCapsula(x, y, [57, 56], [66.5, 60.5], 3.3) ||
    enCapsula(x, y, [66.5, 60.5], [63, 49.5], 3.3);

  if (cabeza || torso || brazoIzq || brazoDer) {
    // La silueta sólo se ve dentro del triángulo
    if (enTriangulo(x, y, A, B, C)) return NEGRO;
  }

  if (enTriangulo(x, y, A, B, C)) return ROJO;
  if (fondo && enRectRedondeado(x, y, 0, 0, 100, 100, 18)) return NEGRO;
  return null;
}

/* ------------------------------------------------------------
   Rasterizado con suavizado (4×4 submuestras por píxel)
   ------------------------------------------------------------ */

function rasterizar(tam, { escala = 1, fondo = true } = {}) {
  const px = Buffer.alloc(tam * tam * 4);
  const M = 4; // submuestras por lado
  const centro = tam / 2;

  for (let y = 0; y < tam; y++) {
    for (let x = 0; x < tam; x++) {
      let r = 0;
      let g = 0;
      let b = 0;
      let a = 0;

      for (let sy = 0; sy < M; sy++) {
        for (let sx = 0; sx < M; sx++) {
          // Punto de muestra, llevado al espacio 0..100 del emblema
          const mx = x + (sx + 0.5) / M;
          const my = y + (sy + 0.5) / M;
          const ex = ((mx - centro) / (tam * escala)) * 100 + 50;
          const ey = ((my - centro) / (tam * escala)) * 100 + 50;

          const color = emblema(ex, ey, { fondo });
          if (color) {
            r += color[0];
            g += color[1];
            b += color[2];
            a += color[3];
          }
        }
      }

      const n = M * M;
      const i = (y * tam + x) * 4;
      // Promedio del color SÓLO entre las submuestras que pintaron algo,
      // para que los bordes se suavicen sin ensuciarse de negro.
      const pintadas = a / 255;
      px[i] = pintadas > 0 ? Math.round(r / pintadas) : 0;
      px[i + 1] = pintadas > 0 ? Math.round(g / pintadas) : 0;
      px[i + 2] = pintadas > 0 ? Math.round(b / pintadas) : 0;
      px[i + 3] = Math.round((pintadas / n) * 255);
    }
  }

  return px;
}

/* ------------------------------------------------------------
   Escritura de PNG (sin dependencias)
   ------------------------------------------------------------ */

const TABLA_CRC = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c;
  }
  return t;
})();

function crc32(buf) {
  let c = -1;
  for (let i = 0; i < buf.length; i++) c = TABLA_CRC[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}

function trozo(tipo, datos) {
  const largo = Buffer.alloc(4);
  largo.writeUInt32BE(datos.length, 0);
  const cuerpo = Buffer.concat([Buffer.from(tipo, "ascii"), datos]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(cuerpo), 0);
  return Buffer.concat([largo, cuerpo, crc]);
}

function png(ancho, alto, pixeles) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(ancho, 0);
  ihdr.writeUInt32BE(alto, 4);
  ihdr[8] = 8; // bits por canal
  ihdr[9] = 6; // RGBA
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  // Cada fila lleva adelante un byte de filtro (0 = ninguno)
  const crudo = Buffer.alloc(alto * (ancho * 4 + 1));
  for (let y = 0; y < alto; y++) {
    crudo[y * (ancho * 4 + 1)] = 0;
    pixeles.copy(crudo, y * (ancho * 4 + 1) + 1, y * ancho * 4, (y + 1) * ancho * 4);
  }

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    trozo("IHDR", ihdr),
    trozo("IDAT", deflateSync(crudo, { level: 9 })),
    trozo("IEND", Buffer.alloc(0)),
  ]);
}

/* ------------------------------------------------------------
   Generar los archivos
   ------------------------------------------------------------ */

const salidas = [
  // "maskable" necesita que el dibujo entre en el 80% central
  { archivo: "public/icon-192.png", tam: 192, escala: 0.74 },
  { archivo: "public/icon-512.png", tam: 512, escala: 0.82 },
  { archivo: "public/apple-icon.png", tam: 180, escala: 0.82 },
];

for (const { archivo, tam, escala } of salidas) {
  const destino = join(ROOT, archivo);
  writeFileSync(destino, png(tam, tam, rasterizar(tam, { escala })));
  console.log(`✏️  ${relative(ROOT, destino)} (${tam}×${tam})`);
}

console.log("✅ Iconos de STRONG FITNESS GYM generados.");
