import Link from "next/link";
import { Dumbbell } from "lucide-react";
import { cn } from "@/lib/utils";

export function Logo({
  locale,
  name,
  className,
  compact = false,
}: {
  locale: string;
  name?: string;
  className?: string;
  compact?: boolean;
}) {
  return (
    <Link
      href={`/${locale}`}
      aria-label={name ?? "Strong Gym"}
      className={cn("group flex items-center gap-2.5", className)}
    >
      <span className="relative grid size-9 shrink-0 place-items-center rounded-xl bg-volt text-ink transition-transform duration-300 group-hover:-rotate-6 sm:size-10">
        <Dumbbell className="size-4.5 sm:size-5" strokeWidth={2.5} aria-hidden="true" />
      </span>

      {!compact ? (
        <span className="display-xl flex items-baseline text-[1.125rem] tracking-tight text-chalk sm:text-[1.25rem]">
          Strong
          <span className="text-volt">.</span>
          <span className="text-fog">Gym</span>
        </span>
      ) : null}
    </Link>
  );
}
