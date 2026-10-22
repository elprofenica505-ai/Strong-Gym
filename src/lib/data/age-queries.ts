import { getSupabaseServerClient } from "@/lib/supabase/server";

export type AgeStatus = "adult" | "minor" | "unknown";

/** Edad de la cuenta en sesión (00047). Un error se propaga para que la página cierre el acceso. */
export async function getMyAgeStatus(): Promise<AgeStatus> {
  const supabase = await getSupabaseServerClient();
  if (!supabase) throw new Error("NO_CLIENT");
  const { data, error } = await supabase.rpc("my_age_status");
  if (error) throw new Error(error.code ?? "AGE_STATUS");
  return data === "adult" || data === "minor" ? data : "unknown";
}
