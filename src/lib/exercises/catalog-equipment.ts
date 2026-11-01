import type { SecondTranslation } from "./second-catalog.ts";

/**
 * Contenido en español del segundo catálogo: **mancuernas, máquinas, poleas y
 * pesas rusas**.
 *
 * Igual que en `catalog-barbell.ts`, acá sólo entra lo que un gimnasio usa de
 * verdad. Las variantes raras —agarres repetidos, ejercicios de competencia,
 * movimientos que necesitan equipo que no hay en la sala— se dejan afuera.
 */
export const DUMBBELL_ES: Record<string, SecondTranslation> = {
  "Dumbbell_Bench_Press_with_Neutral_Grip": {
    name: "Press de banca con mancuernas (agarre neutro)",
    steps: [
      "Acostate en el banco con una mancuerna en cada mano a la altura del pecho y las palmas mirándose.",
      "Empujá hacia arriba hasta estirar los brazos, sin chocar las mancuernas.",
      "Bajá controlando hasta sentir el estiramiento en el pecho.",
    ],
    tip: "El agarre neutro es más amable con el hombro que la barra.",
  },
  "Incline_Dumbbell_Flyes": {
    name: "Aperturas inclinadas con mancuernas",
    steps: [
      "Banco a unos 30 grados, mancuernas arriba con los codos algo flexionados.",
      "Abrí los brazos hasta la altura del pecho.",
      "Cerrá controlando. Trabaja la parte alta del pecho.",
    ],
  },
  "Around_The_Worlds": {
    name: "Aperturas en círculo (around the worlds)",
    steps: [
      "Acostate con las mancuernas arriba y los codos apenas flexionados.",
      "Bajá los brazos en arco hacia los costados hasta quedar a la altura del pecho.",
      "Volvé dibujando el mismo círculo, sin cambiar el ángulo de los codos.",
    ],
  },
  "Dumbbell_Incline_Row": {
    name: "Remo inclinado con mancuernas",
    steps: [
      "Apoyá el pecho en un banco inclinado con una mancuerna en cada mano colgando.",
      "Tirá las mancuernas hacia la cadera juntando los omóplatos.",
      "Bajá controlando.",
    ],
  },
  "Seated_Bent-Over_Rear_Delt_Raise": {
    name: "Elevación posterior sentado (deltoide posterior)",
    steps: [
      "Sentate al borde del banco e incliná el torso hasta casi tocar las rodillas con el pecho.",
      "Abrí los brazos a los lados con los codos apenas flexionados.",
      "Bajá controlando.",
    ],
  },
  "Seated_Triceps_Press": {
    name: "Press de tríceps sentado con mancuerna",
    steps: [
      "Sentate con una mancuerna tomada con las dos manos arriba de la cabeza.",
      "Bajá la mancuerna detrás de la cabeza doblando los codos.",
      "Estirá los codos sin abrir los brazos.",
    ],
  },
  "Stiff-Legged_Dumbbell_Deadlift": {
    name: "Peso muerto piernas rígidas con mancuernas",
    steps: [
      "De pie con las mancuernas frente a los muslos y las rodillas apenas flexionadas.",
      "Bajá llevando la cadera atrás y las mancuernas pegadas a las piernas.",
      "Subí apretando el glúteo sin arquear la espalda baja.",
    ],
  },
  "Plie_Dumbbell_Squat": {
    name: "Sentadilla plié con mancuerna",
    steps: [
      "Pies bien abiertos y puntas hacia afuera, con una mancuerna tomada con las dos manos.",
      "Bajá derecho con las rodillas abriéndose hacia los lados.",
      "Subí apretando el glúteo.",
    ],
  },
};

export const MACHINE_ES: Record<string, SecondTranslation> = {
  "Leverage_Chest_Press": {
    name: "Press de pecho en máquina de palanca",
    steps: [
      "Ajustá el asiento para que las manijas queden a la altura del pecho.",
      "Empujá hacia adelante hasta estirar los brazos sin trabar los codos.",
      "Volvé controlando.",
    ],
  },
  "Leverage_Incline_Chest_Press": {
    name: "Press inclinado en máquina de palanca",
    steps: [
      "Ajustá el asiento para que las manijas queden a la altura de la parte alta del pecho.",
      "Empujá hacia adelante y arriba.",
      "Volvé controlando.",
    ],
  },
  "Leverage_Shoulder_Press": {
    name: "Press de hombro en máquina de palanca",
    steps: [
      "Ajustá el asiento para que las manijas queden a la altura de los hombros.",
      "Empujá hacia arriba hasta estirar los brazos.",
      "Bajá controlando.",
    ],
  },
  "Leverage_High_Row": {
    name: "Remo alto en máquina de palanca",
    steps: [
      "Sentate con el pecho apoyado y tomá las manijas altas.",
      "Tirá hacia el pecho juntando los omóplatos.",
      "Volvé controlando.",
    ],
  },
  "Leverage_Iso_Row": {
    name: "Remo unilateral en máquina de palanca",
    steps: [
      "Sentate con el pecho apoyado y tomá la manija con un brazo.",
      "Tirá hacia la cadera llevando el codo atrás.",
      "Volvé controlando y cambiá de lado.",
    ],
  },
  "Leverage_Shrug": {
    name: "Encogimientos en máquina de palanca",
    steps: [
      "Ponete de pie en la máquina con los brazos estirados y las manijas a los costados.",
      "Subí los hombros hacia las orejas.",
      "Bajá controlando.",
    ],
  },
  "Leverage_Deadlift": {
    name: "Peso muerto en máquina de palanca",
    steps: [
      "Poné los pies en la plataforma y tomá las manijas con la espalda recta.",
      "Empujá con las piernas extendiendo la cadera.",
      "Volvé controlando sin redondear la espalda.",
    ],
  },
  "Lying_Machine_Squat": {
    name: "Sentadilla en máquina inclinada",
    steps: [
      "Apoyá la espalda en el respaldo y los hombros bajo las almohadillas.",
      "Bajá flexionando las rodillas hasta donde llegues cómodo.",
      "Empujá con los talones hasta estirar sin trabar.",
    ],
  },
  "Reverse_Hyperextension": {
    name: "Hiperextensión inversa",
    steps: [
      "Apoyá el torso en la máquina y sujetate de las manijas, con las piernas colgando.",
      "Subí las piernas extendiendo la cadera hasta que queden en línea con el torso.",
      "Bajá controlando.",
    ],
    tip: "Trabaja glúteo e isquiotibiales sin cargar la espalda baja.",
  },
  "Lying_T-Bar_Row": {
    name: "Remo en T acostado",
    steps: [
      "Apoyá el pecho en el banco con la barra colgando debajo.",
      "Tirá de la barra hacia el abdomen juntando los omóplatos.",
      "Bajá controlando.",
    ],
  },
  "Narrow_Stance_Hack_Squats": {
    name: "Hack squat con pies juntos",
    steps: [
      "Poné los pies juntos en la plataforma del hack squat.",
      "Bajá controlando con la espalda apoyada.",
      "Empujá con los talones sin que las rodillas se junten.",
    ],
  },
  "Smith_Machine_Close-Grip_Bench_Press": {
    name: "Press cerrado en máquina Smith",
    steps: [
      "Acostate en el banco bajo la barra guiada y tomala con las manos al ancho de los hombros.",
      "Bajá al pecho con los codos cerca del torso.",
      "Empujá hasta estirar los brazos.",
    ],
  },
  "Smith_Machine_Reverse_Calf_Raises": {
    name: "Gemelo invertido en máquina Smith",
    steps: [
      "Poné los talones en un escalón y la barra sobre los hombros.",
      "Subí las puntas de los pies, llevando los talones hacia abajo.",
      "Volvé controlando. Trabaja el tibial, la parte de adelante de la pierna.",
    ],
  },
  "Smith_Machine_Pistol_Squat": {
    name: "Sentadilla a una pierna en máquina Smith",
    steps: [
      "Poné un pie adelante bajo la barra y el otro atrás, sostenido apenas con la punta.",
      "Bajá con el peso en la pierna de adelante.",
      "Subí sin apoyarte en la barra.",
    ],
  },
  "Standing_Leg_Curl": {
    name: "Curl femoral de pie en máquina",
    steps: [
      "Apoyá el torso en la máquina y enganchá un tobillo en el rodillo.",
      "Doblá la rodilla llevando el talón al glúteo.",
      "Bajá controlando y cambiá de pierna.",
    ],
  },
  "Calf_Press": {
    name: "Gemelo en máquina de prensa",
    steps: [
      "Poné las puntas de los pies en el borde y empujá con los talones.",
      "Aguantá arriba un segundo.",
      "Volvé hasta estirar el gemelo.",
    ],
  },
};

export const CABLE_ES: Record<string, SecondTranslation> = {
  "Cable_Crossover": {
    name: "Cruces de polea",
    steps: [
      "Poné las poleas arriba, tomá una manija con cada mano y dá un paso adelante.",
      "Cerrá los brazos en arco frente al pecho, con los codos apenas flexionados.",
      "Volvé controlando hasta sentir el estiramiento.",
    ],
  },
  "Low_Cable_Crossover": {
    name: "Cruces de polea baja",
    steps: [
      "Poleas abajo, tomá las manijas y subí los brazos en arco hasta juntar las manos al pecho.",
      "Apretá el pecho arriba.",
      "Bajá controlando.",
    ],
  },
  "Single-Arm_Cable_Crossover": {
    name: "Cruce de polea a una mano",
    steps: [
      "Tomá una manija con una mano y dá un paso al costado para tensar el cable.",
      "Cerrá el brazo en arco frente al pecho.",
      "Volvé controlando y cambiá de lado.",
    ],
  },
  "Flat_Bench_Cable_Flyes": {
    name: "Aperturas en polea sobre banco plano",
    steps: [
      "Acostate en el banco con una manija en cada mano y los brazos abiertos.",
      "Cerrá los brazos en arco sobre el pecho.",
      "Volvé controlando.",
    ],
  },
  "Incline_Cable_Flye": {
    name: "Aperturas inclinadas en polea",
    steps: [
      "Banco inclinado entre las poleas bajas, con una manija en cada mano.",
      "Cerrá los brazos hacia arriba y al centro.",
      "Volvé controlando.",
    ],
  },
  "Incline_Cable_Chest_Press": {
    name: "Press inclinado en polea",
    steps: [
      "Banco inclinado de espaldas a las poleas, con las manijas a la altura del pecho.",
      "Empujá hacia arriba y adelante.",
      "Volvé controlando.",
    ],
  },
  "Wide-Grip_Lat_Pulldown": {
    name: "Jalón al pecho agarre amplio",
    steps: [
      "Sentate con los muslos bajo las almohadillas y tomá la barra bien abierta.",
      "Tirá hacia la parte alta del pecho llevando los codos abajo.",
      "Volvé controlando hasta estirar los brazos.",
    ],
    tip: "No tires detrás de la nuca: no suma y castiga el hombro.",
  },
  "V-Bar_Pulldown": {
    name: "Jalón con agarre en V",
    steps: [
      "Enganchá el agarre en V y sentate con los muslos fijos.",
      "Tirá hacia el pecho juntando los omóplatos.",
      "Volvé controlando.",
    ],
  },
  "Underhand_Cable_Pulldowns": {
    name: "Jalón agarre supino",
    steps: [
      "Tomá la barra con las palmas hacia vos y las manos al ancho de los hombros.",
      "Tirá hacia el pecho con los codos abajo y cerca.",
      "Volvé controlando.",
    ],
  },
  "Cable_Rear_Delt_Fly": {
    name: "Apertura posterior en polea",
    steps: [
      "Poné las poleas cruzadas a la altura del pecho y tomá la manija opuesta con cada mano.",
      "Abrí los brazos hacia atrás hasta la altura de los hombros.",
      "Volvé controlando.",
    ],
  },
  "Cable_Shrugs": {
    name: "Encogimientos en polea",
    steps: [
      "De pie frente a la polea baja con la barra tomada y los brazos estirados.",
      "Subí los hombros hacia las orejas.",
      "Bajá controlando.",
    ],
  },
  "Triceps_Pushdown_-_Rope_Attachment": {
    name: "Extensión de tríceps en polea con cuerda",
    steps: [
      "Tomá la cuerda y pegá los codos al torso.",
      "Estirá los codos separando las puntas de la cuerda al final.",
      "Volvé controlando.",
    ],
  },
  "Reverse_Grip_Triceps_Pushdown": {
    name: "Extensión de tríceps en polea agarre invertido",
    steps: [
      "Tomá la barra con las palmas hacia arriba.",
      "Estirá los codos hacia abajo sin mover los hombros.",
      "Volvé controlando.",
    ],
  },
  "Cable_Preacher_Curl": {
    name: "Curl predicador en polea",
    steps: [
      "Apoyá los brazos en el banco predicador frente a la polea baja.",
      "Subí doblando los codos.",
      "Bajá controlando hasta casi estirar.",
    ],
  },
  "High_Cable_Curls": {
    name: "Curl desde polea alta",
    steps: [
      "Ponete entre las poleas altas y tomá las manijas con las palmas arriba.",
      "Doblá los codos llevando las manos hacia la cabeza.",
      "Volvé controlando.",
    ],
  },
  "Standing_Cable_Wood_Chop": {
    name: "Leñador en polea",
    steps: [
      "Ponete de costado a la polea alta y tomá la manija con las dos manos.",
      "Bajá la manija en diagonal hacia la cadera opuesta girando el torso.",
      "Volvé controlando y cambiá de lado.",
    ],
  },
  "Cable_Russian_Twists": {
    name: "Giros rusos en polea",
    steps: [
      "Sentate de costado a la polea a la altura del pecho y tomá la manija.",
      "Girá el torso llevando las manos al lado opuesto.",
      "Volvé controlando y cambiá de lado.",
    ],
  },
  "Cable_Internal_Rotation": {
    name: "Rotación interna en polea",
    steps: [
      "Poné la polea a la altura del codo y el brazo pegado al torso, flexionado a 90 grados.",
      "Girá el antebrazo hacia el abdomen.",
      "Volvé controlando. Se hace liviano: es para el manguito rotador.",
    ],
  },
  "One-Legged_Cable_Kickback": {
    name: "Patada de glúteo en polea",
    steps: [
      "Enganchá el tobillo al cable bajo y apoyate en la máquina.",
      "Llevá la pierna atrás sin arquear la espalda baja.",
      "Volvé controlando y cambiá de pierna.",
    ],
  },
  "Cable_Hip_Adduction": {
    name: "Aducción de cadera en polea",
    steps: [
      "Enganchá el tobillo al cable bajo y ponete de costado a la polea.",
      "Cruzá la pierna por delante del cuerpo.",
      "Volvé controlando.",
    ],
  },
  "Standing_Cable_Lift": {
    name: "Levantamiento diagonal en polea",
    steps: [
      "Ponete de costado a la polea baja y tomá la manija con las dos manos.",
      "Subí la manija en diagonal hasta arriba del hombro contrario girando el torso.",
      "Volvé controlando.",
    ],
  },
};

export const KETTLEBELL_ES: Record<string, SecondTranslation> = {
  "Two-Arm_Kettlebell_Military_Press": {
    name: "Press militar con pesa rusa a dos manos",
    steps: [
      "Con la pesa a la altura del pecho y las dos manos tomándola por las asas.",
      "Empujá arriba hasta estirar los brazos.",
      "Bajá controlando al pecho.",
    ],
  },
  "Two-Arm_Kettlebell_Row": {
    name: "Remo con pesa rusa a dos manos",
    steps: [
      "Inclinate con la espalda recta y la pesa colgando.",
      "Tirá la pesa hacia el abdomen juntando los omóplatos.",
      "Bajá controlando.",
    ],
  },
  "Front_Squats_With_Two_Kettlebells": {
    name: "Sentadilla frontal con dos pesas rusas",
    steps: [
      "Apoyá las pesas en los hombros con los codos altos.",
      "Bajá con el torso vertical.",
      "Subí empujando con los talones.",
    ],
  },
  "One-Arm_Overhead_Kettlebell_Squats": {
    name: "Sentadilla con pesa arriba de la cabeza",
    steps: [
      "Subí la pesa arriba de la cabeza con un brazo estirado y el hombro firme.",
      "Bajá en sentadilla manteniendo la pesa estable arriba.",
      "Subí controlando.",
    ],
    tip: "Empezá con una pesa liviana: lo difícil es sostenerla arriba sin que se caiga.",
  },
  "Kettlebell_Dead_Clean": {
    name: "Cargada muerta con pesa rusa",
    steps: [
      "Con la pesa en el piso entre los pies, tomala con una mano.",
      "Subila al hombro en un solo movimiento, con el codo pegado al torso.",
      "Bajala controlando y repetí.",
    ],
  },
  "Kettlebell_Figure_8": {
    name: "Ocho con pesa rusa",
    steps: [
      "Con la pesa en una mano y las piernas algo abiertas, pasala entre las piernas dibujando un ocho.",
      "Recibila con la otra mano detrás de la pierna.",
      "Seguí el círculo sin parar, con las rodillas semiflexionadas.",
    ],
  },
};
