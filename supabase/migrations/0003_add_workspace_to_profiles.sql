-- Idempotent. Safe to run multiple times.
--
-- Section 20 (Multi-Workspace): every profile belongs to exactly one
-- workspace. "owner" bypasses this restriction in application code
-- (lib/workspaces.ts) regardless of the value stored here. Existing rows are
-- backfilled to 'cosmetics' - the one workspace with real data before this
-- migration - so no current user's access changes.

alter table public.profiles add column if not exists workspace text not null default 'cosmetics';

update public.profiles set workspace = 'cosmetics' where workspace is null or workspace = '';

alter table public.profiles drop constraint if exists profiles_workspace_check;
alter table public.profiles add constraint profiles_workspace_check
  check (workspace in ('cosmetics','home'));
