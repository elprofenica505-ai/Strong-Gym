/**
 * Permisos separables de caja (Etapa 3, tanda 2).
 *
 * La fuente de verdad sigue siendo `public.staff_permissions`; este módulo
 * solo centraliza nombres y textos para que la interfaz, las páginas y la API
 * hablen de los mismos interruptores. No decide seguridad por sí solo: la
 * base vuelve a comprobar cada permiso en sus funciones.
 */
export type CashierPermissionKey =
  | "dailyClose"
  | "monthlyResult"
  | "charts"
  | "accountBalances"
  | "expenses"
  | "receivables"
  | "void";

export interface CashierPermissions {
  dailyClose: boolean;
  monthlyResult: boolean;
  charts: boolean;
  accountBalances: boolean;
  expenses: boolean;
  receivables: boolean;
  void: boolean;
}

export const CASHIER_PERMISSION_KEYS: Record<CashierPermissionKey, string> = {
  dailyClose: "cashier_can_view_daily_close",
  monthlyResult: "cashier_can_view_monthly_result",
  charts: "cashier_can_view_charts",
  accountBalances: "cashier_can_view_account_balances",
  expenses: "cashier_can_manage_expenses",
  receivables: "cashier_can_view_receivables",
  void: "cashier_can_void",
};

export const CASHIER_PERMISSION_FIELDS = [
  "dailyClose",
  "monthlyResult",
  "charts",
  "accountBalances",
  "expenses",
  "receivables",
  "void",
] as const satisfies readonly CashierPermissionKey[];

export const CASHIER_PERMISSIONS_OFF: CashierPermissions = {
  dailyClose: false,
  monthlyResult: false,
  charts: false,
  accountBalances: false,
  expenses: false,
  receivables: false,
  void: false,
};

export const CASHIER_PERMISSIONS_ALL: CashierPermissions = {
  dailyClose: true,
  monthlyResult: true,
  charts: true,
  accountBalances: true,
  expenses: true,
  receivables: true,
  void: true,
};

export interface CashierPermissionDefinition {
  field: CashierPermissionKey;
  title: string;
  description: string;
  enabledMessage: string;
  disabledMessage: string;
}

export const CASHIER_PERMISSION_DEFINITIONS: CashierPermissionDefinition[] = [
  {
    field: "dailyClose",
    title: "Cierre del día",
    description:
      "Permite abrir Reportes y ver solo el cierre del día elegido. No abre comparativos, comisiones ni exportaciones.",
    enabledMessage: "Caja ya puede ver el cierre del día en Reportes.",
    disabledMessage: "Caja ya no ve el cierre del día. Los datos siguen guardados.",
  },
  {
    field: "monthlyResult",
    title: "Resultado mensual",
    description:
      "Permite ver ingresos, egresos y resultado del mes en el inicio, Caja y Finanzas. Apagado, caja sigue trabajando con el movimiento del día.",
    enabledMessage: "Caja ya puede ver el resultado mensual.",
    disabledMessage: "Caja ya no ve el resultado mensual.",
  },
  {
    field: "charts",
    title: "Gráficos financieros",
    description:
      "Permite ver gráficos de ingresos por día, gráficos mensuales permitidos y totales por método de pago.",
    enabledMessage: "Caja ya puede ver los gráficos financieros.",
    disabledMessage: "Caja ya no ve los gráficos financieros.",
  },
  {
    field: "accountBalances",
    title: "Saldos de cuentas",
    description:
      "Permite ver el saldo actual de cada cuenta del gimnasio. Apagado, caja sigue eligiendo la cuenta al cobrar, pero sin ver su saldo.",
    enabledMessage: "Caja ya puede ver los saldos de las cuentas.",
    disabledMessage: "Caja ya no ve los saldos de las cuentas.",
  },
  {
    field: "expenses",
    title: "Gastos",
    description:
      "Permite abrir Gastos, ver sus comprobantes y registrar egresos. Apagado, solo administración registra gastos; los cobros de caja no cambian.",
    enabledMessage: "Caja ya puede ver y registrar gastos.",
    disabledMessage: "Caja ya no puede ver ni registrar gastos desde Gastos.",
  },
  {
    field: "receivables",
    title: "Cuentas por cobrar",
    description:
      "Permite abrir la lista de cuentas por cobrar y ver la deuda total informada. Registrar abonos desde la ficha del cliente sigue siendo operación diaria.",
    enabledMessage: "Caja ya puede ver las cuentas por cobrar.",
    disabledMessage: "Caja ya no ve la lista de cuentas por cobrar.",
  },
  {
    field: "void",
    title: "Anular movimientos",
    description:
      "Permite anular un cobro o gasto propio del día. No borra nada: crea un movimiento de reversa y guarda el motivo, quién lo hizo y cuándo. Apagado, solo administración puede anular.",
    enabledMessage: "Caja ya puede anular sus movimientos del día.",
    disabledMessage: "Caja ya no puede anular movimientos; los datos siguen guardados.",
  },
];

export function normalizeCashierPermissions(value: unknown): CashierPermissions {
  const source =
    value && typeof value === "object" && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : {};
  return {
    dailyClose: source.dailyClose === true,
    monthlyResult: source.monthlyResult === true,
    charts: source.charts === true,
    accountBalances: source.accountBalances === true,
    expenses: source.expenses === true,
    receivables: source.receivables === true,
    void: source.void === true,
  };
}
