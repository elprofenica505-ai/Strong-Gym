import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { isAdminRole } from "@/lib/auth/current-user";
import {
  ScheduleBoard,
  type ScheduleBoardData,
} from "@/components/admin/schedule-board";
import { type ScheduleBlock } from "@/components/admin/schedule-blocks";
import { DataUnavailable } from "@/components/ui/data-unavailable";
import { getCurrentUser } from "@/lib/data/queries";
import { isLocale } from "@/i18n/config";
import { SectionHeading } from "@/components/ui/section";
import { DEMO_MODE, isSupabaseConfigured } from "@/lib/supabase/env";
import { getSupabaseServerClient } from "@/lib/supabase/server";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  if (!isLocale(locale)) return {};
  return {
    title: "Horarios y clases",
    robots: { index: false, follow: false },
  };
}

const emptyBoard: ScheduleBoardData = {
  slots: [],
  classes: [],
  coaches: [],
  weeks: [],
};

export default async function HorariosPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale: rawLocale } = await params;
  const locale = isLocale(rawLocale) ? rawLocale : "es";
  const user = await getCurrentUser();

  if (!DEMO_MODE && (!isAdminRole(user?.role) || user?.mfa !== "ok")) {
    redirect(`/${locale}/panel`);
  }

  const today = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Managua",
  }).format(new Date());
  let board: ScheduleBoardData = emptyBoard;
  let blocks: ScheduleBlock[] = [];
  let failed = false;
  if (DEMO_MODE) {
    board = emptyBoard;
  } else if (!isSupabaseConfigured) {
    failed = true;
  } else {
    const supabase = await getSupabaseServerClient();
    if (!supabase) failed = true;
    else {
      const { data, error } = await supabase
        .rpc("admin_schedule_board")
        .abortSignal(AbortSignal.timeout(15000));
      if (error || !data) failed = true;
      else {
        board = data as ScheduleBoardData;
        const list = await supabase
          .rpc("admin_schedule_blocks")
          .abortSignal(AbortSignal.timeout(15000));
        if (!list.error && Array.isArray(list.data)) {
          blocks = list.data as ScheduleBlock[];
        }
      }
    }
  }

  return (
    <>
      <section className="relative overflow-hidden border-b border-brand/25 bg-cloud pt-10 pb-8 sm:pt-12 sm:pb-10">
        <div className="container-x relative">
          <Link
            href={`/${locale}/panel/administracion`}
            className="mb-5 inline-grid size-10 place-items-center rounded-full border border-line text-mist hover:border-brand hover:text-ink"
            aria-label="Volver a Administración"
          >
            <ArrowLeft className="size-4" />
          </Link>
          <SectionHeading
            eyebrow="Administración · Horarios y clases"
            title="Horarios y clases"
            subtitle="Armá tu semana fija, pasala al calendario y cerrá los días que no abrís. Cada paso te muestra qué va a pasar antes de guardar."
          />
        </div>
      </section>
      <section className="py-8 sm:py-10">
        <div className="container-x">
          {DEMO_MODE ? (
            <p className="rounded-xl border border-brand/30 bg-brand/[0.06] px-4 py-3 text-[0.8125rem] text-mist">
              Modo demo: cargar horarios requiere Supabase conectado.
            </p>
          ) : failed ? (
            <DataUnavailable locale={locale} code="SCHEDULE_UNCONFIRMED" />
          ) : (
            <ScheduleBoard
              initial={board}
              initialBlocks={blocks}
              today={today}
            />
          )}
        </div>
      </section>
    </>
  );
}
