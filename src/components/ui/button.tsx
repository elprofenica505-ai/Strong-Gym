import Link from "next/link";
import type { ComponentPropsWithoutRef, ReactNode } from "react";
import { cn } from "@/lib/utils";

type Variant = "primary" | "outline" | "ghost" | "dark" | "flame";
type Size = "sm" | "md" | "lg";

const base =
  "inline-flex items-center justify-center gap-2 font-semibold tracking-tight transition-all duration-200 " +
  "disabled:cursor-not-allowed disabled:opacity-50 select-none whitespace-nowrap " +
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-volt focus-visible:ring-offset-2 focus-visible:ring-offset-void";

const variants: Record<Variant, string> = {
  primary:
    "bg-volt text-ink hover:bg-volt-600 active:scale-[0.98] shadow-[0_10px_30px_-12px_rgba(203,247,63,0.7)]",
  outline:
    "border border-white/20 text-chalk hover:border-volt/70 hover:text-volt hover:bg-volt/5 active:scale-[0.98]",
  ghost: "text-mist hover:text-chalk hover:bg-white/5",
  dark: "bg-card-2 text-chalk border border-line hover:border-white/25 hover:bg-card active:scale-[0.98]",
  flame:
    "bg-flame text-white hover:brightness-110 active:scale-[0.98] shadow-[0_10px_30px_-12px_rgba(255,91,38,0.7)]",
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
