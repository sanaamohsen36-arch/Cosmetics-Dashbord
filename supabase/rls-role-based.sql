-- Proposed role-based RLS (section 13). NOT applied automatically and NOT
-- run by schema.sql. Apply this manually only after Supabase Auth is fully
-- wired into the UI (a login gate exists) - applying it before that would
-- lock every anon request out, since today's app makes only anon-key
-- requests with no session at all.
--
-- Replaces schema.sql's "using (true) with check (true)" policies on the
-- tables below with role checks against public.profiles. Tables not listed
-- here (backup_runs, system_health_status, notifications, audit_log) keep
-- their open policies from schema.sql - notifications/health are read
-- broadly by design, audit_log stays insert+select-only regardless.

create or replace function public.current_role() returns text
language sql security definer stable
as $$
  select role from public.profiles where id = auth.uid()
$$;

-- Sales tables: write access for owner/sales_manager/data_entry.
drop policy if exists "public_write_sales_raw_files" on public.sales_raw_files;
create policy "role_write_sales_raw_files" on public.sales_raw_files for all
  using (public.current_role() in ('owner','sales_manager','data_entry'))
  with check (public.current_role() in ('owner','sales_manager','data_entry'));

drop policy if exists "public_write_sales_by_salesperson" on public.sales_by_salesperson;
create policy "role_write_sales_by_salesperson" on public.sales_by_salesperson for all
  using (public.current_role() in ('owner','sales_manager','data_entry'))
  with check (public.current_role() in ('owner','sales_manager','data_entry'));

drop policy if exists "public_write_sales_by_platform" on public.sales_by_platform;
create policy "role_write_sales_by_platform" on public.sales_by_platform for all
  using (public.current_role() in ('owner','sales_manager','data_entry'))
  with check (public.current_role() in ('owner','sales_manager','data_entry'));

-- Ads tables: write access for owner/marketing_manager/media_buyer.
drop policy if exists "public_write_ads_raw_files" on public.ads_raw_files;
create policy "role_write_ads_raw_files" on public.ads_raw_files for all
  using (public.current_role() in ('owner','marketing_manager','media_buyer'))
  with check (public.current_role() in ('owner','marketing_manager','media_buyer'));

drop policy if exists "public_write_meta_ads" on public.meta_ads;
create policy "role_write_meta_ads" on public.meta_ads for all
  using (public.current_role() in ('owner','marketing_manager','media_buyer'))
  with check (public.current_role() in ('owner','marketing_manager','media_buyer'));

drop policy if exists "public_write_tiktok_ads" on public.tiktok_ads;
create policy "role_write_tiktok_ads" on public.tiktok_ads for all
  using (public.current_role() in ('owner','marketing_manager','media_buyer'))
  with check (public.current_role() in ('owner','marketing_manager','media_buyer'));

-- Master/settings data: owner/marketing_manager/sales_manager only.
drop policy if exists "public_write_platform_settings" on public.platform_settings;
create policy "role_write_platform_settings" on public.platform_settings for all
  using (public.current_role() in ('owner','marketing_manager','sales_manager'))
  with check (public.current_role() in ('owner','marketing_manager','sales_manager'));

drop policy if exists "public_write_salespeople" on public.salespeople;
create policy "role_write_salespeople" on public.salespeople for all
  using (public.current_role() in ('owner','marketing_manager','sales_manager'))
  with check (public.current_role() in ('owner','marketing_manager','sales_manager'));

drop policy if exists "public_write_platforms" on public.platforms;
create policy "role_write_platforms" on public.platforms for all
  using (public.current_role() in ('owner','marketing_manager','sales_manager'))
  with check (public.current_role() in ('owner','marketing_manager','sales_manager'));

-- Profiles: anyone reads (role display), only Owner assigns/changes roles.
drop policy if exists "public_write_profiles" on public.profiles;
create policy "role_write_own_profile" on public.profiles for update
  using (id = auth.uid() or public.current_role() = 'owner')
  with check (
    id = auth.uid() and role = public.current_role() -- self-updates cannot change own role
    or public.current_role() = 'owner'
  );

-- All authenticated roles can read reports/mapping data - reports.view is
-- universal in the section 13 capability matrix, so the schema.sql open
-- select policies on sales_by_*/ads/meta_ads/tiktok_ads/column_mappings/
-- ocr_*_corrections are left as-is here (select using (true)).
