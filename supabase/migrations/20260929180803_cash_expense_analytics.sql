alter table public.cash_entries
  add column if not exists entry_kind text not null default 'other',
  add column if not exists canonical_category text,
  add column if not exists expense_group text,
  add column if not exists is_expense boolean not null default false,
  add column if not exists classification_confidence text not null default 'exact';

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname='cash_entries_entry_kind_check'
  ) then
    alter table public.cash_entries
      add constraint cash_entries_entry_kind_check
      check (entry_kind in (
        'collection','expense','bank_deposit','hq_transfer',
        'advance','custody','interbranch','cash_balance','other'
      ));
  end if;

  if not exists (
    select 1 from pg_constraint where conname='cash_entries_classification_confidence_check'
  ) then
    alter table public.cash_entries
      add constraint cash_entries_classification_confidence_check
      check (classification_confidence in ('exact','alias','inferred','unclassified'));
  end if;
end $$;

create index if not exists cash_entries_expense_analysis_idx
  on public.cash_entries(branch_id, entry_date, is_expense, expense_group, canonical_category);

drop view if exists public.v_expense_analysis;
create view public.v_expense_analysis
with (security_invoker = true)
as
select
  ce.id,
  ce.batch_id,
  ce.branch_id,
  b.name as branch_name,
  ce.entry_date,
  ce.source_code,
  ce.account_code,
  ce.description,
  ce.category as source_category,
  ce.canonical_category,
  ce.expense_group,
  ce.amount,
  ce.classification_confidence
from public.cash_entries ce
join public.branches b on b.id = ce.branch_id
join public.import_batches ib on ib.id = ce.batch_id
where ce.is_expense = true
  and ib.status = 'approved';

grant select on public.v_expense_analysis to authenticated;
