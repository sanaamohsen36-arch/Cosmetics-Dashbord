-- Idempotent. Safe to run multiple times.
--
-- Phase 3 (Home Ads Upload): mirrors Cosmetics' ads_raw_files/meta_ads/
-- tiktok_ads shape exactly (same columns, same "id text" convention, same
-- Section 15 file-versioning), substituting Cosmetics' Brand
-- ("sales_platform_name") for Home's own Page name ("page_name") - Home has
-- no Brand concept. Fully separate tables from every Cosmetics ads table;
-- "workspace" is carried on every row for the same reason as the Sales
-- tables in migration 0004.

create table if not exists public.home_ads_raw_files (
  id text primary key,
  workspace text not null default 'home' check (workspace = 'home'),
  file_name text not null,
  file_url text not null default '',
  uploaded_at timestamptz not null default now(),
  report_date date not null,
  ads_platform text not null check (ads_platform in ('Meta','TikTok')),
  page_name text not null default '',
  parsing_status text not null default 'success',
  version integer not null default 1,
  is_current boolean not null default true,
  superseded_at timestamptz,
  superseded_by text,
  created_at timestamptz not null default now()
);

create unique index if not exists uq_home_ads_raw_files_current_slot
  on public.home_ads_raw_files (report_date, ads_platform, page_name)
  where is_current;

create table if not exists public.home_meta_ads (
  id text primary key,
  workspace text not null default 'home' check (workspace = 'home'),
  report_date date not null,
  page_name text not null default '',
  campaign_name text not null default '',
  adset_name text not null default '',
  ad_name text not null default '',
  spend numeric not null default 0,
  impressions integer not null default 0,
  reach integer not null default 0,
  clicks integer not null default 0,
  ctr numeric not null default 0,
  cpc numeric not null default 0,
  cpm numeric not null default 0,
  leads integer not null default 0,
  messages_count integer not null default 0,
  comments_count integer not null default 0,
  purchases integer not null default 0,
  purchase_value numeric not null default 0,
  source_file_id text references public.home_ads_raw_files(id) on delete cascade,
  created_at timestamptz not null default now()
);

create table if not exists public.home_tiktok_ads (
  id text primary key,
  workspace text not null default 'home' check (workspace = 'home'),
  report_date date not null,
  page_name text not null default '',
  campaign_name text not null default '',
  adgroup_name text not null default '',
  ad_name text not null default '',
  spend numeric not null default 0,
  impressions integer not null default 0,
  clicks integer not null default 0,
  ctr numeric not null default 0,
  cpc numeric not null default 0,
  cpm numeric not null default 0,
  messages_count integer not null default 0,
  comments_count integer not null default 0,
  conversions integer not null default 0,
  cost_per_conversion numeric not null default 0,
  revenue numeric not null default 0,
  source_file_id text references public.home_ads_raw_files(id) on delete cascade,
  created_at timestamptz not null default now()
);

create index if not exists idx_home_meta_ads_source_file on public.home_meta_ads (source_file_id);
create index if not exists idx_home_tiktok_ads_source_file on public.home_tiktok_ads (source_file_id);

alter table public.home_ads_raw_files enable row level security;
alter table public.home_meta_ads enable row level security;
alter table public.home_tiktok_ads enable row level security;

-- Same permissive "using (true)" convention as every existing table
-- (Cosmetics and Home Sales alike) - workspace access is gated in the app
-- (WorkspaceGuard + requireWorkspaceAccess), not yet at the RLS layer.
drop policy if exists "public_select_home_ads_raw_files" on public.home_ads_raw_files;
drop policy if exists "public_write_home_ads_raw_files" on public.home_ads_raw_files;
create policy "public_select_home_ads_raw_files" on public.home_ads_raw_files for select using (true);
create policy "public_write_home_ads_raw_files" on public.home_ads_raw_files for all using (true) with check (true);

drop policy if exists "public_select_home_meta_ads" on public.home_meta_ads;
drop policy if exists "public_write_home_meta_ads" on public.home_meta_ads;
create policy "public_select_home_meta_ads" on public.home_meta_ads for select using (true);
create policy "public_write_home_meta_ads" on public.home_meta_ads for all using (true) with check (true);

drop policy if exists "public_select_home_tiktok_ads" on public.home_tiktok_ads;
drop policy if exists "public_write_home_tiktok_ads" on public.home_tiktok_ads;
create policy "public_select_home_tiktok_ads" on public.home_tiktok_ads for select using (true);
create policy "public_write_home_tiktok_ads" on public.home_tiktok_ads for all using (true) with check (true);
