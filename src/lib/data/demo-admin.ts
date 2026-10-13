import { getWeekRange, gymNow } from "@/lib/schedule";
import type { ContactMessage } from "@/lib/types";
import type { AdminBookingRow, AdminClassRow } from "@/components/admin/admin-panel";
import { demoClasses } from "./demo-content";
import { generateWeekSessions } from "./demo-sessions";

/**
 * Datos de ejemplo del panel de administración.
 * Sirven para mostrar cómo se ve el panel antes de conectar Supabase.
 */

const memberNames = [
  ["Camila", "Rodríguez"],
  ["Martín", "Aguirre"],
  ["Lucía", "Pereyra"],
  ["Franco", "Gómez"],
  ["Sofía", "Martínez"],
  ["Julián", "Fernández"],
  ["Agustina", "López"],
  ["Nicolás", "Silva"],
  ["Valentina", "Torres"],
  ["Emiliano", "Ruiz"],
  ["Martina", "Sosa"],
  ["Tomás", "Benítez"],
  ["Julieta", "Acosta"],
  ["Santiago", "Medina"],
  ["Florencia", "Herrera"],
  ["Bruno", "Castillo"],
] as const;

function hash(value: string): number {
  let h = 2166136261;
  for (let i = 0; i < value.length; i++) {
    h ^= value.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function emailFor(first: string, last: string): string {
  const clean = (value: string) =>
    value
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase();

  // example.com es el dominio reservado para ejemplos: deja claro que
  // estos socios son de prueba y no corresponden a personas reales.
  return `${clean(first)}.${clean(last)}@example.com`;
}

export function demoAdminBookings(): AdminBookingRow[] {
  const sessions = generateWeekSessions(getWeekRange());
  const rows: AdminBookingRow[] = [];

  sessions.forEach((session, sessionIndex) => {
    // Tantos socios anotados como la ocupación simulada de la clase.
    const count = Math.min(4, Math.max(1, Math.round(session.bookedCount / 5)));

    for (let i = 0; i < count; i++) {
      const seed = hash(`${session.id}-${i}`);
      const [first, last] = memberNames[(seed + i) % memberNames.length];
      const name = `${first} ${last}`;

      rows.push({
        id: `demo-bk-${sessionIndex}-${i}`,
        memberName: name,
        memberEmail: emailFor(first, last),
        status: "confirmed",
        createdAt: new Date(
          new Date(session.starts_at).getTime() - (seed % 48) * 3_600_000,
        ).toISOString(),
        className: session.gymClass.name_es,
        classColor: session.gymClass.color,
        room: session.room,
        coachName: session.coach?.name ?? null,
        startsAt: session.starts_at,
        sessionId: session.id,
      });
    }
  });

  // Las primeras del día actual quedan marcadas como asistidas.
  const now = gymNow();
  return rows
    .map((row) => (new Date(row.startsAt) < now ? { ...row, status: "attended" as const } : row))
    .sort((a, b) => new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime());
}

export function demoAdminClasses(): AdminClassRow[] {
  const sessions = generateWeekSessions(getWeekRange());

  return demoClasses.map((gymClass) => ({
    id: gymClass.id,
    name: gymClass.name_es,
    slug: gymClass.slug,
    color: gymClass.color,
    capacity: gymClass.capacity,
    duration: gymClass.duration_min,
    intensity: gymClass.intensity,
    isActive: gymClass.is_active,
    sessionsThisWeek: sessions.filter((s) => s.class_id === gymClass.id).length,
  }));
}

export function demoAdminMessages(): ContactMessage[] {
  const now = gymNow();
  const hoursAgo = (hours: number) => new Date(now.getTime() - hours * 3_600_000).toISOString();

  return [
    {
      id: "msg_demo_1",
      name: "Andrea Solís",
      email: "andrea.solis@example.com",
      phone: "+505 8712 4490",
      subject: "trial",
      message:
        "¡Buenas! Quiero aprovechar la clase de prueba gratis. ¿Puedo ir un martes por la tarde a probar funcional? Nunca entrené con pesas.",
      locale: "es",
      is_read: false,
      created_at: hoursAgo(3),
    },
    {
      id: "msg_demo_2",
      name: "Kevin Ramírez",
      email: "kevin.ramirez@example.com",
      phone: null,
      subject: "plans",
      message:
        "Consulto por el plan Full: ¿incluye el acceso 24/7 desde el primer mes? Y si me quiero dar de baja, ¿hay que avisar con antelación?",
      locale: "es",
      is_read: false,
      created_at: hoursAgo(19),
    },
    {
      id: "msg_demo_3",
      name: "Martha Gutiérrez",
      email: "martha.g@example.com",
      phone: "+505 8890 1123",
      subject: "corporate",
      message:
        "Trabajo en una empresa de 25 personas y nos interesaría un convenio corporativo. ¿Manejan descuentos por volumen?",
      locale: "es",
      is_read: true,
      created_at: hoursAgo(52),
    },
    {
      id: "msg_demo_4",
      name: "Bryan Ortega",
      email: "bryan.ortega@example.com",
      phone: null,
      subject: "info",
      message:
        "Hola, ¿tienen clases de boxeo para principiantes los fines de semana? Busco algo los sábados a la mañana.",
      locale: "es",
      is_read: true,
      created_at: hoursAgo(74),
    },
  ];
}
