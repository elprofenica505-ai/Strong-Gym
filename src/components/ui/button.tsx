import Link from "next/link";
import type { ComponentPropsWithoutRef, ReactNode } from "react";
import { cn } from "@/lib/utils";

type Variant = "primary" | "outline" | "outline-dark" | "ghost" | "dark" | "white";
type Size = "sm" | "md" | "lg";

const base =
  "inline-flex items-center justify-center gap-2 font-semibold tracking-tight transition-all duration-200 " +
  "disabled:cursor-not-allowed disabled:opacity-50 select-none whitespace-nowrap " +
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2";

const variants: Record<Variant, string> = {
  /** Rojo de marca. La acción principal en todo el sitio. */
  primary:
    "bg-brand text-onbrand hover:bg-brand-600 active:scale-[0.98] shadow-[0_10px_30px_-12px_rgba(216,26,34,0.65)]",
  /** Sobre fondo claro. */
  outline:
    "border border-ink/15 text-ink hover:border-brand hover:text-brand hover:bg-brand-soft active:scale-[0.98]",
  /** Sobre la portada o el pie, que son negros. */
  "outline-dark":
    "border border-white/25 text-white hover:border-brand hover:bg-brand/15 active:scale-[0.98]",
  ghost: "text-mist hover:text-ink hover:bg-ink/5",
  /** Negro sólido: contraste fuerte sobre superficies rojas o claras. */
  dark: "bg-night text-white hover:bg-night-2 active:scale-[0.98]",
  /** Blanco sólido: para usar encima del rojo. */
  white: "bg-white text-ink hover:bg-white/90 active:scale-[0.98]",
};

const sizes: Record<Size, string> = {
  sm: "h-9 px-4 text-[0.8125rem] rounded-full",
  md: "h-11 px-5 text-[0.875rem] rounded-full",
  lg: "h-13 px-7 text-[0.9375rem] rounded-full",
};

export interface ButtonProps extends ComponentPropsWithoutRef<"button"> {
  variant?: Variant;
  size?: Size;
  children: ReactNode;
}

export function Button({
  variant = "primary",
  size = "md",
  className,
  children,
  ...props
}: ButtonProps) {
  return (
    <button className={cn(base, variants[variant], sizes[size], className)} {...props}>
      {children}
    </button>
  );
}

export interface ButtonLinkProps extends ComponentPropsWithoutRef<typeof Link> {
  variant?: Variant;
  size?: Size;
  children: ReactNode;
}

export function ButtonLink({
  variant = "primary",
  size = "md",
  className,
  children,
  ...props
}: ButtonLinkProps) {
  return (
    <Link className={cn(base, variants[variant], sizes[size], className)} {...props}>
      {children}
    </Link>
  );
}
