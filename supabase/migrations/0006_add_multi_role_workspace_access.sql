-- Idempotent. Safe to run multiple times.
--
-- Adds additive, per-workspace composable roles ("roles") and multi-
-- workspace access ("workspaces") on profiles, alongside the existing
-- single role/workspace columns (kept for Owner detection and legacy
-- admin/viewer/media_buyer capabilities - Settings/Backup/Audit/Users -
-- which this change does not touch).
--
-- Backfill widens scope for legacy roles that don't map 1:1 to the new
-- three (data_entry, sales_manager, marketing_manager), so no existing
-- user's access is reduced by this migration.

alter table public.profiles add column if not exists roles text[] not null default '{}';
alter table public.profiles add column if not exists workspaces text[] not null default '{}';

update public.profiles set roles =
  case role
    when 'data_entry' then array['data_entry']
    when 'sales_manager' then array['sales_manager']
    when 'marketing_manager' then array['marketing_manager']
    when 'media_buyer' then array['marketing_manager','data_entry']
    when 'admin' then array['data_entry','sales_manager','marketing_manager']
    when 'viewer' then array['sales_manager','marketing_manager']
    else '{}'
  end
where roles = '{}';

update public.profiles set workspaces = array[workspace] where workspaces = '{}';

alter table public.profiles drop constraint if exists profiles_roles_check;
alter table public.profiles add constraint profiles_roles_check
  check (roles <@ array['data_entry','sales_manager','marketing_manager']::text[]);

alter table public.profiles drop constraint if exists profiles_workspaces_check;
alter table public.profiles add constraint profiles_workspaces_check
  check (workspaces <@ array['cosmetics','home']::text[]);
