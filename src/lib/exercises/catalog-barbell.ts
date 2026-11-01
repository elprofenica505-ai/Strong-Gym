import type { SecondTranslation } from "./second-catalog.ts";

/**
 * Contenido en español del segundo catálogo: **barra, banco y mancuernas**.
 *
 * Esta lista es la curaduría: lo que está acá entra a la biblioteca, lo que no
 * está se queda afuera. No se traduce automáticamente —el origen viene en
 * inglés— ni se copia el texto del origen: son pasos cortos, escritos para que
 * un socio los siga en la sala.
 *
 * Se dejan afuera a propósito las variantes de competencia que no se usan en un
 * gimnasio de barrio (cadenas, bandas elásticas en la barra, bloques, tablas):
 * suman ruido y no aportan.
 */
export const BARBELL_ES: Record<string, SecondTranslation> = {
  "Barbell_Squat": {
    name: "Sentadilla con barra",
    steps: [
      "Poné la barra sobre los trapecios, no sobre el cuello, y separá los pies al ancho de los hombros.",
      "Bajá controlando con el pecho arriba y las rodillas siguiendo la punta de los pies, hasta donde llegues sin perder la espalda recta.",
      "Empujá el piso con los talones y subí soltando el aire.",
    ],
    tip: "Si te inclinás demasiado hacia adelante, bajá el peso: la barra tiene que viajar sobre el medio del pie.",
  },
  "Barbell_Full_Squat": {
    name: "Sentadilla profunda con barra",
    steps: [
      "Barra en los trapecios y pies al ancho de los hombros, con las puntas ligeramente hacia afuera.",
      "Bajá hasta pasar el paralelo, con la espalda neutra y los talones pegados al piso.",
      "Subí sin rebotar, apretando el glúteo arriba.",
    ],
    tip: "Si los talones se despegan, poné discos debajo o mejorá la movilidad de tobillo antes de cargar más.",
  },
  "Wide_Stance_Barbell_Squat": {
    name: "Sentadilla sumo con barra",
    steps: [
      "Abrí los pies más allá del ancho de los hombros y girá las puntas hacia afuera unos 45 grados.",
      "Bajá derecho, con las rodillas abriéndose hacia los lados, no hacia adentro.",
      "Subí empujando con los talones y apretando el glúteo.",
    ],
  },
  "Narrow_Stance_Squats": {
    name: "Sentadilla con pies juntos",
    steps: [
      "Pies juntos o al ancho de la cadera, puntas al frente, barra en los trapecios.",
      "Bajá sin que las rodillas se junten y manteniendo el pecho alto.",
      "Subí controlando; trabajás más el cuádriceps externo.",
    ],
  },
  "Barbell_Hack_Squat": {
    name: "Hack squat con barra",
    steps: [
      "Con la barra en el piso detrás de las piernas, agachate y tomala con las palmas hacia adelante.",
      "Subí con la espalda recta y la barra pegada a los glúteos hasta quedar de pie.",
      "Bajá controlando hasta el piso.",
    ],
    tip: "La barra va detrás de los talones, no delante: si golpea los talones, estás muy adelante.",
  },
  "Barbell_Walking_Lunge": {
    name: "Zancadas caminando con barra",
    steps: [
      "Barra en la espalda alta, dá un paso largo y bajá la rodilla de atrás casi hasta el piso.",
      "Empujá con la pierna de adelante y pasá directo a la siguiente zancada.",
      "Mantené el torso erguido todo el recorrido.",
    ],
    tip: "Empezá sin peso: la zancada caminando castiga el equilibrio más que la fuerza.",
  },
  "Barbell_Step_Ups": {
    name: "Subidas al cajón con barra",
    steps: [
      "Con la barra en la espalda, poné un pie completo sobre un cajón o banco firme.",
      "Subí empujando con esa pierna, sin tomar impulso con la de abajo.",
      "Bajá controlando y cambiá de pierna.",
    ],
    tip: "El cajón a la altura de la rodilla: más alto te obliga a saltar y ya no es fuerza.",
  },
  "Barbell_Shoulder_Press": {
    name: "Press de hombro con barra",
    steps: [
      "De pie o sentado, barra a la altura de las clavículas con las manos algo más anchas que los hombros.",
      "Empujá arriba sin arquear la espalda y pasando la cabeza cuando la barra sube.",
      "Bajá controlando hasta las clavículas.",
    ],
    tip: "Apretá el abdomen como si fueras a recibir un golpe: evita que la espalda baja se arquee.",
  },
  "Seated_Barbell_Military_Press": {
    name: "Press militar sentado con barra",
    steps: [
      "Sentate con la espalda apoyada y la barra frente a las clavículas.",
      "Empujá arriba hasta estirar los brazos.",
      "Bajá controlando sin dejar caer la barra.",
    ],
  },
  "Standing_Military_Press": {
    name: "Press militar de pie",
    steps: [
      "Pies al ancho de la cadera, barra en las clavículas y abdomen firme.",
      "Empujá la barra arriba pasando la cara cuando pase.",
      "Bajá despacio hasta las clavículas.",
    ],
  },
  "Wide-Grip_Standing_Barbell_Curl": {
    name: "Curl de pie agarre amplio",
    steps: [
      "Barra con las palmas arriba y las manos más separadas que los hombros.",
      "Subí sin balancear el torso.",
      "Bajá controlando hasta estirar los brazos.",
    ],
  },
  "Stiff-Legged_Barbell_Deadlift": {
    name: "Peso muerto piernas rígidas",
    steps: [
      "Barra frente a los muslos, pies al ancho de la cadera y rodillas apenas flexionadas.",
      "Bajá la barra pegada a las piernas llevando la cadera hacia atrás.",
      "Subí apretando el glúteo sin arquear la espalda.",
    ],
    tip: "Sentís el estiramiento atrás de los muslos: si sentís la espalda baja, estás bajando demasiado.",
  },
  "T-Bar_Row_with_Handle": {
    name: "Remo en T",
    steps: [
      "Poné un extremo de la barra en el rincón o en el soporte y cargá el otro con discos.",
      "Inclinate con la espalda recta y tirá del agarre hacia el abdomen.",
      "Bajá controlando hasta estirar los brazos.",
    ],
  },
  "Bent_Over_Two-Arm_Long_Bar_Row": {
    name: "Remo inclinado con barra",
    steps: [
      "Inclinate unos 45 grados con la barra colgando y la espalda recta.",
      "Tirá la barra hacia el abdomen bajo, juntando los omóplatos.",
      "Bajá controlando sin redondear la espalda.",
    ],
    tip: "Si el torso sube y baja con cada repetición, estás usando impulso: bajá el peso.",
  },
  "Standing_Barbell_Calf_Raise": {
    name: "Gemelo de pie con barra",
    steps: [
      "Barra en la espalda, puntas de los pies sobre un disco o escalón.",
      "Subí los talones lo más alto posible y aguantá un segundo arriba.",
      "Bajá despacio hasta sentir el estiramiento.",
    ],
    tip: "El recorrido completo es lo que hace crecer el gemelo: no rebotes.",
  },
  "Barbell_Seated_Calf_Raise": {
    name: "Gemelo sentado con barra",
    steps: [
      "Sentate con la barra sobre los muslos, cerca de las rodillas, y las puntas sobre un escalón.",
      "Subí los talones y aguantá arriba.",
      "Bajá hasta estirar bien.",
    ],
    tip: "Sentado trabaja más el sóleo, el músculo que está debajo del gemelo.",
  },
  "Good_Morning_off_Pins": {
    name: "Buenos días desde soportes",
    steps: [
      "Barra en la espalda alta, pies al ancho de la cadera y rodillas apenas flexionadas.",
      "Llevá la cadera hacia atrás bajando el torso hasta quedar casi paralelo al piso.",
      "Volvé subiendo con el glúteo y la espalda baja firmes.",
    ],
    tip: "Empezá con la barra vacía: es un ejercicio de bisagra de cadera, no de cargar.",
  },
  Landmine_180s: {
    name: "Landmine 180",
    steps: [
      "Poné un extremo de la barra en el rincón, cargá el otro y tomala con las dos manos frente al pecho.",
      "Girá el torso de un lado al otro llevando la barra en arco, con los brazos estirados.",
      "Mantené la cadera firme: el giro sale del abdomen.",
    ],
  },
  "Landmine_Linear_Jammer": {
    name: "Landmine jammer",
    steps: [
      "Barra en el rincón, tomala frente al hombro y ponete en posición de pie con los pies firmes.",
      "Empujá la barra hacia adelante y arriba hasta estirar los brazos.",
      "Volvé controlando al hombro.",
    ],
  },
  "Anti-Gravity_Press": {
    name: "Press antigravedad",
    steps: [
      "Acostate en un banco inclinado con la barra detrás de la cabeza, tomada con las palmas arriba.",
      "Empujá la barra hacia arriba y adelante hasta estirar los brazos.",
      "Bajá controlando detrás de la cabeza.",
    ],
  },
  "JM_Press": {
    name: "Press JM",
    steps: [
      "Acostate en el banco con la barra sobre el pecho y los codos cerca del torso.",
      "Bajá la barra hacia el cuello doblando los codos, sin que se vaya hacia los pies.",
      "Empujá extendiendo los codos y terminando el movimiento hacia arriba.",
    ],
    tip: "Es un híbrido entre press cerrado y extensión: se hace con poco peso y mucha técnica.",
  },
  "Pin_Presses": {
    name: "Press desde soportes",
    steps: [
      "Ajustá los soportes a la altura del pecho bajo y poné la barra ahí.",
      "Acostate, tomá la barra y empujá desde parado, sin impulso.",
      "Bajá hasta que la barra toque los soportes y repetí.",
    ],
  },
  "Bent_Over_One-Arm_Long_Bar_Row": {
    name: "Remo unilateral con barra",
    steps: [
      "Con un extremo de la barra en el rincón, inclinate y tomala con una mano.",
      "Tirá hacia la cadera juntando el omóplato.",
      "Bajá controlando y cambiá de lado.",
    ],
  },
  "Lying_Cambered_Barbell_Row": {
    name: "Remo acostado con barra",
    steps: [
      "Acostate boca abajo en un banco alto con la barra colgando debajo.",
      "Tirá la barra hacia el banco juntando los omóplatos.",
      "Bajá controlando hasta estirar los brazos.",
    ],
  },
  "Kneeling_Squat": {
    name: "Sentadilla de rodillas",
    steps: [
      "Arrodillate frente a un banco con la barra en la espalda alta.",
      "Llevá la cadera hacia atrás sentándote sobre los talones.",
      "Volvé apretando el glúteo sin arquear la espalda.",
    ],
  },
  "Weighted_Sissy_Squat": {
    name: "Sentadilla sissy con peso",
    steps: [
      "Sostené un disco al pecho y poné las puntas de los pies sobre un disco bajo.",
      "Llevá las rodillas hacia adelante inclinando el torso atrás, como una sola línea.",
      "Volvé extendiendo las rodillas.",
    ],
    tip: "Es dura para la rodilla: empezá sin peso y con poco recorrido.",
  },
  "Jefferson_Squats": {
    name: "Sentadilla Jefferson",
    steps: [
      "Poné la barra en el piso entre los pies, con un pie adelante y otro atrás.",
      "Agachate y tomala con una mano adelante y otra atrás.",
      "Subí la barra con la espalda recta y bajá controlando.",
    ],
  },
  "Power_Clean": {
    name: "Cargada de potencia",
    steps: [
      "Barra en el piso, pies al ancho de la cadera y brazos estirados.",
      "Tirá de la barra con la espalda recta y, cuando pase la rodilla, extendé la cadera con fuerza.",
      "Recibí la barra sobre los hombros con los codos altos y las rodillas semiflexionadas.",
    ],
    tip: "Se aprende con barra vacía: la velocidad la da la técnica, no el peso.",
  },
  "Front_Raise_And_Pullover": {
    name: "Elevación frontal y pullover",
    steps: [
      "Acostate en un banco con la barra sobre los muslos y las palmas hacia abajo.",
      "Subí la barra en arco hasta arriba de la cabeza con los brazos casi estirados.",
      "Bajá controlando hasta los muslos.",
    ],
  },
  "Incline_Barbell_Triceps_Extension": {
    name: "Extensión de tríceps inclinado con barra",
    steps: [
      "Acostate en un banco inclinado con la barra arriba de la cabeza y los brazos estirados.",
      "Doblá los codos bajando la barra detrás de la cabeza.",
      "Estirá los codos sin mover los hombros.",
    ],
  },
  "Standing_Overhead_Barbell_Triceps_Extension": {
    name: "Extensión de tríceps sobre la cabeza con barra",
    steps: [
      "De pie, barra arriba de la cabeza con las manos juntas y los codos apuntando al techo.",
      "Bajá la barra detrás de la cabeza doblando solo los codos.",
      "Estirá los codos sin abrir los brazos.",
    ],
    tip: "Apretá el abdomen: si la espalda se arquea, el peso es demasiado.",
  },
  "Seated_Barbell_Twist": {
    name: "Giro sentado con barra",
    steps: [
      "Sentate con la barra apoyada sobre los hombros y las manos sosteniéndola.",
      "Girá el torso de un lado al otro con la cadera quieta.",
      "Andá despacio y sin rebotes.",
    ],
  },
  "Barbell_Side_Bend": {
    name: "Inclinación lateral con barra",
    steps: [
      "De pie con la barra en la espalda alta, inclinate hacia un lado bajando la barra.",
      "Volvé al centro y repetí hacia el otro lado.",
      "No gires el torso: es solo inclinación.",
    ],
  },
  "EZ-Bar_Skullcrusher": {
    name: "Extensión de tríceps con barra Z",
    steps: [
      "Acostate en el banco con la barra Z sobre la frente y los brazos estirados.",
      "Bajá la barra hacia la frente doblando los codos, sin abrirlos.",
      "Estirá los codos controlando.",
    ],
    tip: "Si te molesta el codo, bajá detrás de la cabeza en vez de a la frente.",
  },
  "Close-Grip_EZ-Bar_Press": {
    name: "Press cerrado con barra Z",
    steps: [
      "Acostate en el banco y tomá la barra Z con las manos al ancho de los hombros.",
      "Bajá al pecho con los codos pegados al torso.",
      "Empujá hasta estirar los brazos.",
    ],
  },
  "Lying_Triceps_Press": {
    name: "Extensión de tríceps acostado",
    steps: [
      "Acostate con la barra Z sobre el pecho y los codos cerca.",
      "Llevá la barra hacia la frente doblando los codos.",
      "Volvé estirando sin mover los hombros.",
    ],
  },
};
