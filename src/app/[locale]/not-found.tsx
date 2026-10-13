import Link from "next/link";
import { ButtonLink } from "@/components/ui/button";

export default function NotFound() {
  return (
    <div className="container-x flex min-h-[70vh] flex-col items-center justify-center py-24 text-center">
      <p className="display-xl text-[5rem] leading-none text-volt sm:text-[7rem]">404</p>

      <h1 className="display-xl mt-4 text-[1.75rem] sm:text-[2.5rem]">
        Esta página no existe
      </h1>

      <p className="mt-4 max-w-md text-[0.9375rem] leading-relaxed text-fog">
        This page doesn&apos;t exist · Puede que hayas escrito mal la dirección o que la hayamos
        movido de lugar.
      </p>

      <div className="mt-8 flex flex-col gap-3 sm:flex-row">
        <ButtonLink href="/es" size="lg">
          Volver al inicio
        </ButtonLink>
        <Link
          href="/en"
          className="inline-flex h-13 items-center justify-center rounded-full border border-line px-7 text-[0.9375rem] font-semibold text-mist transition-colors hover:border-volt/60 hover:text-volt"
        >
          Back to home
        </Link>
      </div>
    </div>
  );
}
