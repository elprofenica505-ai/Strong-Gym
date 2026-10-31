/**
 * Un solo guardia de origen para todas las rutas que escriben.
 *
 * Antes cada ruta traía su propia copia de esta misma comprobación —once
 * archivos con la función repetida y cuatro con la lógica escrita a mano
 * dentro del `POST`— y quince rutas que escriben no la tenían. Una copia que se
 * corrige en un solo archivo deja a las demás sin el arreglo, así que la regla
 * vive acá y las rutas solo preguntan.
 *
 * Qué hace y qué no:
 *   * `sec-fetch-site: cross-site` se rechaza siempre. Lo manda el navegador y
 *     no lo puede cambiar el sitio que intenta el abuso.
 *   * Si viene `origin`, tiene que ser el mismo sitio: se compara contra la URL
 *     del pedido y también contra el encabezado `host`, porque detrás del
 *     proxy del despliegue la URL interna no siempre coincide con el dominio
 *     que ve la persona.
 *   * Sin `origin` se permite. Los clientes que no son navegador (pruebas,
 *     llamadas del propio servidor) no lo mandan, y bloquearlos rompería
 *     operaciones legítimas sin aportar protección: el navegador de un
 *     atacante siempre lo manda.
 *
 * Esto no reemplaza la sesión, el rol, el MFA ni las RPC con `security
 * definer`: es una capa más contra el pedido cruzado desde otro sitio.
 */
export function sameOrigin(request: Request): boolean {
  if (request.headers.get("sec-fetch-site") === "cross-site") return false;

  const origin = request.headers.get("origin");
  if (!origin) return true;

  try {
    const url = new URL(origin);
    return (
      url.origin === new URL(request.url).origin ||
      url.host === request.headers.get("host")
    );
  } catch {
    return false;
  }
}
