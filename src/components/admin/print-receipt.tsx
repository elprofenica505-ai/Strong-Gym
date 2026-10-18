"use client";
export function PrintReceipt() {
  return (
    <button type="button" onClick={() => window.print()}>
      Imprimir / guardar PDF
    </button>
  );
}
