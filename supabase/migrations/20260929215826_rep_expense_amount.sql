alter table public.sales_rep_daily
  add column if not exists expense_amount numeric(18,2) not null default 0;

comment on column public.sales_rep_daily.expense_amount is
  'Representative daily expense from row 5 in the source daily representative block.';
