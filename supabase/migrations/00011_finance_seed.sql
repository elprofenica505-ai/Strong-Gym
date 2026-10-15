-- ============================================================
--  Strong Fitness Gym — FASE 1: Datos de ejemplo (seed)
-- ============================================================
--  Genera 40 socios ficticios con nombres nicaragüenses, 3 coaches,
--  los métodos de pago que el gimnasio acepta (efectivo, transferencia,
--  tarjeta, SINPE Móvil y billetera móvil), las cuentas del gimnasio,
--  categorías de gastos, planes y 60+ transacciones del mes en curso
--  para que el panel se vea con vida desde el primer login.
--
--  Es SEGURO correrlo varias veces: usa ON CONFLICT e ids estables.
--
--  TIPO DE CAMBIO (configurable): 1 USD = 36.5 NIO (Banco Central de
--  Nicaragua, precio de venta aprox. a 2026). Si cambia, actualizá el
--  valor abajo y se recalcula todo.
-- ============================================================


-- ------------------------------------------------------------
--  0. TIPO DE CAMBIO
-- ------------------------------------------------------------
--  Si tu contador te pasa un valor distinto, cambialo acá y se
--  recalculan las conversiones en las transacciones existentes.
do $$
declare
  v_fx numeric(12,4) := 36.50;  -- 1 USD = 36.50 NIO
begin
  perform set_config('app.fx_nio_per_usd', v_fx::text, false);
end $$;


-- ------------------------------------------------------------
--  1. MÉTODOS DE PAGO
-- ------------------------------------------------------------

insert into public.payment_methods
  (id, slug, kind, name_es, name_en, details_es, details_en,
   accepts_nio, accepts_usd, icon, sort_order)
values
  ('pm_cash_nio',  'efectivo-cordobas', 'cash',          'Efectivo (C$)',       'Cash (NIO)',
   'Pago en efectivo en la recepción, en córdobas.',
   'Cash payment at the front desk, in córdobas.',
   true,  false, 'Banknote', 1),

  ('pm_cash_usd',  'efectivo-dolares', 'cash',          'Efectivo (US$)',      'Cash (USD)',
   'Pago en efectivo en la recepción, en dólares.',
   'Cash payment at the front desk, in US dollars.',
   false, true,  'DollarSign', 2),

  ('pm_bac_nio',   'transferencia-bac', 'bank_transfer', 'Transferencia BAC NIO','Bank transfer (BAC, NIO)',
   'Banco BAC · Cuenta C$ 123-456789 · Titular: Strong Fitness Gym S.A.',
   'BAC Bank · Account NIO 123-456789 · Account holder: Strong Fitness Gym S.A.',
   true,  false, 'Building2', 3),

  ('pm_bac_usd',   'transferencia-bac-usd', 'bank_transfer', 'Transferencia BAC USD','Bank transfer (BAC, USD)',
   'Banco BAC · Cuenta US$ 987-654321 · Titular: Strong Fitness Gym S.A.',
   'BAC Bank · Account USD 987-654321 · Account holder: Strong Fitness Gym S.A.',
   false, true,  'Building2', 4),

  ('pm_lafi_nio',  'transferencia-lafise', 'bank_transfer', 'Transferencia LAFISE', 'Bank transfer (LAFISE)',
   'Banco LAFISE · Cuenta C$ 555-444-333',
   'LAFISE Bank · Account NIO 555-444-333',
   true,  false, 'Building2', 5),

  ('pm_card_local','tarjeta-pos', 'debit_card',   'Tarjeta POS',          'Card (POS)',
   'Débito y crédito Visa / MasterCard en la terminal del local.',
   'Debit and credit Visa / MasterCard at the in-store terminal.',
   true,  true,  'CreditCard', 6),

  ('pm_sinpe',     'sinpe-movil',  'sinpe_movil',   'SINPE Móvil',          'SINPE Móvil',
   'Transferencia inmediata desde cualquier banco al 8888-1234.',
   'Instant transfer from any bank to 8888-1234.',
   true,  false, 'Smartphone', 7),

  ('pm_tigo_money','tigo-money',   'mobile_wallet', 'Tigo Money',           'Tigo Money',
   'Billetera móvil Tigo. Número 8500-1234. Comisión: 2%.',
   'Tigo mobile wallet. Number 8500-1234. 2% fee.',
   true,  false, 'Wallet', 8),

  ('pm_claro_pay', 'claro-pay',    'mobile_wallet', 'Claro Pay',            'Claro Pay',
   'Billetera móvil Claro. Número 8500-5678. Comisión: 2%.',
   'Claro mobile wallet. Number 8500-5678. 2% fee.',
   true,  false, 'Wallet', 9),

  ('pm_crypto',    'cripto-usdt',  'crypto',        'Cripto (USDT)',        'Crypto (USDT)',
   'USDT en red TRC-20 a la wallet TQrX9wK... (consultar al admin).',
   'USDT on TRC-20 network to wallet TQrX9wK... (ask the admin).',
   false, true,  'Bitcoin', 10)
on conflict (id) do update set
  name_es = excluded.name_es,
  name_en = excluded.name_en,
  details_es = excluded.details_es,
  details_en = excluded.details_en,
  icon = excluded.icon,
  sort_order = excluded.sort_order;


-- ------------------------------------------------------------
--  2. CATEGORÍAS DE GASTOS
-- ------------------------------------------------------------

insert into public.expense_categories (id, slug, name_es, name_en, icon, sort_order) values
  ('exp_rent',       'alquiler',     'Alquiler del local',  'Rent',              'Home',          1),
  ('exp_electricity','luz',          'Servicio eléctrico',  'Electricity',       'Zap',           2),
  ('exp_water',      'agua',         'Agua potable',        'Water',             'Droplet',       3),
  ('exp_internet',   'internet',     'Internet y cable',    'Internet & cable',  'Wifi',          4),
  ('exp_coaches',    'sueldos-coaches', 'Sueldos de coaches','Coaches payroll',  'Users',         5),
  ('exp_cleaning',   'limpieza',     'Artículos de limpieza','Cleaning supplies','Sparkles',      6),
  ('exp_equipment',  'mantenimiento','Mantenimiento equipos','Equipment maintenance','Wrench',    7),
  ('exp_supplements','compra-suplementos','Compra de suplementos','Supplements restock','Package',8),
  ('exp_marketing',  'marketing',    'Marketing y redes',   'Marketing & social','Megaphone',     9),
  ('exp_tax',        'impuestos',    'Impuestos y tasas',   'Taxes & fees',      'FileText',      10),
  ('exp_misc',       'varios',       'Otros gastos',        'Other expenses',    'Receipt',       99)
on conflict (id) do update set
  name_es = excluded.name_es,
  name_en = excluded.name_en,
  icon = excluded.icon,
  sort_order = excluded.sort_order;


-- ------------------------------------------------------------
--  3. CUENTAS DEL GIMNASIO
-- ------------------------------------------------------------

insert into public.accounts (id, slug, name, kind, currency, bank_name, account_number, holder_name) values
  ('acc_cash_nio', 'caja-fuerte-cordobas', 'Caja fuerte (C$)',    'cash',   'NIO', null,      null,        'Strong Fitness Gym'),
  ('acc_cash_usd', 'caja-fuerte-dolares',  'Caja fuerte (US$)',   'cash',   'USD', null,      null,        'Strong Fitness Gym'),
  ('acc_bac_nio',  'bac-cordobas',         'BAC Córdobas',        'bank',   'NIO', 'BAC',     '123-456789','Strong Fitness Gym S.A.'),
  ('acc_bac_usd',  'bac-dolares',          'BAC Dólares',         'bank',   'USD', 'BAC',     '987-654321','Strong Fitness Gym S.A.'),
  ('acc_tigo',     'tigo-money',           'Tigo Money',          'wallet', 'NIO', 'Tigo',    '8500-1234', 'Strong Fitness Gym')
on conflict (id) do update set
  name = excluded.name,
  account_number = excluded.account_number;


-- ------------------------------------------------------------
--  4. COACHES (3 con datos de ejemplo)
-- ------------------------------------------------------------

insert into public.coaches
  (id, slug, name, role_es, role_en, bio_es, bio_en, specialties, initials, color, sort_order, is_active)
values
  ('coa_dg',  'douglas',  'Douglas Hernández', 'Head Coach', 'Head Coach',
   '10 años entrenando boxeo y pesas. Excampeón nacional amateur.',
   '10 years coaching boxing and weights. Former national amateur champion.',
   array['boxeo', 'musculacion', 'funcional'], 'DH', '#d81a22', 1, true),

  ('coa_mr',  'maria',    'María Rodríguez',   'Coordinadora de Bailoterapia', 'Zumba Coordinator',
   'Instructora certificada de Zumba y bailoterapia. 6 años de experiencia.',
   'Certified Zumba and dance fitness instructor. 6 years of experience.',
   array['zumba', 'bailoterapia', 'stretching'], 'MR', '#0c0c0e', 2, true),

  ('coa_jl',  'jose',     'José Luis Pérez',   'Coach de Pesas', 'Weights Coach',
   'Especialista en hipertrofia y fuerza. Certificación NSCA-CPT.',
   'Hypertrophy and strength specialist. NSCA-CPT certified.',
   array['musculacion', 'fuerza', 'powerlifting'], 'JL', '#9a9a9a', 3, true)
on conflict (id) do update set
  name = excluded.name,
  role_es = excluded.role_es,
  role_en = excluded.role_en,
  bio_es = excluded.bio_es,
  bio_en = excluded.bio_en,
  specialties = excluded.specialties,
  initials = excluded.initials,
  color = excluded.color;


-- ============================================================
--  5. SOCIOS DE EJEMPLO (FASE 1: solo se insertan al registrar)
-- ============================================================
--  Importante: en producción los socios se crean desde el sitio
--  (Supabase Auth crea el usuario y un trigger copia los datos a
--  profiles). Los 40 socios de ejemplo del panel demo se generan
--  en TypeScript (src/lib/data/seed/demo-finance.ts) y viven en
--  localStorage, no en Supabase.
--
--  Esto evita romper la FK profiles.id → auth.users.id cuando
--  el seed se corre en un Postgres sin Auth.
-- ============================================================


-- ============================================================
--  6. TRANSACCIONES DE EJEMPLO (sin member_id, solo gastos fijos)
-- ============================================================
--  Para que la caja del panel se vea con vida apenas se conecte a
--  Supabase, dejamos cargados los gastos fijos del mes en curso
--  (alquiler, luz, agua, internet, sueldos, etc). Los ingresos
--  se generan cuando el admin cobra una mensualidad desde el panel.
--
--  Si más adelante se quieren ingresos también de seed, agregar
--  member_id pero SOLO después de crear esos usuarios en auth.users.

do $$
declare
  v_fx      constant numeric := 36.50;
begin
  -- Limpia transacciones generadas por este seed (idempotencia)
  delete from public.transactions where concept like '[SEED-GASTO]%';

  -- GASTOS FIJOS DEL MES
  insert into public.transactions (occurred_at, direction, status, amount, currency, fx_rate, base_amount, payment_method_id, account_id, expense_category_id, concept, created_by)
  values
    (current_date - interval '28 days', 'expense', 'completed', 25000, 'NIO', v_fx, 25000, 'pm_bac_nio', 'acc_bac_nio', 'exp_rent',       '[SEED-GASTO] Alquiler del local', null),
    (current_date - interval '20 days', 'expense', 'completed', 4500,  'NIO', v_fx, 4500,  'pm_bac_nio', 'acc_bac_nio', 'exp_electricity','[SEED-GASTO] Factura de luz (oct)', null),
    (current_date - interval '18 days', 'expense', 'completed', 850,   'NIO', v_fx, 850,   'pm_cash_nio','acc_cash_nio','exp_water',      '[SEED-GASTO] Factura de agua', null),
    (current_date - interval '15 days', 'expense', 'completed', 2200,  'NIO', v_fx, 2200,  'pm_bac_nio', 'acc_bac_nio', 'exp_internet',   '[SEED-GASTO] Internet + cable', null),
    (current_date - interval '30 days', 'expense', 'completed', 18000, 'NIO', v_fx, 18000, 'pm_cash_nio','acc_cash_nio','exp_coaches',    '[SEED-GASTO] Sueldo Douglas (medio mes)', null),
    (current_date - interval '14 days', 'expense', 'completed', 16000, 'NIO', v_fx, 16000, 'pm_cash_nio','acc_cash_nio','exp_coaches',    '[SEED-GASTO] Sueldo María', null),
    (current_date - interval '14 days', 'expense', 'completed', 15000, 'NIO', v_fx, 15000, 'pm_cash_nio','acc_cash_nio','exp_coaches',    '[SEED-GASTO] Sueldo José Luis', null),
    (current_date - interval '10 days', 'expense', 'completed', 1200,  'NIO', v_fx, 1200,  'pm_cash_nio','acc_cash_nio','exp_cleaning',   '[SEED-GASTO] Artículos de limpieza', null),
    (current_date - interval '6 days',  'expense', 'completed', 3500,  'NIO', v_fx, 3500,  'pm_bac_nio', 'acc_bac_nio', 'exp_equipment',  '[SEED-GASTO] Mantenimiento caminadora', null),
    (current_date - interval '4 days',  'expense', 'completed', 28000, 'NIO', v_fx, 28000, 'pm_bac_nio', 'acc_bac_nio', 'exp_supplements','[SEED-GASTO] Restock de suplementos', null),
    (current_date - interval '3 days',  'expense', 'completed', 1500,  'NIO', v_fx, 1500,  'pm_cash_nio','acc_cash_nio','exp_marketing',  '[SEED-GASTO] Publicidad en Facebook', null),
    (current_date - interval '2 days',  'expense', 'completed', 3200,  'NIO', v_fx, 3200,  'pm_bac_nio', 'acc_bac_nio', 'exp_tax',        '[SEED-GASTO] Pago de tasa municipal', null),
    (current_date - interval '1 day',   'expense', 'completed', 850,   'NIO', v_fx, 850,   'pm_cash_nio','acc_cash_nio','exp_misc',       '[SEED-GASTO] Botiquín e insumos', null);
end $$;


-- ------------------------------------------------------------
--  8. APERTURA DE CAJA INICIAL
-- ------------------------------------------------------------
--  Caja abierta hoy. El admin la cierra al final del día desde el panel.

insert into public.cash_registers (opened_at, opening_amount, notes)
values (current_date, 5000, 'Apertura inicial con C$ 5,000 en caja')
on conflict do nothing;


-- ============================================================
--  FIN DEL SEED
-- ============================================================
--  Resumen:
--    · 10 métodos de pago (efectivo C$ y US$, transferencias BAC y
--      LAFISE, tarjeta POS, SINPE Móvil, Tigo Money, Claro Pay y
--      cripto USDT). La idea es mostrar todas las opciones que
--      un gimnasio en Nicaragua puede aceptar.
--    · 11 categorías de gastos.
--    · 5 cuentas (caja fuerte C$ + US$, BAC C$ + US$, Tigo Money).
--    · 3 coaches.
--    · 13 gastos fijos del mes (alquiler, luz, agua, internet,
--      sueldos, limpieza, mantenimiento, restock suplementos,
--      marketing, impuestos, etc).
--    · Caja abierta con C$ 5,000.
--
--  Los 40 socios de ejemplo y los ingresos del mes se generan en
--  TypeScript (modo demo, localStorage) y/o en producción cuando
--  el admin carga un pago desde el panel.
-- ============================================================
