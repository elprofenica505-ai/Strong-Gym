import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { Reveal } from "./reveal";

/** Encabezado de sección: eyebrow + título grande + bajada. */
export function SectionHeading({
  eyebrow,
  title,
  subtitle,
  align = "left",
  className,
  light,
}: {
  eyebrow?: string;
  title: ReactNode;
  subtitle?: ReactNode;
  align?: "left" | "center";
  className?: string;
  light?: boolean;
}) {
  return (
    <Reveal
      className={cn(
        "flex flex-col gap-4",
        align === "center" && "items-center text-center",
        className,
      )}
    >
      {eyebrow ? (
        <span className="eyebrow">
          <span className="h-px w-6 bg-volt" aria-hidden="true" />
          {eyebrow}
        </span>
      ) : null}

      <h2
        className={cn(
          "display-xl max-w-3xl text-[2rem] leading-[0.92] sm:text-[2.75rem] lg:text-[3.5rem]",
          light ? "text-ink" : "text-chalk",
        )}
      >
        {title}
      </h2>

      {subtitle ? (
        <p
          className={cn(
            "max-w-2xl text-[0.9375rem] leading-relaxed sm:text-base",
            light ? "text-ink/70" : "text-fog",
          )}
        >
          {subtitle}
        </p>
      ) : null}
    </Reveal>
  );
}

/** Bloque de sección con espaciado consistente. */
export function Section({
  children,
  id,
  className,
  container = true,
}: {
  children: ReactNode;
  id?: string;
  className?: string;
  container?: boolean;
}) {
  return (
    <section id={id} className={cn("relative py-16 sm:py-20 lg:py-28", className)}>
      {container ? <div className="container-x">{children}</div> : children}
    </section>
  );
}
