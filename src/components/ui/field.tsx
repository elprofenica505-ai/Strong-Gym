"use client";

import type { ComponentPropsWithoutRef, ReactNode } from "react";
import { useId } from "react";
import { cn } from "@/lib/utils";

const controlBase =
  "w-full rounded-xl border bg-paper/60 px-4 text-ink placeholder:text-fog/50 " +
  "transition-colors focus:outline-none focus:ring-0 " +
  "border-line focus:border-brand/70 disabled:opacity-60";

function Wrapper({
  label,
  hint,
  error,
  children,
  htmlFor,
  className,
}: {
  label?: string;
  hint?: string;
  error?: string;
  children: ReactNode;
  htmlFor: string;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      {label ? (
        <label
          htmlFor={htmlFor}
          className="text-[0.8125rem] font-medium tracking-wide text-mist"
        >
          {label}
        </label>
      ) : null}

      {children}

      {error ? (
        <p className="text-[0.75rem] font-medium text-alert" role="alert">
          {error}
        </p>
      ) : hint ? (
        <p className="text-[0.75rem] text-fog">{hint}</p>
      ) : null}
    </div>
  );
}

export interface InputProps extends ComponentPropsWithoutRef<"input"> {
  label?: string;
  hint?: string;
  error?: string;
  wrapperClassName?: string;
}

export function Input({ label, hint, error, wrapperClassName, className, id, ...props }: InputProps) {
  const generated = useId();
  const inputId = id ?? generated;

  return (
    <Wrapper
      label={label}
      hint={hint}
      error={error}
      htmlFor={inputId}
      className={wrapperClassName}
    >
      <input
        id={inputId}
        className={cn(
          controlBase,
          "h-12",
          error && "border-alert/70 focus:border-alert",
          className,
        )}
        aria-invalid={error ? true : undefined}
        {...props}
      />
    </Wrapper>
  );
}

export interface TextareaProps extends ComponentPropsWithoutRef<"textarea"> {
  label?: string;
  hint?: string;
  error?: string;
  wrapperClassName?: string;
}

export function Textarea({
  label,
  hint,
  error,
  wrapperClassName,
  className,
  id,
  rows = 5,
  ...props
}: TextareaProps) {
  const generated = useId();
  const inputId = id ?? generated;

  return (
    <Wrapper
      label={label}
      hint={hint}
      error={error}
      htmlFor={inputId}
      className={wrapperClassName}
    >
      <textarea
        id={inputId}
        rows={rows}
        className={cn(
          controlBase,
          "resize-y py-3 leading-relaxed",
          error && "border-alert/70 focus:border-alert",
          className,
        )}
        aria-invalid={error ? true : undefined}
        {...props}
      />
    </Wrapper>
  );
}

export interface SelectProps extends ComponentPropsWithoutRef<"select"> {
  label?: string;
  hint?: string;
  error?: string;
  wrapperClassName?: string;
  children: ReactNode;
}

export function Select({
  label,
  hint,
  error,
  wrapperClassName,
  className,
  id,
  children,
  ...props
}: SelectProps) {
  const generated = useId();
  const inputId = id ?? generated;

  return (
    <Wrapper
      label={label}
      hint={hint}
      error={error}
      htmlFor={inputId}
      className={wrapperClassName}
    >
      <select
        id={inputId}
        className={cn(controlBase, "h-12 appearance-none pr-10", error && "border-alert/70", className)}
        style={{
          backgroundImage:
            "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='16' height='16' viewBox='0 0 24 24' fill='none' stroke='%2398a1b0' stroke-width='2.5' stroke-linecap='round'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E\")",
          backgroundRepeat: "no-repeat",
          backgroundPosition: "right 1rem center",
        }}
        aria-invalid={error ? true : undefined}
        {...props}
      >
        {children}
      </select>
    </Wrapper>
  );
}

/** Casilla de verificación con etiqueta a la derecha. */
export function Checkbox({
  label,
  className,
  id,
  ...props
}: ComponentPropsWithoutRef<"input"> & { label: ReactNode }) {
  const generated = useId();
  const inputId = id ?? generated;

  return (
    <label
      htmlFor={inputId}
      className={cn("flex cursor-pointer items-start gap-3 text-[0.875rem] text-mist", className)}
    >
      <input
        id={inputId}
        type="checkbox"
        className="mt-0.5 size-4 shrink-0 cursor-pointer appearance-none rounded border border-line bg-paper checked:border-brand checked:bg-brand"
        style={{
          backgroundImage:
            "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%230a0c07' stroke-width='4' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M20 6 9 17l-5-5'/%3E%3C/svg%3E\")",
          backgroundRepeat: "no-repeat",
          backgroundPosition: "center",
        }}
        {...props}
      />
      <span>{label}</span>
    </label>
  );
}
