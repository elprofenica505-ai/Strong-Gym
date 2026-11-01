import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { isFinanceRole } from "@/lib/auth/current-user";
import { getCurrentUser } from "@/lib/data/queries";
import { DEMO_MODE } from "@/lib/supabase/env";
import { ProductManager } from "@/components/products/product-manager";

export async function generateMetadata(): Promise<Metadata> {
  return { title: "Productos y stock", robots: { index: false, follow: false } };
}

export default async function ProductosPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (DEMO_MODE) {
    return (
      <div className="container-x py-6">
        <p className="text-fog">
          Conectá Supabase para cargar productos. Este módulo no muestra datos de demostración.
        </p>
      </div>
    );
  }
  const user = await getCurrentUser();
  if (!user || !isFinanceRole(user.role)) redirect(`/${locale}/mi-cuenta`);

  return (
    <div className="container-x min-w-0 space-y-6 py-6">
      <div className="flex items-center gap-3">
        <Link
          href={`/${locale}/panel`}
          className="grid size-10 place-items-center rounded-full border border-line text-mist transition-colors hover:border-brand hover:text-ink"
        >
          <ArrowLeft className="size-4" />
        </Link>
        <div>
          <span className="eyebrow">
            <span className="h-px w-6 bg-brand" aria-hidden="true" />
            Caja · Productos
          </span>
          <h1 className="display-xl mt-2 text-[1.75rem] sm:text-[2.25rem]">
            Productos y stock
          </h1>
        </div>
      </div>
      <p className="max-w-2xl text-[0.875rem] leading-relaxed text-fog">
        Productos con precio, costo y stock. Las compras suman stock y registran un gasto;
        las ventas bajan el stock y registran un ingreso, sea a un cliente con ficha o a
        alguien que sólo vino a comprar (venta particular, sin registrar). Todo en córdobas
        (NIO). El stock no se borra: se ajusta con una explicación.
      </p>
      <ProductManager />
    </div>
  );
}
