import type { SupabaseClient } from "@supabase/supabase-js";

export type ProfileStatus = "ready" | "missing" | "error";
export type UserRole = "member" | "staff" | "admin";

export interface AuthUser {
  id: string;
  email: string;
  fullName: string;
  // Un perfil que no se pudo leer NO equivale a un socio sin permisos.
  role: UserRole | null;
  profileStatus: ProfileStatus;
  phone: string | null;
  planId: string | null;
  createdAt: string;
  isDemo: false;
}

/** Misma regla para el guard del servidor y la navegación del cliente. */
export function canAccessPanel(user: { role: unknown } | null | undefined): boolean {
  return user?.role === "admin" || user?.role === "staff";
}

/** Sólo usa la identidad verificada y public.profiles; nunca roles del JWT/metadata/email. */
export async function resolveCurrentUser(supabase: SupabaseClient): Promise<AuthUser | null> {
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return null;

  const result: AuthUser = {
    id: user.id,
    email: user.email ?? "",
    fullName: (user.user_metadata?.full_name as string | undefined) ?? user.email?.split("@")[0] ?? "Socio",
    role: null,
    profileStatus: "error",
    phone: null,
    planId: null,
    createdAt: user.created_at,
    isDemo: false,
  };

  try {
    const { data: profile, error } = await supabase
      .from("profiles")
      .select("id, email, full_name, role, phone, plan_id, created_at")
      .eq("id", user.id)
      .maybeSingle();

    if (error) {
      // No registrar tokens, cookies, claves ni el contenido del perfil.
      console.error("[auth/profile] No se pudo leer public.profiles", { code: error.code });
      return result;
    }
    if (!profile) return { ...result, profileStatus: "missing" };
    if (!["member", "staff", "admin"].includes(profile.role)) {
      console.error("[auth/profile] Rol inválido en public.profiles");
      return result;
    }

    return {
      ...result,
      email: user.email ?? profile.email ?? "",
      fullName: profile.full_name ?? result.fullName,
      role: profile.role,
      profileStatus: "ready",
      phone: profile.phone ?? null,
      planId: profile.plan_id ?? null,
      createdAt: profile.created_at ?? user.created_at,
    };
  } catch {
    console.error("[auth/profile] Falló la conexión al leer public.profiles");
    return result;
  }
}
