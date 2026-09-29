alter table public.cash_entries
  alter column entry_date drop not null,
  add column if not exists source_row integer,
  add column if not exists source_code text;

create index if not exists cash_entries_batch_source_row_idx
  on public.cash_entries(batch_id, source_row);

comment on column public.cash_entries.entry_date is
  'Nullable for legacy workbook rows with missing/broken dates. Never invent a date.';
comment on column public.cash_entries.source_row is
  'Original row number from the الخزنة sheet.';
comment on column public.cash_entries.source_code is
  'Workbook treasury code/classification value when present.';
