import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export function Badge({
  children,
  className,
  dot,
}: {
  children: ReactNode;
  className?: string;
  dot?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border border-line bg-card px-3 py-1 text-[0.6875rem] font-semibold uppercase tracking-[0.12em] text-mist",
        className,
      )}
    >
      {dot ? (
        <span
          className="size-1.5 shrink-0 rounded-full"
          style={{ backgroundColor: dot }}
          aria-hidden="true"
        />
      ) : null}
      {children}
    </span>
  );
}

/** Etiqueta con el color de la disciplina. */
export function ColorTag({
  label,
  color,
  className,
}: {
  label: string;
  color: string;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[0.6875rem] font-semibold uppercase tracking-[0.1em]",
        className,
      )}
      style={{
        color,
        backgroundColor: `${color}1f`,
        boxShadow: `inset 0 0 0 1px ${color}40`,
      }}
    >
      {label}
    </span>
  );
}
