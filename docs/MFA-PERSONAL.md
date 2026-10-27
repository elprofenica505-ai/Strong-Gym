# Verificación en dos pasos (MFA) para el personal

**Estado:** implementado y publicado. La protección también está en la base:
las funciones y políticas del personal exigen el nivel AAL2 cuando corresponde.
Esta es una guía de uso, **no una lista de tareas**; el seguimiento vivo está
solo en `docs/PENDIENTES-ACTUALES.md`.

## Qué hace
- Las cuentas del personal sólo abren el panel con un código de 6 dígitos de una app de autenticación, además de la contraseña.
- Las cuentas de clientes no cambian.
- Si el estado no se puede leer, el panel queda bloqueado (no se muestra información).

## Pasos para activarlo (administrador)
1. Entrá con tu cuenta a **Mi cuenta**.
2. Verás la tarjeta **Verificación en dos pasos**.
3. En el celular, abrí Google Authenticator, Microsoft Authenticator o similar.
4. Escaneá el código QR de la pantalla, o escribí la clave manual en la app.
5. Escribí el código de 6 dígitos que muestra la app y tocá **Confirmar**.
6. Listo: el panel queda abierto para esta sesión.

## Si perdés el celular
- No hay códigos de respaldo en la app todavía.
- Mientras exista **otro administrador con MFA**, ese administrador puede corregir la cuenta.
- Por eso conviene dejar al dueño como segundo administrador antes de retirar el acceso temporal.

## Protección contra listas de códigos

- La verificación real la hace Supabase Auth: el código viaja como **un único texto** y el desafío como un UUID. Enviar una lista no convierte una petición en miles de intentos.
- La app también falla cerrada en tiempo de ejecución: el código debe ser un string primitivo de exactamente 6 dígitos y el formulario debe traer un solo campo `code`. Arrays, números, objetos con `toString()` y duplicados se descartan antes de llamar al SDK.
- El factor y el desafío también deben ser IDs escalares. Si Supabase devolviera un ID, QR o secreto con un tipo inesperado, el flujo se detiene como no disponible.
- Esto no elimina la fuerza bruta con peticiones separadas si alguien roba primero la contraseña/sesión AAL1; esa capa depende de los límites de Supabase y de cuidar la sesión.

## Límites y seguimiento

- No hay códigos de respaldo dentro de la app. Por eso el segundo
  administrador del dueño y el procedimiento de recuperación se siguen como
  **SEG-03** en la lista única.
- El correo propio para recuperación de contraseñas se sigue como **SEG-02**
  en la lista única.
- Un bloqueo adicional por usuario/factor con Auth Hook es opcional y se sigue
  como **FUT-03**; no forma parte de esta guía.
