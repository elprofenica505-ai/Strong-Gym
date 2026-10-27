/**
 * Visibilidad pública de las disciplinas que tienen bloques propios en la
 * web. El catálogo de clases ya es dinámico; este módulo conecta el mismo
 * interruptor (`classes.is_active`) con los textos y secciones fijas.
 */

export const BOXING_CLASS_SLUG = "boxeo";
export const ZUMBA_CLASS_SLUG = "zumba";

export interface PublicDisciplineVisibility {
  showBoxing: boolean;
  showZumba: boolean;
}

export const ALL_PUBLIC_DISCIPLINES_VISIBLE: PublicDisciplineVisibility = {
  showBoxing: true,
  showZumba: true,
};

export function publicDisciplineVisibility(
  activeSlugs?: Iterable<string>,
): PublicDisciplineVisibility {
  if (!activeSlugs) return ALL_PUBLIC_DISCIPLINES_VISIBLE;

  const slugs = new Set(activeSlugs);
  return {
    showBoxing: slugs.has(BOXING_CLASS_SLUG),
    showZumba: slugs.has(ZUMBA_CLASS_SLUG),
  };
}

export interface PublicDisciplineTextVariants {
  both: string;
  boxingOnly: string;
  danceOnly: string;
  weightsOnly: string;
}

export function selectPublicDisciplineText(
  visibility: PublicDisciplineVisibility,
  variants: PublicDisciplineTextVariants,
): string {
  if (visibility.showBoxing && visibility.showZumba) return variants.both;
  if (visibility.showBoxing) return variants.boxingOnly;
  if (visibility.showZumba) return variants.danceOnly;
  return variants.weightsOnly;
}

/**
 * Un plan cuyo slug es el de una disciplina promocionada sigue el mismo
 * interruptor en la web. Los planes generales del gimnasio no se tocan.
 */
export function isPlanVisibleForDisciplines(
  planSlug: string,
  visibility: PublicDisciplineVisibility = ALL_PUBLIC_DISCIPLINES_VISIBLE,
): boolean {
  if (planSlug === BOXING_CLASS_SLUG) return visibility.showBoxing;
  if (planSlug === ZUMBA_CLASS_SLUG) return visibility.showZumba;
  return true;
}
