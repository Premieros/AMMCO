-- Performance indexes for AMMCO foundation.
-- Mandatory target: yumeijsyiphzdsulsubf only.

create index if not exists cash_entries_batch_id_idx on public.cash_entries(batch_id);
create index if not exists customer_visits_batch_id_idx on public.customer_visits(batch_id);
create index if not exists import_batches_approved_by_idx on public.import_batches(approved_by);
create index if not exists import_batches_organization_id_idx on public.import_batches(organization_id);
create index if not exists import_batches_replaces_batch_id_idx on public.import_batches(replaces_batch_id);
create index if not exists import_batches_uploaded_by_idx on public.import_batches(uploaded_by);
create index if not exists inventory_counts_batch_id_idx on public.inventory_counts(batch_id);
create index if not exists inventory_counts_product_id_idx on public.inventory_counts(product_id);
create index if not exists inventory_daily_batch_id_idx on public.inventory_daily(batch_id);
create index if not exists products_first_seen_batch_id_idx on public.products(first_seen_batch_id);
create index if not exists products_last_seen_batch_id_idx on public.products(last_seen_batch_id);
create index if not exists profiles_organization_id_idx on public.profiles(organization_id);
create index if not exists user_branch_access_branch_id_idx on public.user_branch_access(branch_id);
create index if not exists vehicle_daily_batch_id_idx on public.vehicle_daily(batch_id);
