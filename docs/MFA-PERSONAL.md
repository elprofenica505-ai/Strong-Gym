# Verificación en dos pasos (MFA) para el personal

**Estado:** implementado en la app (rama `arena/85c54d7d-strong-gym`). Pendiente: activarlo en la cuenta del administrador y revisar la protección a nivel de base de datos (ver "Pendiente").

## Qué hace
- Las cuentas **admin** y **staff** sólo abren el panel con un código de 6 dígitos de una app de autenticación, además de la contraseña.
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

## Pendiente
1. **Base de datos:** hoy el bloqueo está en la app. Una consulta directa a la API de Supabase con una sesión sin MFA todavía podría leer datos protegidos por las políticas actuales. Para cerrarlo hace falta un cambio SQL, que requiere autorización expresa.
2. **Segundo administrador (dueño):** cambio de permisos remoto, sólo con autorización indicando su correo.
3. **Correo de recuperación:** depende del correo del gimnasio (ver `docs/REVISION-CORREO-AUTH.md`).
