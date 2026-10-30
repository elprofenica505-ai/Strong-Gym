/**
 * Un paso numerado de la pantalla de horarios. Compartido para que los cuatro
 * pasos se vean iguales sin repetir el marcado en cada componente.
 */
export function AdminStep({
  number,
  title,
  hint,
  children,
}: {
  number: number;
  title: string;
  hint: string;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-4 rounded-2xl border border-line bg-card p-4">
      <div className="flex gap-3">
        <span
          aria-hidden="true"
          className="mt-0.5 grid size-8 shrink-0 place-items-center rounded-full bg-brand text-[0.875rem] font-bold text-white"
        >
          {number}
        </span>
        <div className="min-w-0">
          <h2 className="text-base font-bold text-ink">
            <span className="sr-only">{`Paso ${number}: `}</span>
            {title}
          </h2>
          <p className="mt-1 text-[0.8125rem] text-fog">{hint}</p>
        </div>
      </div>
      {children}
    </section>
  );
}
