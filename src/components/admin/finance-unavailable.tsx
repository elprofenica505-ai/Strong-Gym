import Link from "next/link";
import { ReloadButton } from "@/components/ui/reload-button";

export function FinanceUnavailable({
  locale,
  code,
  message,
}: {
  locale: string;
  code: string;
  message: string;
}) {
  return (
    <section className="space-y-4 rounded-2xl border border-alert/40 bg-card p-5">
      <h1 className="display-xl text-2xl">
        Información financiera no disponible
      </h1>
      <p role="alert" className="text-alert">
        {message}
      </p>
      <p className="text-sm text-fog">Código: {code}</p>
      <p className="text-sm text-fog">
        Las cifras no se muestran porque no pudimos verificarlas. No reinstalés
        la base ni repitas cobros por este aviso. Si la compatibilidad está
        pendiente, reintentar no la instala.
      </p>
      <div className="flex flex-wrap gap-4 text-brand-300 underline">
        <ReloadButton label="Reintentar lectura" />
        <Link href={`/${locale}/panel/clientes`}>Volver a Clientes</Link>
        <Link href={`/${locale}/panel`}>Volver al panel</Link>
      </div>
    </section>
  );
}
