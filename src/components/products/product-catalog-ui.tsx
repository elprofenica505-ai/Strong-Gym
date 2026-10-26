export type ProductCatalogView = "productos" | "categorias";

export type ProductCategoryOption = {
  name: string;
  count: number;
};

/** Categorías reales del catálogo, con su cantidad, en orden alfabético. */
export function productCategoryOptions(
  products: readonly { category: string }[],
): ProductCategoryOption[] {
  const counts = new Map<string, number>();
  for (const product of products) {
    const category = product.category.trim();
    if (!category) continue;
    counts.set(category, (counts.get(category) ?? 0) + 1);
  }
  return Array.from(counts, ([name, count]) => ({ name, count })).sort(
    (a, b) => a.name.localeCompare(b.name, "es-NI"),
  );
}

export function ProductCatalogTabs({
  view,
  onChange,
  disabled = false,
}: {
  view: ProductCatalogView;
  onChange: (view: ProductCatalogView) => void;
  disabled?: boolean;
}) {
  const base =
    "rounded-full px-4 py-2.5 text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand disabled:opacity-50";
  return (
    <div
      className="grid grid-cols-2 gap-2"
      role="group"
      aria-label="Vista del catálogo"
    >
      <button
        type="button"
        aria-pressed={view === "productos"}
        disabled={disabled}
        onClick={() => onChange("productos")}
        className={`${base} ${
          view === "productos"
            ? "bg-brand text-onbrand"
            : "border border-line bg-paper text-ink hover:border-brand"
        }`}
      >
        Ver productos
      </button>
      <button
        type="button"
        aria-pressed={view === "categorias"}
        disabled={disabled}
        onClick={() => onChange("categorias")}
        className={`${base} ${
          view === "categorias"
            ? "bg-brand text-onbrand"
            : "border border-line bg-paper text-ink hover:border-brand"
        }`}
      >
        Categorías
      </button>
    </div>
  );
}

export function ProductCategoryChoices({
  categories,
  total,
  selected,
  onSelect,
  disabled = false,
}: {
  categories: readonly ProductCategoryOption[];
  total: number;
  selected: string | null;
  onSelect: (category: string | null) => void;
  disabled?: boolean;
}) {
  const options: { value: string | null; label: string; count: number }[] = [
    { value: null, label: "Todos los productos", count: total },
    ...categories.map((category) => ({
      value: category.name,
      label: category.name,
      count: category.count,
    })),
  ];
  return (
    <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
      {options.map((option) => (
        <li key={option.label}>
          <button
            type="button"
            aria-pressed={selected === option.value}
            disabled={disabled}
            onClick={() => onSelect(option.value)}
            className={`w-full rounded-xl border px-4 py-3 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand disabled:opacity-50 ${
              selected === option.value
                ? "border-brand bg-brand/10"
                : "border-line bg-card hover:border-brand/70"
            }`}
          >
            <span className="block break-words font-semibold text-ink">
              {option.label}
            </span>
            <span className="block text-xs text-fog">
              {option.count}{" "}
              {option.count === 1 ? "producto" : "productos"}
            </span>
          </button>
        </li>
      ))}
    </ul>
  );
}

/**
 * Espacio fijo para la foto: `object-contain` muestra el producto completo,
 * sin recortarlo ni deformarlo, tenga la foto forma vertical u horizontal.
 */
export function ProductCatalogImage({
  imageData,
}: {
  imageData: string | null;
}) {
  if (!imageData) {
    return (
      <span className="grid aspect-[4/3] w-full place-items-center rounded-lg bg-line/40 text-[0.7rem] text-fog">
        sin foto
      </span>
    );
  }
  return (
    <span className="block aspect-[4/3] w-full overflow-hidden rounded-lg bg-white">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={imageData}
        alt=""
        className="h-full w-full object-contain p-1"
      />
    </span>
  );
}
