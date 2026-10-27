import "server-only";

import { cache } from "react";
import { getClasses } from "@/lib/data/queries";
import { readData } from "@/lib/data/read-result";
import {
  publicDisciplineVisibility,
  type PublicDisciplineVisibility,
} from "@/lib/public-disciplines";

export interface PublicDisciplineState {
  activeClassSlugs: string[];
  visibility: PublicDisciplineVisibility;
  /** Si la lectura falla, se oculta la promoción específica: no se inventa. */
  known: boolean;
}

/** Una sola lectura del catálogo activo por solicitud/render. */
export const getPublicDisciplineState = cache(
  async (): Promise<PublicDisciplineState> => {
    const result = await readData(() => getClasses());
    const activeClassSlugs = result.ok
      ? result.data.map((gymClass) => gymClass.slug)
      : [];

    return {
      activeClassSlugs,
      visibility: publicDisciplineVisibility(activeClassSlugs),
      known: result.ok,
    };
  },
);
