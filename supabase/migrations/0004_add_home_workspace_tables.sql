-- Idempotent. Safe to run multiple times.
--
-- Phase 2 (Home workspace): dedicated tables, isolated from every Cosmetics
-- table. "workspace" is carried on every row (always 'home' today) so a
-- future workspace can share this same shape without a new schema, per the
-- Phase 1 principle of a workspace column over duplicate schemas.
-- Uniqueness is (workspace, report_date, shift_type) among *current* files -
-- Morning and Evening are independent versioned slots, mirroring Cosmetics'
-- Section 15 file-versioning (superseded rows kept, never deleted on replace).

create table if not exists public.home_sales_raw_files (
  id uuid primary key default gen_random_uuid(),
  workspace text not null default 'home' check (workspace = 'home'),
  report_date date not null,
  shift_type text not null check (shift_type in ('Morning','Evening')),
  upload_key text not null,
  file_name text not null,
  file_url text not null default '',
  uploaded_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  version integer not null default 1,
  is_current boolean not null default true,
  superseded_at timestamptz,
  superseded_by uuid references public.home_sales_raw_files(id)
);

create unique index if not exists uq_home_sales_raw_files_current_slot
  on public.home_sales_raw_files (workspace, report_date, shift_type)
  where is_current;

create table if not exists public.home_sales_by_salesperson (
  id uuid primary key default gen_random_uuid(),
  workspace text not null default 'home' check (workspace = 'home'),
  report_date date not null,
  shift_type text not null check (shift_type in ('Morning','Evening')),
  salesperson_code text not null default '',
  salesperson_name text not null default '',
  team_type text not null default '',
  orders numeric not null default 0,
  revenue numeric not null default 0,
  notes text not null default '',
  source_file_id uuid not null references public.home_sales_raw_files(id) on delete cascade,
  created_at timestamptz not null default now()
);

create table if not exists public.home_sales_by_page (
  id uuid primary key default gen_random_uuid(),
  workspace text not null default 'home' check (workspace = 'home'),
  report_date date not null,
  shift_type text not null check (shift_type in ('Morning','Evening')),
  page_name text not null default '',
  orders numeric not null default 0,
  revenue numeric not null default 0,
  notes text not null default '',
  source_file_id uuid not null references public.home_sales_raw_files(id) on delete cascade,
  created_at timestamptz not null default now()
);

create index if not exists idx_home_sales_by_salesperson_source_file on public.home_sales_by_salesperson (source_file_id);
create index if not exists idx_home_sales_by_page_source_file on public.home_sales_by_page (source_file_id);

alter table public.home_sales_raw_files enable row level security;
alter table public.home_sales_by_salesperson enable row level security;
alter table public.home_sales_by_page enable row level security;

-- Matches the same permissive "using (true)" convention every existing
-- Cosmetics table uses today (docs/ARCHITECTURE.md: RLS-by-role is opt-in,
-- not yet enforced) - workspace access is gated in the app (WorkspaceGuard +
-- requireWorkspaceAccess), not yet at the RLS layer, same as Cosmetics.
drop policy if exists "public_select_home_sales_raw_files" on public.home_sales_raw_files;
drop policy if exists "public_write_home_sales_raw_files" on public.home_sales_raw_files;
create policy "public_select_home_sales_raw_files" on public.home_sales_raw_files for select using (true);
create policy "public_write_home_sales_raw_files" on public.home_sales_raw_files for all using (true) with check (true);

drop policy if exists "public_select_home_sales_by_salesperson" on public.home_sales_by_salesperson;
drop policy if exists "public_write_home_sales_by_salesperson" on public.home_sales_by_salesperson;
create policy "public_select_home_sales_by_salesperson" on public.home_sales_by_salesperson for select using (true);
create policy "public_write_home_sales_by_salesperson" on public.home_sales_by_salesperson for all using (true) with check (true);

drop policy if exists "public_select_home_sales_by_page" on public.home_sales_by_page;
drop policy if exists "public_write_home_sales_by_page" on public.home_sales_by_page;
create policy "public_select_home_sales_by_page" on public.home_sales_by_page for select using (true);
create policy "public_write_home_sales_by_page" on public.home_sales_by_page for all using (true) with check (true);
