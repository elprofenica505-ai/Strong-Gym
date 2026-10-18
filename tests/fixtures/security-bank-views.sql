-- Sólo estructura de vistas del diagnóstico remoto 2026-10-18; sin datos reales.
-- v_account_balances está en finance-bank-accounts.sql. No usar como migración.
create view public.v_expenses_by_category as
select date_trunc('month',occurred_at) as month,category_id,sum(amount_nio) total_nio,
 sum(amount_usd) total_usd,count(*) tx_count from transactions
where type='expense' and status='completed' group by 1,2;
create view public.v_members_with_debt as
select p.id member_id,p.full_name,p.email,p.phone,mb.debt_nio,mb.debt_usd,mb.last_payment_date
from profiles p join member_balances mb on mb.member_id=p.id
where mb.debt_nio>0 or mb.debt_usd>0;
create view public.v_monthly_summary as
select date_trunc('month',occurred_at) as month,
 sum(case when type='income' then amount_nio else 0 end) income_nio,
 sum(case when type='income' then amount_usd else 0 end) income_usd,
 sum(case when type='expense' then amount_nio else 0 end) expense_nio,
 sum(case when type='expense' then amount_usd else 0 end) expense_usd,
 sum(case when type='income' then amount_nio else 0 end)-sum(case when type='expense' then amount_nio else 0 end) net_nio
from transactions where status='completed' group by 1;
create view public.v_top_members as
select p.id member_id,p.full_name,count(t.id) payment_count,sum(t.amount_nio) total_paid_nio,
 sum(t.amount_usd) total_paid_usd,max(t.occurred_at) last_payment
from profiles p left join transactions t on t.member_id=p.id and t.type='income' and t.status='completed'
group by p.id,p.full_name;
