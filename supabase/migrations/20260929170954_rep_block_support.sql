alter table public.sales_rep_daily
  add column if not exists rep_slot smallint,
  add column if not exists sales_before_discount numeric(18,2) not null default 0,
  add column if not exists net_after_discount numeric(18,2) not null default 0,
  add column if not exists deposit_amount numeric(18,2) not null default 0,
  add column if not exists source_anchor_cell text;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'sales_rep_daily_rep_slot_check'
  ) then
    alter table public.sales_rep_daily
      add constraint sales_rep_daily_rep_slot_check
      check (rep_slot is null or rep_slot between 1 and 50);
  end if;
end $$;

create index if not exists idx_sales_rep_daily_branch_date_slot
  on public.sales_rep_daily(branch_id, business_date, rep_slot);

comment on column public.sales_rep_daily.rep_slot is
  'Horizontal representative block order in the source daily sheet. Current workbook template expects 12 reps; schema supports more.';
comment on column public.sales_rep_daily.deposit_amount is
  'Representative daily deposit/tawreed read from the cells above the representative name.';
comment on column public.sales_rep_daily.net_after_discount is
  'Representative value after discount read from the header block above the representative name.';
comment on column public.sales_rep_daily.sales_before_discount is
  'Representative gross value before discount when available from the workbook.';
comment on column public.sales_rep_daily.source_anchor_cell is
  'Cell containing the representative name; trace anchor for the source block.';
