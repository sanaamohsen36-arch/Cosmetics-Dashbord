-- Folder/calendar upload structure.
-- Run this in Supabase SQL Editor when you are ready to move from legacy tables to the final normalized tables.

create table if not exists public.brands (
  id uuid primary key default gen_random_uuid(),
  brand_name text not null unique,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.sales_files (
  id uuid primary key default gen_random_uuid(),
  report_date date not null unique,
  file_name text not null,
  file_path text not null,
  uploaded_at timestamptz not null default now()
);

create table if not exists public.salespeople_sales (
  id uuid primary key default gen_random_uuid(),
  report_date date not null,
  salesperson_name text not null,
  salesperson_code text,
  shift text not null,
  orders_count numeric not null default 0,
  orders_value numeric not null default 0,
  source_file_id uuid references public.sales_files(id) on delete cascade,
  created_at timestamptz not null default now()
);

create table if not exists public.pages_sales (
  id uuid primary key default gen_random_uuid(),
  report_date date not null,
  page_platform_name text not null,
  group_type text not null default 'other' check (group_type in ('social', 'follow_up', 'other')),
  shift text not null default 'all',
  orders_count numeric not null default 0,
  orders_value numeric not null default 0,
  row_type text not null default 'normal' check (row_type in ('normal', 'subtotal', 'grand_total')),
  source_file_id uuid references public.sales_files(id) on delete cascade,
  created_at timestamptz not null default now()
);

create table if not exists public.ads_files (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid not null references public.brands(id) on delete cascade,
  report_date date not null,
  ads_platform text not null,
  file_name text not null,
  file_path text not null,
  uploaded_at timestamptz not null default now()
);

create table if not exists public.ads_data (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid not null references public.brands(id) on delete cascade,
  report_date date not null,
  ads_platform text not null,
  campaign_name text,
  adset_name text,
  ad_name text,
  daily_spend numeric not null default 0,
  messages_count numeric not null default 0,
  comments_count numeric not null default 0,
  results_count numeric not null default 0,
  cost_per_result numeric not null default 0,
  impressions numeric not null default 0,
  reach numeric not null default 0,
  clicks numeric not null default 0,
  ctr numeric not null default 0,
  cpc numeric not null default 0,
  cpm numeric not null default 0,
  source_file_id uuid references public.ads_files(id) on delete cascade,
  created_at timestamptz not null default now()
);

create table if not exists public.daily_combined_summary (
  id uuid primary key default gen_random_uuid(),
  report_date date not null,
  brand_id uuid references public.brands(id) on delete cascade,
  total_sales numeric not null default 0,
  total_orders numeric not null default 0,
  total_ads_spend numeric not null default 0,
  messages_count numeric not null default 0,
  comments_count numeric not null default 0,
  roas numeric,
  roi numeric,
  cpa numeric,
  average_order_value numeric,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (report_date, brand_id)
);

create index if not exists idx_salespeople_sales_report_date on public.salespeople_sales(report_date);
create index if not exists idx_pages_sales_report_date on public.pages_sales(report_date);
create index if not exists idx_ads_files_brand_date_platform on public.ads_files(brand_id, report_date, ads_platform);
create index if not exists idx_ads_data_brand_date_platform on public.ads_data(brand_id, report_date, ads_platform);

alter table public.brands enable row level security;
alter table public.sales_files enable row level security;
alter table public.salespeople_sales enable row level security;
alter table public.pages_sales enable row level security;
alter table public.ads_files enable row level security;
alter table public.ads_data enable row level security;
alter table public.daily_combined_summary enable row level security;

drop policy if exists "public_rw_brands" on public.brands;
drop policy if exists "public_rw_sales_files" on public.sales_files;
drop policy if exists "public_rw_salespeople_sales" on public.salespeople_sales;
drop policy if exists "public_rw_pages_sales" on public.pages_sales;
drop policy if exists "public_rw_ads_files" on public.ads_files;
drop policy if exists "public_rw_ads_data" on public.ads_data;
drop policy if exists "public_rw_daily_combined_summary" on public.daily_combined_summary;

create policy "public_rw_brands" on public.brands for all using (true) with check (true);
create policy "public_rw_sales_files" on public.sales_files for all using (true) with check (true);
create policy "public_rw_salespeople_sales" on public.salespeople_sales for all using (true) with check (true);
create policy "public_rw_pages_sales" on public.pages_sales for all using (true) with check (true);
create policy "public_rw_ads_files" on public.ads_files for all using (true) with check (true);
create policy "public_rw_ads_data" on public.ads_data for all using (true) with check (true);
create policy "public_rw_daily_combined_summary" on public.daily_combined_summary for all using (true) with check (true);

insert into public.brands (brand_name)
values ('ريجينكس'), ('ريجينكس eg'), ('واتساب ريجينكس')
on conflict (brand_name) do nothing;
