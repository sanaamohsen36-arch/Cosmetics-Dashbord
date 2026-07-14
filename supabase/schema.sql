create table if not exists public.sales_raw_files (
  id text primary key,
  file_name text not null,
  file_url text not null,
  uploaded_at timestamptz not null,
  report_date date not null,
  ocr_status text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.sales_by_salesperson (
  id text primary key,
  report_date date not null,
  salesperson_name text not null,
  salesperson_code text not null,
  morning_orders integer not null default 0,
  morning_revenue numeric not null default 0,
  evening_orders integer not null default 0,
  evening_revenue numeric not null default 0,
  total_orders integer not null default 0,
  total_revenue numeric not null default 0,
  source_file_id text,
  created_at timestamptz not null default now()
);

create table if not exists public.sales_by_platform (
  id text primary key,
  report_date date not null,
  platform_name text not null,
  morning_orders integer not null default 0,
  morning_revenue numeric not null default 0,
  evening_orders integer not null default 0,
  evening_revenue numeric not null default 0,
  total_orders integer not null default 0,
  total_revenue numeric not null default 0,
  source_file_id text,
  created_at timestamptz not null default now()
);

create table if not exists public.ads_raw_files (
  id text primary key,
  file_name text not null,
  file_url text not null,
  uploaded_at timestamptz not null,
  report_date date not null,
  ads_platform text not null,
  sales_platform_name text not null default 'غير محدد',
  ad_account_name text not null default 'غير محدد',
  parsing_status text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.meta_ads (
  id text primary key,
  report_date date not null,
  sales_platform_name text not null default 'غير محدد',
  ad_account_name text not null default 'غير محدد',
  campaign_name text not null,
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
  source_file_id text,
  created_at timestamptz not null default now()
);

create table if not exists public.tiktok_ads (
  id text primary key,
  report_date date not null,
  sales_platform_name text not null default 'غير محدد',
  ad_account_name text not null default 'غير محدد',
  campaign_name text not null,
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
  source_file_id text,
  created_at timestamptz not null default now()
);

create table if not exists public.platform_settings (
  id text primary key,
  platform_name text not null unique,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.ocr_page_corrections (
  id text primary key,
  wrong_value text not null,
  correct_value text not null,
  created_at timestamptz not null default now(),
  usage_count integer not null default 0
);

create table if not exists public.ocr_salesperson_corrections (
  id text primary key,
  wrong_value text not null,
  correct_value text not null,
  salesperson_code text not null default '',
  created_at timestamptz not null default now(),
  usage_count integer not null default 0
);

create table if not exists public.salespeople (
  id text primary key,
  code text not null unique,
  name text not null,
  active boolean not null default true
);

create table if not exists public.platforms (
  id text primary key,
  name text not null unique,
  aliases text[] not null default '{}',
  active boolean not null default true
);

-- Section 19 decision: one upload = one brand, never a mix. Master list of
-- brands, mirroring platforms/salespeople above.
create table if not exists public.brands (
  id text primary key,
  name text not null unique,
  active boolean not null default true
);

-- Column-mapping wizard memory: a user-confirmed column layout for a sales
-- upload, keyed by the exact header signature it was confirmed for, so the
-- same file structure is recognized automatically next time instead of
-- falling back to the wizard again.
create table if not exists public.column_mappings (
  id text primary key,
  signature text not null unique,
  mapping jsonb not null,
  sheet_label text,
  created_at timestamptz not null default now(),
  usage_count integer not null default 0
);

create index if not exists idx_column_mappings_signature on public.column_mappings (signature);

create table if not exists public.daily_summary (
  id text primary key,
  report_date date not null unique,
  total_sales_revenue numeric not null default 0,
  total_orders integer not null default 0,
  total_ads_spend numeric not null default 0,
  meta_spend numeric not null default 0,
  tiktok_spend numeric not null default 0,
  roas numeric,
  roi numeric,
  cpa numeric,
  average_order_value numeric,
  spend_to_sales_ratio numeric,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.ads_raw_files add column if not exists ad_account_name text not null default 'غير محدد';
alter table public.meta_ads add column if not exists ad_account_name text not null default 'غير محدد';
alter table public.meta_ads add column if not exists messages_count integer not null default 0;
alter table public.meta_ads add column if not exists comments_count integer not null default 0;
alter table public.tiktok_ads add column if not exists ad_account_name text not null default 'غير محدد';
alter table public.tiktok_ads add column if not exists messages_count integer not null default 0;
alter table public.tiktok_ads add column if not exists comments_count integer not null default 0;

-- Section 15 (File Versioning): "replace" marks the current file superseded
-- instead of deleting it, then inserts a new version. Old versions stay in
-- the database, inspectable, until an explicit purge.
alter table public.sales_raw_files add column if not exists version integer not null default 1;
alter table public.sales_raw_files add column if not exists is_current boolean not null default true;
alter table public.sales_raw_files add column if not exists superseded_at timestamptz;
alter table public.sales_raw_files add column if not exists superseded_by text;

-- Section 19 decision: one upload = one brand. A versioned slot is now
-- (report_date, brand_name), not just report_date, matching Ads below.
alter table public.sales_raw_files add column if not exists brand_name text not null default 'غير محدد';
alter table public.sales_by_salesperson add column if not exists brand_name text not null default 'غير محدد';
alter table public.sales_by_platform add column if not exists brand_name text not null default 'غير محدد';
drop index if exists idx_sales_raw_files_current_per_day;
create unique index if not exists idx_sales_raw_files_current_slot
  on public.sales_raw_files(report_date, brand_name) where is_current;

alter table public.ads_raw_files add column if not exists version integer not null default 1;
alter table public.ads_raw_files add column if not exists is_current boolean not null default true;
alter table public.ads_raw_files add column if not exists superseded_at timestamptz;
alter table public.ads_raw_files add column if not exists superseded_by text;
create unique index if not exists idx_ads_raw_files_current_slot
  on public.ads_raw_files(report_date, ads_platform, sales_platform_name, ad_account_name) where is_current;

create index if not exists idx_ocr_page_corrections_wrong_value on public.ocr_page_corrections (wrong_value);
create index if not exists idx_ocr_salesperson_corrections_wrong_code on public.ocr_salesperson_corrections (wrong_value, salesperson_code);

-- Section 13 (User Roles & Permissions): one row per authenticated user.
-- Section 20 (Multi-Workspace): "workspace" gates which workspace(s) a
-- non-owner may enter - see supabase/migrations/0003_add_workspace_to_profiles.sql
-- for the same column applied to an already-deployed database.
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null,
  email text not null default '',
  role text not null default 'viewer' check (
    role in ('owner','admin','marketing_manager','media_buyer','sales_manager','data_entry','viewer')
  ),
  workspace text not null default 'cosmetics' check (workspace in ('cosmetics','home')),
  active boolean not null default true,
  created_at timestamptz not null default now()
);

-- Section 14 (Audit Log): append-only. No update/delete policy exists for
-- this table anywhere in this file - that is intentional, not an omission.
create table if not exists public.audit_log (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id),
  user_role text not null,
  action text not null,
  entity_type text not null,
  entity_id text,
  previous_value jsonb,
  new_value jsonb,
  metadata jsonb,
  created_at timestamptz not null default now()
);

-- Section 16 (Backup & Restore): one row per daily/manual backup attempt.
create table if not exists public.backup_runs (
  id uuid primary key default gen_random_uuid(),
  started_at timestamptz not null,
  completed_at timestamptz,
  status text not null check (status in ('running','success','failed')),
  destination text not null,
  location_ref text,
  table_row_counts jsonb,
  file_count integer not null default 0,
  triggered_by text not null,
  error_message text
);

-- Section 17 (System Health Monitoring): one current-status row per
-- monitored component, upserted in place - not an append-only log.
create table if not exists public.system_health_status (
  component text primary key,
  status text not null check (status in ('ok','degraded','down','unknown')),
  last_success_at timestamptz,
  last_failure_at timestamptz,
  last_error_message text,
  updated_at timestamptz not null default now()
);

-- Section 18 (Notification Center): ephemeral, markable-as-read alert
-- inbox - distinct from the permanent audit_log.
create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  severity text not null check (severity in ('info','warning','error','critical')),
  category text not null check (category in ('ocr','backup','upload','migration','storage','system')),
  title text not null,
  message text not null,
  related_entity_type text,
  related_entity_id text,
  is_read boolean not null default false,
  read_at timestamptz,
  read_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);

alter table public.sales_raw_files enable row level security;
alter table public.sales_by_salesperson enable row level security;
alter table public.sales_by_platform enable row level security;
alter table public.ads_raw_files enable row level security;
alter table public.meta_ads enable row level security;
alter table public.tiktok_ads enable row level security;
alter table public.platform_settings enable row level security;
alter table public.daily_summary enable row level security;
alter table public.ocr_page_corrections enable row level security;
alter table public.ocr_salesperson_corrections enable row level security;
alter table public.salespeople enable row level security;
alter table public.platforms enable row level security;
alter table public.brands enable row level security;
alter table public.column_mappings enable row level security;
alter table public.profiles enable row level security;
alter table public.audit_log enable row level security;
alter table public.backup_runs enable row level security;
alter table public.system_health_status enable row level security;
alter table public.notifications enable row level security;

drop policy if exists "public_select_sales_raw_files" on public.sales_raw_files;
drop policy if exists "public_write_sales_raw_files" on public.sales_raw_files;
create policy "public_select_sales_raw_files" on public.sales_raw_files for select using (true);
create policy "public_write_sales_raw_files" on public.sales_raw_files for all using (true) with check (true);

drop policy if exists "public_select_sales_by_salesperson" on public.sales_by_salesperson;
drop policy if exists "public_write_sales_by_salesperson" on public.sales_by_salesperson;
create policy "public_select_sales_by_salesperson" on public.sales_by_salesperson for select using (true);
create policy "public_write_sales_by_salesperson" on public.sales_by_salesperson for all using (true) with check (true);

drop policy if exists "public_select_sales_by_platform" on public.sales_by_platform;
drop policy if exists "public_write_sales_by_platform" on public.sales_by_platform;
create policy "public_select_sales_by_platform" on public.sales_by_platform for select using (true);
create policy "public_write_sales_by_platform" on public.sales_by_platform for all using (true) with check (true);

drop policy if exists "public_select_ads_raw_files" on public.ads_raw_files;
drop policy if exists "public_write_ads_raw_files" on public.ads_raw_files;
create policy "public_select_ads_raw_files" on public.ads_raw_files for select using (true);
create policy "public_write_ads_raw_files" on public.ads_raw_files for all using (true) with check (true);

drop policy if exists "public_select_meta_ads" on public.meta_ads;
drop policy if exists "public_write_meta_ads" on public.meta_ads;
create policy "public_select_meta_ads" on public.meta_ads for select using (true);
create policy "public_write_meta_ads" on public.meta_ads for all using (true) with check (true);

drop policy if exists "public_select_tiktok_ads" on public.tiktok_ads;
drop policy if exists "public_write_tiktok_ads" on public.tiktok_ads;
create policy "public_select_tiktok_ads" on public.tiktok_ads for select using (true);
create policy "public_write_tiktok_ads" on public.tiktok_ads for all using (true) with check (true);

drop policy if exists "public_select_platform_settings" on public.platform_settings;
drop policy if exists "public_write_platform_settings" on public.platform_settings;
create policy "public_select_platform_settings" on public.platform_settings for select using (true);
create policy "public_write_platform_settings" on public.platform_settings for all using (true) with check (true);

drop policy if exists "public_select_daily_summary" on public.daily_summary;
drop policy if exists "public_write_daily_summary" on public.daily_summary;
create policy "public_select_daily_summary" on public.daily_summary for select using (true);
create policy "public_write_daily_summary" on public.daily_summary for all using (true) with check (true);

drop policy if exists "public_select_ocr_page_corrections" on public.ocr_page_corrections;
drop policy if exists "public_write_ocr_page_corrections" on public.ocr_page_corrections;
create policy "public_select_ocr_page_corrections" on public.ocr_page_corrections for select using (true);
create policy "public_write_ocr_page_corrections" on public.ocr_page_corrections for all using (true) with check (true);

drop policy if exists "public_select_ocr_salesperson_corrections" on public.ocr_salesperson_corrections;
drop policy if exists "public_write_ocr_salesperson_corrections" on public.ocr_salesperson_corrections;
create policy "public_select_ocr_salesperson_corrections" on public.ocr_salesperson_corrections for select using (true);
create policy "public_write_ocr_salesperson_corrections" on public.ocr_salesperson_corrections for all using (true) with check (true);

drop policy if exists "public_select_salespeople" on public.salespeople;
drop policy if exists "public_write_salespeople" on public.salespeople;
create policy "public_select_salespeople" on public.salespeople for select using (true);
create policy "public_write_salespeople" on public.salespeople for all using (true) with check (true);

drop policy if exists "public_select_platforms" on public.platforms;
drop policy if exists "public_write_platforms" on public.platforms;
create policy "public_select_platforms" on public.platforms for select using (true);
create policy "public_write_platforms" on public.platforms for all using (true) with check (true);

drop policy if exists "public_select_brands" on public.brands;
drop policy if exists "public_write_brands" on public.brands;
create policy "public_select_brands" on public.brands for select using (true);
create policy "public_write_brands" on public.brands for all using (true) with check (true);

drop policy if exists "public_select_column_mappings" on public.column_mappings;
drop policy if exists "public_write_column_mappings" on public.column_mappings;
create policy "public_select_column_mappings" on public.column_mappings for select using (true);
create policy "public_write_column_mappings" on public.column_mappings for all using (true) with check (true);

drop policy if exists "public_select_profiles" on public.profiles;
drop policy if exists "public_write_profiles" on public.profiles;
create policy "public_select_profiles" on public.profiles for select using (true);
create policy "public_write_profiles" on public.profiles for all using (true) with check (true);

-- audit_log is append-only by construction: insert + select only, no
-- update/delete policy exists at all, so no application code path (not
-- even an Owner's) can alter or erase history. See supabase/rls-role-based.sql
-- for the role-scoped version of these open policies.
drop policy if exists "public_select_audit_log" on public.audit_log;
drop policy if exists "public_insert_audit_log" on public.audit_log;
create policy "public_select_audit_log" on public.audit_log for select using (true);
create policy "public_insert_audit_log" on public.audit_log for insert with check (true);

drop policy if exists "public_select_backup_runs" on public.backup_runs;
drop policy if exists "public_write_backup_runs" on public.backup_runs;
create policy "public_select_backup_runs" on public.backup_runs for select using (true);
create policy "public_write_backup_runs" on public.backup_runs for all using (true) with check (true);

drop policy if exists "public_select_system_health_status" on public.system_health_status;
drop policy if exists "public_write_system_health_status" on public.system_health_status;
create policy "public_select_system_health_status" on public.system_health_status for select using (true);
create policy "public_write_system_health_status" on public.system_health_status for all using (true) with check (true);

drop policy if exists "public_select_notifications" on public.notifications;
drop policy if exists "public_write_notifications" on public.notifications;
create policy "public_select_notifications" on public.notifications for select using (true);
create policy "public_write_notifications" on public.notifications for all using (true) with check (true);

do $$
begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'sales_raw_files') then
    alter publication supabase_realtime add table public.sales_raw_files;
  end if;
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'sales_by_salesperson') then
    alter publication supabase_realtime add table public.sales_by_salesperson;
  end if;
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'sales_by_platform') then
    alter publication supabase_realtime add table public.sales_by_platform;
  end if;
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'ads_raw_files') then
    alter publication supabase_realtime add table public.ads_raw_files;
  end if;
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'meta_ads') then
    alter publication supabase_realtime add table public.meta_ads;
  end if;
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'tiktok_ads') then
    alter publication supabase_realtime add table public.tiktok_ads;
  end if;
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'platform_settings') then
    alter publication supabase_realtime add table public.platform_settings;
  end if;
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'ocr_page_corrections') then
    alter publication supabase_realtime add table public.ocr_page_corrections;
  end if;
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'ocr_salesperson_corrections') then
    alter publication supabase_realtime add table public.ocr_salesperson_corrections;
  end if;
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'salespeople') then
    alter publication supabase_realtime add table public.salespeople;
  end if;
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'platforms') then
    alter publication supabase_realtime add table public.platforms;
  end if;
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'brands') then
    alter publication supabase_realtime add table public.brands;
  end if;
end $$;
