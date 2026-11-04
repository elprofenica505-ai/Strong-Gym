# Primer mensaje para la sesión del gimnasio nuevo

> Copiá **todo** el bloque de abajo y pegalo como primer mensaje en la sesión
> nueva de Arena, ya con el repositorio `gimnasio` seleccionado.
>
> Está escrito para que la sesión nueva sepa arrancar **aunque los documentos
> todavía no estén en su repositorio**. El primer paso que le pido es traerlos.

---

```text
Antes de tocar nada, leé esto completo.

CONTEXTO
Este repositorio (elprofenica505-ai/gimnasio) es una copia de
elprofenica505-ai/Strong-Gym, un sistema de gestión de gimnasio en Next.js +
Supabase. Va a ser la instalación de un gimnasio NUEVO y DISTINTO.

La decisión ya está tomada: dos repositorios separados, dos proyectos de
Supabase, dos proyectos de Vercel. No hay multiinquilino, no hay gym_id, no hay
base compartida.

El objetivo: TODOS los módulos y funcionalidades idénticos a Strong. Cero
módulos menos. Los datos vacíos (cero socios, cero cobros, cero reservas). Y sin
un solo dato de Strong: ni cuentas bancarias, ni tarifas, ni entrenadores, ni
horarios. Lo único que cambia son el nombre, la razón social, la dirección, el
link de Google Maps, el teléfono, WhatsApp, redes sociales, horarios de
atención, moneda, logo e imágenes del local.

PRIMER PASO OBLIGATORIO: traer la documentación
Este repo se clonó antes de que existiera el kit de instalación, así que no lo
tiene. Traelo desde la rama de Strong con estos comandos:

  git remote add strong https://github.com/elprofenica505-ai/Strong-Gym.git
  git fetch strong arena/5fabb7bb-strong-gym
  git checkout strong/arena/5fabb7bb-strong-gym -- \
    supabase/INSTALAR-BASE.sql supabase/PERSONALIZAR-GIMNASIO.sql \
    scripts/build-install-sql.mjs \
    docs/CLONAR-PARA-OTRO-GIMNASIO.md docs/TRASPASO-GIMNASIO-NUEVO.md

Después leé, en este orden:
  1. docs/TRASPASO-GIMNASIO-NUEVO.md      ← el estado completo del proyecto
  2. docs/CLONAR-PARA-OTRO-GIMNASIO.md    ← qué es idéntico y qué cambia

No inventes nada de lo que digan esos documentos: tienen el detalle verificado
(qué migraciones entran, cómo viaja la biblioteca de ejercicios, por qué no hay
Storage, cómo se asigna el rol admin, y las trampas de los seeds).

QUÉ NECESITO AHORA
Hacé inventario y no cambies nada todavía. Decime:
  1. Qué archivos del repo todavía tienen datos o marca de Strong, con la línea
     exacta. Sé que están 00002_seed.sql, 00003_datos_reales.sql,
     00021_clients_seed.sql y 00011_finance_seed.sql (cuenta BAC 123-456789).
  2. Qué archivos de src/ tienen la marca escrita a mano.
  3. Qué habría que tocar para desarmar esos seeds SIN romper
     scripts/build-sql.mjs, que los lee para generar SETUP.sql y ACTUALIZAR.sql.

DESPUÉS, EN ORDEN
  4. Desarmar los datos de Strong de los seeds, de forma reversible.
  5. Personalizar la marca. Todavía NO tengo los datos del gimnasio: nombre,
     dirección, Google Maps, teléfono, logo, horarios y precios. Cuando me los
     pidan, pedímelos vos.
  6. Reemplazar las 21 imágenes (la lista está en CLONAR-PARA-OTRO-GIMNASIO.md).

REGLAS DE TRABAJO
- Idioma español, tono cercano, sin excusas largas.
- Inventario antes de código. Cambios pequeños, no duplicar.
- Migraciones aditivas y reversibles. Anular en vez de borrar.
- Yo hago el merge de los PR; no fusiones por tu cuenta.
- Nunca copiar datos personales de un gimnasio a otro, ni «para probar».
- Asumí que hago todo desde el celular: nada de comandos que solo funcionen en
  una computadora, y explicame qué apretar, no solo qué escribir.
```
