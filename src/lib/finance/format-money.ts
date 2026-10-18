/** Presentación pura de importes; compartida por servidor y cliente. No convierte monedas. */
export function formatMoney(
  amount: number,
  currency: "NIO" | "USD" = "NIO",
  opts: { compact?: boolean } = {},
): string {
  const { compact = false } = opts;
  if (!Number.isFinite(amount)) return "—";
  if (currency === "USD") {
    if (compact && Math.abs(amount) >= 1000) {
      return `US$ ${(amount / 1000).toFixed(1)}K`;
    }
    return new Intl.NumberFormat("es-NI", {
      style: "currency",
      currency: "USD",
      maximumFractionDigits: amount % 1 === 0 ? 0 : 2,
    }).format(amount);
  }
  if (compact && Math.abs(amount) >= 1000) {
    return `C$ ${(amount / 1000).toFixed(1)}K`;
  }
  return new Intl.NumberFormat("es-NI", {
    style: "currency",
    currency: "NIO",
    maximumFractionDigits: amount % 1 === 0 ? 0 : 2,
  }).format(amount);
}
