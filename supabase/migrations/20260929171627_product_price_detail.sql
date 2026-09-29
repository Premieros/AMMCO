alter table public.products
  add column if not exists price_category text,
  add column if not exists retail_carton_price numeric(18,4),
  add column if not exists retail_pack_price numeric(18,4),
  add column if not exists wholesale_carton_price numeric(18,4),
  add column if not exists wholesale_pack_price numeric(18,4),
  add column if not exists packaging_count numeric(18,4),
  add column if not exists box_count numeric(18,4),
  add column if not exists carton_descriptor text;

comment on column public.products.retail_carton_price is 'DATA column A: retail carton price';
comment on column public.products.retail_pack_price is 'DATA column B: retail pack/box price';
comment on column public.products.wholesale_carton_price is 'DATA column D: wholesale carton price';
comment on column public.products.wholesale_pack_price is 'DATA column E: wholesale pack/box price';
comment on column public.products.price_category is 'DATA column K/S: product price category';
comment on column public.products.packaging_count is 'DATA column L: packaging quantity';
comment on column public.products.box_count is 'DATA column M: box quantity';
comment on column public.products.carton_descriptor is 'DATA column N: carton descriptor';
