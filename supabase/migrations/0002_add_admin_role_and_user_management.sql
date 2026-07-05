-- Idempotent. Safe to run multiple times, and safe to run whether or not
-- 0001_bootstrap_production.sql has already been applied.
--
-- Adds what the new User Management system (Users page, "admin" role,
-- Email/Last Login columns) needs on top of the existing profiles table:
--   1. "admin" as a valid role alongside the existing six.
--   2. An email column on profiles (auth.users already has email, but it's
--      in the auth schema, not exposed to the app's normal RLS-scoped
--      queries - this is a denormalized, app-writable copy, backfilled once
--      below and kept in sync going forward by lib/auth.ts / the
--      /api/admin/users routes on every create/insert).

alter table public.profiles add column if not exists email text not null default '';

update public.profiles p
set email = u.email
from auth.users u
where p.id = u.id and p.email = '';

alter table public.profiles drop constraint if exists profiles_role_check;
alter table public.profiles add constraint profiles_role_check
  check (role in ('owner','admin','marketing_manager','media_buyer','sales_manager','data_entry','viewer'));
