import type { Coach, GymClass, Plan } from "@/lib/types";

/**
 * Contenido de ejemplo. Se usa cuando Supabase todavía no está conectado
 * (modo demo) y también como semilla del SQL de Supabase.
 * Ver: supabase/migrations/00002_seed.sql
 */

export const demoClasses: GymClass[] = [
  {
    id: "cls_funcional",
    slug: "funcional",
    name_es: "Funcional",
    name_en: "Functional Training",
    description_es:
      "Trabajo de fuerza y resistencia con el peso del cuerpo, kettlebells, TRX y sogas. Mejora todo lo que necesitás para el día a día.",
    description_en:
      "Strength and endurance work with bodyweight, kettlebells, TRX and ropes. Builds everything you need for daily life.",
    intensity: "high",
    duration_min: 50,
    capacity: 18,
    color: "#cbf73f",
    sort_order: 1,
    is_active: true,
  },
  {
    id: "cls_cross",
    slug: "cross-training",
    name_es: "Cross Training",
    name_en: "Cross Training",
    description_es:
      "Circuitos de alta intensidad que combinan levantamiento, gimnasia y cardio. La clase más exigente del gimnasio.",
    description_en:
      "High-intensity circuits combining lifting, gymnastics and cardio. The toughest class we run.",
    intensity: "high",
    duration_min: 60,
    capacity: 16,
    color: "#ff5b26",
    sort_order: 2,
    is_active: true,
  },
  {
    id: "cls_spinning",
    slug: "spinning",
    name_es: "Spinning",
    name_en: "Spinning",
    description_es:
      "Pedaleo con música, luces y mucha energía. Quemá calorías y mejorá tu capacidad cardiovascular sin impacto en las rodillas.",
    description_en:
      "Pedal to music, lights and high energy. Burn calories and improve your cardio with zero impact on your knees.",
    intensity: "high",
    duration_min: 45,
    capacity: 24,
    color: "#38bdf8",
    sort_order: 3,
    is_active: true,
  },
  {
    id: "cls_hiit",
    slug: "hiit",
    name_es: "HIIT",
    name_en: "HIIT",
    description_es:
      "Intervalos cortos de máxima intensidad con descansos medidos. 40 minutos que rinden como dos horas.",
    description_en:
      "Short bursts of maximum intensity with measured rest. 40 minutes that pay off like two hours.",
    intensity: "high",
    duration_min: 40,
    capacity: 20,
    color: "#f472b6",
    sort_order: 4,
    is_active: true,
  },
  {
    id: "cls_boxeo",
    slug: "boxeo",
    name_es: "Boxeo",
    name_en: "Boxing",
    description_es:
      "Técnica, bolsa y guanteo controlado. Aprendés a moverte, ganás reflejos y descargás todo el estrés de la semana.",
    description_en:
      "Technique, heavy bag and controlled sparring. Learn to move, sharpen your reflexes and burn off the week's stress.",
    intensity: "high",
    duration_min: 55,
    capacity: 14,
    color: "#ef4444",
    sort_order: 5,
    is_active: true,
  },
  {
    id: "cls_zumba",
    slug: "zumba",
    name_es: "Zumba",
    name_en: "Zumba",
    description_es:
      "Coreografías de ritmos latinos para entrenar sin darte cuenta. La clase donde más te vas a reír.",
    description_en:
      "Latin rhythm choreographies that sneak the workout in. The class where you'll laugh the most.",
    intensity: "medium",
    duration_min: 45,
    capacity: 26,
    color: "#fbbf24",
    sort_order: 6,
    is_active: true,
  },
  {
    id: "cls_pilates",
    slug: "pilates",
    name_es: "Pilates",
    name_en: "Pilates",
    description_es:
      "Trabajo profundo de core, postura y respiración. Ideal si pasás muchas horas sentado o si estás volviendo de una lesión.",
    description_en:
      "Deep core work, posture and breathing. Ideal if you sit for long hours or are coming back from an injury.",
    intensity: "low",
    duration_min: 50,
    capacity: 16,
    color: "#a78bfa",
    sort_order: 7,
    is_active: true,
  },
  {
    id: "cls_yoga",
    slug: "yoga",
    name_es: "Yoga",
    name_en: "Yoga",
    description_es:
      "Posturas, respiración y estiramiento para cerrar el día. Bajá el ritmo, soltá la espalda y dormí mejor.",
    description_en:
      "Poses, breathing and stretching to close the day. Slow down, release your back and sleep better.",
    intensity: "low",
    duration_min: 60,
    capacity: 20,
    color: "#4ade80",
    sort_order: 8,
    is_active: true,
  },
  {
    id: "cls_stretching",
    slug: "stretching",
    name_es: "Stretching y movilidad",
    name_en: "Stretching & Mobility",
    description_es:
      "Rutina de movilidad articular y elongación guiada. La mejor manera de evitar lesiones y recuperarte más rápido.",
    description_en:
      "Joint mobility and guided stretching routine. The best way to avoid injuries and recover faster.",
    intensity: "low",
    duration_min: 45,
    capacity: 22,
    color: "#22d3ee",
    sort_order: 9,
    is_active: true,
  },
];

export const demoCoaches: Coach[] = [
  {
    id: "cch_diego",
    slug: "diego-farias",
    name: "Diego Farías",
    role_es: "Head Coach · Funcional y Cross",
    role_en: "Head Coach · Functional & Cross",
    bio_es:
      "Ex jugador de rugby y entrenador hace 12 años. Especialista en fuerza y acondicionamiento. Si querés resultados, Diego te los va a sacar.",
    bio_en:
      "Former rugby player and coach for 12 years. Strength and conditioning specialist. If you want results, Diego will get them out of you.",
    specialties: ["funcional", "cross-training"],
    initials: "DF",
    color: "#cbf73f",
    sort_order: 1,
    is_active: true,
  },
  {
    id: "cch_sofia",
    slug: "sofia-mendez",
    name: "Sofía Méndez",
    role_es: "Spinning e HIIT",
    role_en: "Spinning & HIIT",
    bio_es:
      "Instructora de ciclismo indoor certificada. Sus clases tienen lista de espera todos los martes: la energía que pone es difícil de igualar.",
    bio_en:
      "Certified indoor cycling instructor. Her classes have a waiting list every Tuesday: her energy is hard to match.",
    specialties: ["spinning", "hiit"],
    initials: "SM",
    color: "#38bdf8",
    sort_order: 2,
    is_active: true,
  },
  {
    id: "cch_nicolas",
    slug: "nicolas-ruiz",
    name: "Nicolás Ruiz",
    role_es: "Boxeo",
    role_en: "Boxing",
    bio_es:
      "Boxeador amateur con 40 peleas y entrenador de la escuela juvenil del club. Enseña técnica desde cero, sin apuro.",
    bio_en:
      "Amateur boxer with 40 fights and coach of the club's youth school. Teaches technique from scratch, no rush.",
    specialties: ["boxeo", "funcional"],
    initials: "NR",
    color: "#ef4444",
    sort_order: 3,
    is_active: true,
  },
  {
    id: "cch_valentina",
    slug: "valentina-sosa",
    name: "Valentina Sosa",
    role_es: "Yoga y Pilates",
    role_en: "Yoga & Pilates",
    bio_es:
      "Kinesióloga y profesora de yoga. Trabaja con rehabilitación postural y adapta cada postura a tu cuerpo.",
    bio_en:
      "Physiotherapist and yoga teacher. She works with postural rehab and adapts every pose to your body.",
    specialties: ["yoga", "pilates", "stretching"],
    initials: "VS",
    color: "#4ade80",
    sort_order: 4,
    is_active: true,
  },
  {
    id: "cch_marcos",
    slug: "marcos-leiva",
    name: "Marcos Leiva",
    role_es: "Zumba y Stretching",
    role_en: "Zumba & Stretching",
    bio_es:
      "Bailarín y profesor de danza. Hace que la clase más divertida sea también la que más te hace transpirar.",
    bio_en:
      "Dancer and dance teacher. He makes the most fun class also the one that makes you sweat the most.",
    specialties: ["zumba", "stretching"],
    initials: "ML",
    color: "#fbbf24",
    sort_order: 5,
    is_active: true,
  },
  {
    id: "cch_julieta",
    slug: "julieta-barrios",
    name: "Julieta Barrios",
    role_es: "Funcional y HIIT",
    role_en: "Functional & HIIT",
    bio_es:
      "Profesora de educación física y atleta de crossfit. Especialista en entrenamiento para principiantes y embarazadas.",
    bio_en:
      "Physical education teacher and crossfit athlete. Specialist in training for beginners and pregnant members.",
    specialties: ["funcional", "hiit", "cross-training"],
    initials: "JB",
    color: "#f472b6",
    sort_order: 6,
    is_active: true,
  },
];

export const demoPlans: Plan[] = [
  {
    id: "pln_basico",
    slug: "basico",
    name_es: "Básico",
    name_en: "Basic",
    tagline_es: "Para arrancar y armar el hábito",
    tagline_en: "To get started and build the habit",
    price: 25,
    period: "month",
    features_es: [
      "3 clases dirigidas por semana",
      "Acceso a la sala de musculación",
      "Evaluación física inicial",
      "Sin matrícula ni contrato",
    ],
    features_en: [
      "3 instructor-led classes per week",
      "Access to the weights room",
      "Initial fitness assessment",
      "No joining fee, no contract",
    ],
    is_popular: false,
    sort_order: 1,
    is_active: true,
  },
  {
    id: "pln_full",
    slug: "full",
    name_es: "Full",
    name_en: "Full",
    tagline_es: "Clases ilimitadas y musculación 24/7",
    tagline_en: "Unlimited classes and 24/7 weights room",
    price: 39,
    period: "month",
    features_es: [
      "Clases dirigidas ilimitadas",
      "Acceso 24/7 con llave digital",
      "Plan de entrenamiento personalizado",
      "Seguimiento mensual con tu profe",
      "1 invitado por mes, sin cargo",
    ],
    features_en: [
      "Unlimited instructor-led classes",
      "24/7 access with digital key",
      "Personalised training plan",
      "Monthly check-in with your coach",
      "1 free guest pass per month",
    ],
    is_popular: true,
    sort_order: 2,
    is_active: true,
  },
  {
    id: "pln_duo",
    slug: "duo",
    name_es: "Dúo",
    name_en: "Duo",
    tagline_es: "Dos personas, un precio, mismos beneficios",
    tagline_en: "Two people, one price, same benefits",
    price: 65,
    period: "month",
    features_es: [
      "Todo lo del plan Full para 2 personas",
      "Ideal para parejas, hermanos o amigos",
      "Congelá el plan hasta 30 días por año",
      "Vestuarios y lockers individuales",
    ],
    features_en: [
      "Everything in the Full plan for 2 people",
      "Ideal for couples, siblings or friends",
      "Freeze your plan up to 30 days a year",
      "Locker rooms and individual lockers",
    ],
    is_popular: false,
    sort_order: 3,
    is_active: true,
  },
  {
    id: "pln_personal",
    slug: "personal-trainer",
    name_es: "Personal Trainer",
    name_en: "Personal Trainer",
    tagline_es: "Entrenamiento 1 a 1 con profe exclusivo",
    tagline_en: "One-on-one training with a dedicated coach",
    price: 99,
    period: "month",
    features_es: [
      "8 sesiones personales al mes",
      "Plan y dieta derivada a nutricionista",
      "Clases grupales incluidas",
      "Mediciones y control de progreso cada 2 semanas",
    ],
    features_en: [
      "8 personal sessions per month",
      "Training plan plus nutritionist referral",
      "Group classes included",
      "Measurements and progress tracking every 2 weeks",
    ],
    is_popular: false,
    sort_order: 4,
    is_active: true,
  },
];

/** Galería: se muestran como bloques de color si no hay fotos cargadas. */
export const demoGallery = [
  { key: "studio", accent: "#cbf73f" },
  { key: "weights", accent: "#ff5b26" },
  { key: "functional", accent: "#38bdf8" },
  { key: "lockers", accent: "#a78bfa" },
] as const;
