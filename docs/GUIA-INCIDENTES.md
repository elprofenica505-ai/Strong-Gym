# Guía de respuesta a incidentes

Borrador operativo. Completar los datos entre corchetes antes de usarla.

## Contactos
- Responsable del gimnasio: [nombre y teléfono]
- Administrador de la aplicación: [nombre y correo]
- Soporte de Supabase (proyecto de producción): panel de Supabase, sección de soporte.
- Hosting (Vercel): panel del proyecto.

## Qué es un incidente
- Acceso no autorizado a cuentas o a datos de clientes.
- Filtración o publicación accidental de datos personales o de salud.
- Caída del sitio o del panel que impida cobrar o registrar asistencia.
- Pérdida o corrupción de datos.
- Sospecha de clave o secreto expuesto (por ejemplo, en un repositorio o en un mensaje).

## Pasos inmediatos (primeras 2 horas)
1. Avisar al responsable del gimnasio y registrar hora, quién detectó el problema y qué se observó.
2. Contener:
   - Si hay una cuenta comprometida: cerrar sus sesiones y cambiar la contraseña desde el panel de Supabase.
   - Si hay una clave expuesta: rotarla en Supabase y en Vercel antes de cualquier otra acción.
   - Si el problema viene de un cambio reciente: volver a la versión anterior en Vercel.
3. Preservar evidencia: capturas, registros de acceso y el identificador de la versión desplegada. No borrar nada.
4. No mostrar datos de clientes en canales abiertos ni en capturas compartidas.

## Evaluación
- Determinar qué datos y qué clientes podrían estar afectados.
- Determinar si hay datos de salud (peso, altura, edad, medidas) involucrados: en ese caso el responsable debe ser avisado de inmediato.
- Decidir con el responsable si corresponde avisar a los clientes afectados y en qué plazo. Los textos de aviso deben ser revisados por un abogado.

## Recuperación
- Restaurar desde un respaldo solo después de confirmar la causa. Ver la sección de respaldos.
- Verificar con datos ficticios o con una cuenta de prueba antes de volver a abrir el acceso a clientes.
- Reactivar el acceso por etapas: primero personal, después clientes.

## Respaldos y restauración
- Supabase hace respaldos automáticos según el plan contratado. Confirmar en el panel qué plan está activo y cuántos días de retención incluye.
- Una restauración de prueba debe hacerse en un proyecto separado, nunca sobre producción directamente.
- Registrar la fecha de la última restauración de prueba: [fecha].

## Después del incidente
- Escribir un resumen: qué pasó, cuándo, qué se hizo y qué cambia para evitarlo.
- Revisar esta guía y actualizar los contactos.
