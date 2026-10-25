import type { Coach, GymClass, Plan } from "@/lib/types";

/**
 * ============================================================
 *  Contenido real de STRONG FITNESS GYM
 * ============================================================
 *  Se usa cuando Supabase todavía no está conectado (modo demo)
 *  y también como semilla del SQL.
 *  Ver: supabase/migrations/00002_seed.sql y 00003_datos_reales.sql
 *
 *  REGLA: acá no hay datos inventados. Lo que el gimnasio
 *  todavía no confirmó queda como "consultar" y no como un
 *  número de fantasía.
 * ============================================================
 */

export const demoClasses: GymClass[] = [
  {
    id: "cls_musculacion",
    slug: "musculacion",
    name_es: "Pesas y máquinas",
    name_en: "Weights & Machines",
    description_es:
      "Sala completa con máquinas modernas y pesas libres: pecho, espalda, pierna, tríceps, pantorrilla y abdominales. Entrás en el horario que quieras, sin reservar.",
    description_en:
      "A full floor of modern machines and free weights: chest, back, legs, triceps, calves and abs. Walk in whenever you like, no booking needed.",
    intensity: "medium",
    duration_min: 60,
    capacity: 40,
    color: "#0c0c0e",
    sort_order: 1,
    is_active: true,
  },
  {
    id: "cls_boxeo",
    slug: "boxeo",
    name_es: "Boxeo",
    name_en: "Boxing",
    description_es:
      "Clases de boxeo para todas las edades, con entrenador en cada sesión. Técnica, saco y acondicionamiento. Martes, miércoles y jueves, con tres horarios al día.",
    description_en:
      "Boxing classes for all ages, with a coach in every session. Technique, heavy bag and conditioning. Tuesday, Wednesday and Thursday, three time slots a day.",
    intensity: "high",
    duration_min: 60,
    capacity: 20,
    color: "#d81a22",
    sort_order: 2,
    is_active: true,
  },
  {
    id: "cls_zumba",
    slug: "zumba",
    name_es: "Zumba y bailoterapia",
    name_en: "Zumba & Dance Cardio",
    description_es:
      "Cardio bailando ritmos latinos. Quemás calorías sin aburrirte y en grupo. Consultá el horario vigente por WhatsApp.",
    description_en:
      "Dance cardio to Latin rhythms. Burn calories without getting bored, in a group. Ask for the current schedule on WhatsApp.",
    intensity: "medium",
    duration_min: 60,
    capacity: 30,
    color: "#8f0f15",
    sort_order: 3,
    is_active: true,
  },
];

/**
 * Entrenadores. El gimnasio todavía no nos pasó los nombres reales,
 * así que la lista va vacía: preferimos no mostrar la sección antes
 * que inventar personas. Cargalos acá (o en Supabase) y la sección
 * "Nuestro equipo" aparece sola.
 */
export const demoCoaches: Coach[] = [];

export const demoPlans: Plan[] = [
  {
    id: "pln_boxeo",
    slug: "boxeo",
    name_es: "Boxeo",
    name_en: "Boxing",
    tagline_es: "Para todas las edades, con entrenador",
    tagline_en: "All ages, coach included",
    price: 20,
    price_nio: null,
    period: "month",
    features_es: [
      "Martes, miércoles y jueves",
      "3 sesiones al día a elegir",
      "Entrenador en cada clase",
      "Para todas las edades",
    ],
    features_en: [
      "Tuesday, Wednesday and Thursday",
      "3 daily sessions to choose from",
      "A coach in every class",
      "Open to all ages",
    ],
    is_popular: true,
    sort_order: 1,
    is_active: true,
  },
  {
    id: "pln_dia",
    slug: "pase-del-dia",
    name_es: "Pase del día",
    name_en: "Day Pass",
    tagline_es: "Una visita para conocernos",
    tagline_en: "A single visit to try us out",
    price: null,
    price_nio: 40,
    period: "session",
    features_es: [
      "Una visita, sin compromiso",
      "Ideal para probar la sala",
      "Consultá el precio por WhatsApp",
    ],
    features_en: [
      "One visit, no commitment",
      "Great for trying the gym floor",
      "Ask for the price on WhatsApp",
    ],
    is_popular: false,
    sort_order: 2,
    is_active: true,
  },
  {
    id: "pln_semana",
    slug: "gimnasio-semanal",
    name_es: "Gimnasio semanal",
    name_en: "Weekly Gym",
    tagline_es: "Pesas y máquinas por una semana",
    tagline_en: "Weights and machines for one week",
    price: null,
    price_nio: 150,
    period: "week",
    features_es: [
      "Máquinas modernas y pesas libres",
      "Acceso en todo el horario de atención",
      "Orientación del personal para usar los equipos",
    ],
    features_en: [
      "Modern machines and free weights",
      "Access during all opening hours",
      "Staff guidance on how to use the equipment",
    ],
    is_popular: false,
    sort_order: 3,
    is_active: true,
  },
  {
    id: "pln_quincena",
    slug: "gimnasio-quincenal",
    name_es: "Gimnasio quincenal",
    name_en: "15-Day Gym",
    tagline_es: "Pesas y máquinas por 15 días",
    tagline_en: "Weights and machines for 15 days",
    price: null,
    price_nio: 280,
    period: "fortnight",
    features_es: [
      "Máquinas modernas y pesas libres",
      "Acceso en todo el horario de atención",
      "Orientación del personal para usar los equipos",
    ],
    features_en: [
      "Modern machines and free weights",
      "Access during all opening hours",
      "Staff guidance on how to use the equipment",
    ],
    is_popular: false,
    sort_order: 4,
    is_active: true,
  },
  {
    id: "pln_gimnasio",
    slug: "gimnasio-mensual",
    name_es: "Gimnasio mensual",
    name_en: "Monthly Gym",
    tagline_es: "Pesas y máquinas todo el mes",
    tagline_en: "Weights and machines all month",
    price: null,
    price_nio: 560,
    period: "month",
    features_es: [
      "Máquinas modernas y pesas libres",
      "Acceso en todo el horario de atención",
      "Orientación del personal para usar los equipos",
      "Consultá el precio por WhatsApp",
    ],
    features_en: [
      "Modern machines and free weights",
      "Access during all opening hours",
      "Staff guidance on how to use the equipment",
      "Ask for the price on WhatsApp",
    ],
    is_popular: false,
    sort_order: 5,
    is_active: true,
  },
];

/**
 * Galería de instalaciones. Las fotos son del local real y viven en
 * /public/images. Si cambiás una, mantené el mismo nombre de archivo.
 */
export const demoGallery = [
  { key: "sala2", src: "/images/sala2.jpg" },
  { key: "pesas", src: "/images/pesas.jpg" },
  { key: "sala1", src: "/images/sala1.jpg" },
  { key: "triceps", src: "/images/triceps.jpg" },
  { key: "pantorrilla", src: "/images/pantorrilla.jpg" },
  { key: "abs", src: "/images/abs.jpg" },
  { key: "dip", src: "/images/dip.jpg" },
] as const;

/** Suplementos y ropa que vende el gimnasio. */
export const demoSupplements = [
  "proteina",
  "creatina",
  "preentreno",
  "aminoacidos",
  "ganador",
  "ropa",
] as const;

export type SupplementKey = (typeof demoSupplements)[number];
