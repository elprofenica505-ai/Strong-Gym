# Pasos desde el celular

> **Todo desde el teléfono. No hace falta computadora ni escribir comandos.**
> Los comandos los corre la sesión nueva por vos: tiene terminal propia.

---

## Antes de empezar: una buena noticia

No vas a tener que escribir ni un comando. Al principio yo te había dado
comandos de `git`, pero eso era pensando en una terminal. **La sesión nueva de
Arena tiene su propia terminal y puede bajar los archivos sola.**

Entonces tus pasos son: abrir un chat, elegir el repositorio, pegar un texto y
apretar enviar. Nada más.

---

## Paso 1 · Abrir un chat nuevo

1. Abrí **arena.ai** en el navegador del celular (o la app, si la tenés).
2. Tocá el menú (las tres rayitas, arriba a la izquierda).
3. Tocá **New Chat** / **Nuevo chat**.

> Dejá **esta** conversación abierta. No la cierres: si algo no cuadra en el
> chat nuevo, volvés acá.

## Paso 2 · Elegir el repositorio nuevo

1. Abajo del cuadro de texto hay un selector que ahora dice
   **`Strong-Gym`** con una flechita.
2. Tocalo.
3. En la lista, elegí **`gimnasio`** (es el que clonaste).

**Si `gimnasio` no aparece en la lista:**
- Tocá donde dice conectar o actualizar GitHub, y volvé a abrir el selector.
- Si sigue sin aparecer, revisá en github.com que el repo `gimnasio` esté con tu
  misma cuenta (`elprofenica505-ai`).

> **Importante:** si el selector dice `Strong-Gym`, **no sigas**. Todo lo que
> hagas ahí cae en el repo equivocado.

## Paso 3 · Pegar el texto

1. Tocá el cuadro de texto.
2. Mantené apretado y elegí **Pegar**.
3. El texto completo está abajo, en el bloque gris. Copialo entero, desde
   «Antes de tocar nada» hasta la última línea de las reglas.

## Paso 4 · Enviar y esperar

1. Tocá el botón de enviar.
2. Va a tardar un poco: primero baja los archivos de Strong, después los lee.
3. Cuando termine, te va a devolver un **inventario**: qué encontró en el repo,
   con archivos y líneas.

**Ese inventario es lo que quiero ver.** Si dice que cambió cosas antes de
mostrártelo, decile: *«no cambies nada hasta que yo confirme»*.

## Paso 5 · Pasarle los datos del gimnasio

Cuando te los pida, mandale:

- El **link de la página de Facebook** del gimnasio (o la captura del perfil).
- El **nombre exacto** y la razón social si la sabés.
- El **logo**, si lo tenés.
- Si los sabés: precios y disciplinas. Si no, decile que después.

## Paso 6 · Revisar el PR

Cuando termine el trabajo, va a dejar un **pull request** abierto. Vos lo
revisás en GitHub desde el celular y le das **Merge** cuando estés conforme.
Nadie más lo fusiona.

---

## El texto que hay que pegar en el chat nuevo

```text
Antes de tocar nada, leé esto completo.

CONTEXTO
Este repositorio (elprofenica505-ai/gimnasio) es una copia de
elprofenica505-ai/Strong-Gym: un sistema de gestión de gimnasio en Next.js +
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

PRIMER PASO: traer el kit (hacelo vos, no me pidas que corra comandos)
Este repo se clonó antes de que existiera el kit, así que no lo tiene. Traelo
de la rama de Strong:

  git remote add strong https://github.com/elprofenica505-ai/Strong-Gym.git
  git fetch strong arena/5fabb7bb-strong-gym
  git checkout strong/arena/5fabb7bb-strong-gym -- \
    supabase/INSTALAR-BASE.sql supabase/PERSONALIZAR-GIMNASIO.sql \
    scripts/build-install-sql.mjs \
    docs/CLONAR-PARA-OTRO-GIMNASIO.md docs/TRASPASO-GIMNASIO-NUEVO.md

Eso copia cinco archivos de texto. No trae la historia de Strong, no borra nada
y no cambia la rama. Si el fetch falla por permisos, avisame y no sigas.

Después leé, en este orden:
  1. docs/TRASPASO-GIMNASIO-NUEVO.md      el estado completo del proyecto
  2. docs/CLONAR-PARA-OTRO-GIMNASIO.md    qué es idéntico y qué cambia

No inventes lo que digan esos documentos: tienen el detalle verificado (qué
migraciones entran, cómo viaja la biblioteca de ejercicios, por qué no hay
Storage, cómo se asigna el rol admin, las trampas de los seeds).

QUÉ NECESITO AHORA
Hacé inventario y NO cambies nada todavía. Decime:
  1. Qué archivos todavía tienen datos o marca de Strong, con archivo y línea.
     Sé que están 00002_seed.sql, 00003_datos_reales.sql, 00021_clients_seed.sql
     y 00011_finance_seed.sql (con la cuenta BAC 123-456789 adentro).
  2. Qué archivos de src/ tienen la marca escrita a mano.
  3. Qué habría que tocar para desarmar esos seeds SIN romper
     scripts/build-sql.mjs, que los lee para generar SETUP.sql y ACTUALIZAR.sql.

DESPUÉS, EN ORDEN
  4. Desarmar los datos de Strong de los seeds, de forma reversible.
  5. Personalizar la marca. Todavía NO tengo los datos del gimnasio: nombre,
     dirección, Google Maps, teléfono, logo, horarios y precios. Pedímelos.
  6. Reemplazar las 21 imágenes (la lista está en CLONAR-PARA-OTRO-GIMNASIO.md).

REGLAS DE TRABAJO
- Idioma español, tono cercano, sin excusas largas.
- Inventario antes de código. Cambios pequeños, no duplicar.
- Migraciones aditivas y reversibles. Anular en vez de borrar.
- Yo hago el merge de los PR; no fusiones por tu cuenta.
- Nunca copiar datos personales de un gimnasio a otro, ni «para probar».
- Asumo todo desde el celular: nada de comandos que solo funcionen en una
  computadora, y explicame qué apretar, no solo qué escribir.
```

---

## Si algo sale mal

| Qué ves | Qué hacer |
|---|---|
| El selector no tiene `gimnasio` | Revisá que el repo esté en tu cuenta de GitHub y refrescá la conexión |
| «Repository not found» al bajar los archivos | Que la sesión revise el nombre exacto del repo de Strong: `elprofenica505-ai/Strong-Gym` |
| La sesión quiere fusionar el PR sola | Decile: «no fusiones, yo hago el merge» |
| No entendés el inventario | Volvé a esta conversación y pegalo acá: lo revisamos juntos |
| Pide instalar cosas raras | No; todo lo que necesita ya se lo bajan con el comando |

---

## Para qué queda listo este repositorio (Strong)

Esta sesión sigue viva y no se cierra. En Strong quedaron:

- `supabase/INSTALAR-BASE.sql` — la base limpia, 82 de 85 migraciones.
- `supabase/PERSONALIZAR-GIMNASIO.sql` — dueño, cajas y planes.
- `scripts/build-install-sql.mjs` — el generador (`npm run build:install`).
- Cuatro documentos en `docs/`.

Nada de eso cambió una sola línea de la aplicación.
