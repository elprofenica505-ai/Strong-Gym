"use client";
import { useEffect, useMemo, useState } from "react";
import { crmRequest } from "@/lib/crm/request";

type Snapshot<T> = { key: object; url: string; data: T | null; error: string };

/** Una falla de ficha no puede borrarse por el éxito del directorio/opciones.
 * Conserva la última lectura de la MISMA URL durante refresh (formularios de
 * cobro incluidos), pero señala que está pendiente/desactualizada. */
export function useCrmResource<T>(
  url: string | null,
  revision: number | string,
  enabled: boolean,
  validate: (data: unknown) => boolean,
) {
  const [snapshot, setSnapshot] = useState<Snapshot<T> | null>(null);
  const key = useMemo(
    () => ({ url, revision, enabled }),
    [url, revision, enabled],
  );
  useEffect(() => {
    if (!enabled || !url) return;
    const controller = new AbortController();
    crmRequest<T>(url, undefined, controller.signal)
      .then((data) => {
        if (controller.signal.aborted) return;
        if (!validate(data))
          throw new Error(
            "La respuesta llegó incompleta. Reintentá cargar; no creés otra ficha.",
          );
        setSnapshot({ key, url, data, error: "" });
      })
      .catch((error) => {
        if (controller.signal.aborted) return;
        setSnapshot((previous) => ({
          key,
          url,
          data: previous?.url === url ? previous.data : null,
          error:
            error instanceof Error
              ? error.message
              : "No se pudo leer esta sección.",
        }));
      });
    return () => controller.abort();
  }, [url, key, enabled, validate]);
  const active = enabled && !!url;
  return {
    data: active && snapshot?.url === url ? snapshot.data : null,
    error: active && snapshot?.key === key ? snapshot.error : "",
    loading: active && snapshot?.key !== key,
  };
}
