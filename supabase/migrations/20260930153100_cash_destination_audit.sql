begin;

insert into public.cash_destinations (organization_id,name,destination_type)
select distinct b.organization_id,x.name,'bank'
from public.branches b
cross join (values ('QNB'),('بنك القاهرة')) as x(name)
on conflict (organization_id,name) do nothing;

create or replace function public.audit_cash_entry_correction()
returns trigger
language plpgsql
security definer
set search_path to 'public','pg_catalog'
as $$
declare correction_reason text;
begin
  if old.canonical_category is not distinct from new.canonical_category
     and old.expense_group is not distinct from new.expense_group
     and old.description is not distinct from new.description
     and old.treasury_account_id is not distinct from new.treasury_account_id
     and old.destination_id is not distinct from new.destination_id
     and old.is_expense is not distinct from new.is_expense
     and old.entry_kind is not distinct from new.entry_kind then
    return new;
  end if;

  correction_reason := nullif(current_setting('app.correction_reason', true), '');

  insert into public.cash_entry_correction_log (
    cash_entry_id,branch_id,
    old_canonical_category,new_canonical_category,
    old_expense_group,new_expense_group,
    old_description,new_description,
    old_treasury_account_id,new_treasury_account_id,
    old_destination_id,new_destination_id,
    old_is_expense,new_is_expense,
    old_entry_kind,new_entry_kind,
    reason,changed_by
  ) values (
    new.id,new.branch_id,
    old.canonical_category,new.canonical_category,
    old.expense_group,new.expense_group,
    old.description,new.description,
    old.treasury_account_id,new.treasury_account_id,
    old.destination_id,new.destination_id,
    old.is_expense,new.is_expense,
    old.entry_kind,new.entry_kind,
    coalesce(correction_reason,'تصحيح يدوي'),auth.uid()
  );

  return new;
end;
$$;

commit;