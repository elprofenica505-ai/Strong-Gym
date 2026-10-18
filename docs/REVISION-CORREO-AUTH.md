# Seguridad1C — Revisión de correo/Auth antes de publicar PR13

Fecha:18 de octubre de2026. PR13 ABIERTO, sin merge. Rama fija:
`arena/1e67d1fd-strong-gym`. Lectura de configuración real, sin modificarla.

## Qué se verificó de verdad

Consulta de proyecto: ACTIVE_HEALTHY. Consulta get_auth_config del proyecto existente.
Referencia de lectura: `7331be35-724a-4d25-add1-673c5857233b`.
Se registra sólo esta selección no sensible; NO copiar respuesta completa ni secretos
al repositorio. No se leyeron perfiles, factores de usuarios ni movimientos comerciales.

| Revisión | Valor observado | Interpretación / límite |
|---|---|---|
| Site URL | https://strong-gym-gamma.vercel.app | Coincide con el dominio confirmado. |
| Allowlist | https://strong-gym-gamma.vercel.app/** | Los4 callbacks de producción del PR quedan dentro del patrón actual. No está restringido a sólo esos4; no se cambió ni redujo a ciegas. |
| Templates confirmación/recuperación | Enlace con ConfirmationURL, sin personalización | Compatible con retorno PKCE del código. No prueba envío ni recepción. |
| Email / confirmación | Email habilitado; autoconfirmación=false | No se desactivó confirmación como atajo. |
| SMTP personalizado | Host/usuario/contraseña/remitente no configurados | Bloqueo para considerar listo el correo general a clientes; no hay credenciales SMTP inventadas. |
| Límite de emails Auth |2 por hora, compartido por proyecto | No consumir con envíos de prueba automáticos ni afirmar un cooldown exacto desde el cliente. |
| Access token TTL |3600 segundos | Access tokens previos pueden sobrevivir al logout hasta expirar. |
| Rotación refresh | refresh_token_rotation_enabled=true; reuse interval10 | No interpretar un alias security_refresh_token_rotation_enabled=null como desactivación. No prueba todas las carreras de sesión. |
| Mínimo contraseña del proveedor |6 | App nueva exige12–128; esto NO vuelve12 el mínimo de todos los clientes del proveedor. Requiere endurecimiento separado, autorizado y comprobado. |
| TOTP disponible en proveedor | Enroll/verify habilitados | NO prueba que un usuario tenga un factor ni que app/RLS apliquen MFA integral. No se enroló/desactivó ninguno. |

## Bloqueo de correo confirmado, no un problema de menú

La documentación oficial indica que el SMTP integrado es para pruebas, no producción,
y sólo entrega a direcciones preautorizadas del equipo del proyecto. Un cliente
persistido en profiles NO se vuelve por eso miembro del equipo de Supabase.

Fuentes oficiales consultadas (sólo lectura, GitHub):
- [Restricciones SMTP integrado](https://github.com/supabase/supabase/blob/master/apps/docs/content/guides/auth/auth-smtp.mdx).
- [Cuotas de Auth](https://github.com/supabase/supabase/blob/master/apps/docs/content/_partials/auth_rate_limits.mdx).

No se consultó el equipo para adivinar qué correo está autorizado. No se mandó ningún
email, no se probó recepción real, no se consumió cuota ni se cambió una contraseña.
No ampliar cuotas, desactivar confirmación, dar roles de equipo a clientes ni usar
service_role para disimular el problema. Tampoco hay motivo para tocar SQL.

## Refuerzo del PR13 tras esta revisión

- Rate limit (status429/códigos públicos) y email no autorizado/proveedor deshabilitado
  ahora se distinguen de un error genérico en solicitud de recuperación y registro.
- Avisos ES/EN claros, sin mensajes SMTP crudos ni afirmación de envío exitoso.
  El límite no dispara retry automático ni un temporizador inventado.
- La neutralidad sobre existencia de cuentas se conserva. Estos avisos no enumeran
  usuarios ni exponen direcciones, claves, cuotas privadas o detalles de backend.
- Pruebas de helper, SDK boundary/proveedor y React/JSDOM real para estos errores.
  No se reemplaza el control del proveedor con validación de navegador.

## Siguiente paso guiado

1. Confirmar con el usuario si existe dominio/correo del gimnasio o proveedor de
   envíos ya contratado; NO inventar remitente, propiedad del dominio ni presupuesto.
2. Preparar SMTP propio/remitente verificado y DNS si corresponde. El usuario debe
   registrar claves directamente en el panel seguro del proveedor/Supabase: no chat
   ni GitHub. La configuración remota requiere autorización específica.
3. Verificar destinos controlados, templates y límites antes de publicar; los destinos
   productivos actuales son compatibles y no necesitan ampliarse para estos4 callbacks.
   Preview/local no están incluidos: no usar correos reales allí suponiendo que sirven.
4. Autorizar publicación del PR por separado y comprobar un correo del usuario,
   en el mismo navegador. Reutilización/fallos y cambio voluntario después. Sin pagos.

MFA integral, protección global de contraseñas, sesiones, TLS y otras revisiones siguen
pendientes. Esta lectura no es una certificación global ni autorización de merge.

## Validación local de la revisión

```text
typecheck: tsc --noEmit, exit0
lint:0 errores,9 advertencias
build: Compiled successfully;44/44 (producción sin Supabase, flag demo=true)
test:auth:532/532,0 fallos (+12 sobre el primer corte de PR13)
test:sql: todas las suites PASS; seguridad147, deudas95 incluidas (PGlite)
test:finance:rsc: Cuentas/Reportes/Gastos/Comprobante PASS (ejecución serial)
test:metadata: PASS; páginas/API no configuradas503, no-referrer y OG
test:layout:264 casos PASS,320–1280px (SSR/CSS; no certifica hidratación)
```

No ejecutar el build principal y la fixture Next/RSC en paralelo: ésta vive bajo
.next y el build principal puede limpiar su directorio. CI ya las ejecuta en serie.
El ensayo paralelo local tuvo ese conflicto de archivos; el serial posterior pasó.
No fue fallo SQL ni prueba remota de operaciones.
