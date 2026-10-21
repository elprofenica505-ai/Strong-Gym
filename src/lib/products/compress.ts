"use client";
import {
  COMPRESSION_STEPS,
  MAX_IMAGE_BYTES,
  dataUrlBytes,
} from "@/lib/products/rules";

/**
 * Reduce una imagen del dispositivo a JPEG de hasta 600 KB.
 * Prueba tamaños y calidades en orden; si ninguno alcanza, avisa sin subir nada.
 */
export async function compressProductImage(file: File): Promise<string> {
  if (!/^image\/(jpeg|png|webp|heic|heif|gif)$/i.test(file.type) && file.type !== "")
    throw new Error("Elegí una imagen (JPG, PNG o WebP).");
  const bitmap = await createImageBitmap(file).catch(() => null);
  if (!bitmap) throw new Error("No pudimos leer la imagen. Probá con otra foto.");
  try {
    for (const step of COMPRESSION_STEPS) {
      const scale = Math.min(1, step.maxSide / Math.max(bitmap.width, bitmap.height));
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(bitmap.width * scale));
      canvas.height = Math.max(1, Math.round(bitmap.height * scale));
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("Este navegador no permite reducir imágenes.");
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
      const url = canvas.toDataURL("image/jpeg", step.quality);
      if (dataUrlBytes(url) <= MAX_IMAGE_BYTES) return url;
    }
  } finally {
    bitmap.close();
  }
  throw new Error("La imagen no se pudo reducir a 600 KB. Probá con una foto más chica.");
}
