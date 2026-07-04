# Architecture Document

Status: **FROZEN — approved reference architecture.** Approved in full,
including sections 13–18 (roles & permissions, audit log, file versioning,
backup & restore, system health monitoring, notification center). This is
now the project's reference architecture. Governance from this point
forward:

- Structural changes (new modules, schema shape, folder layout, provider
  interfaces) require explicit approval before implementation — this
  document is not to be silently reinterpreted.
- New features must conform to this architecture; if a feature seems to
  need a shortcut that violates it (e.g. a full-table wipe, a hard file
  delete, an unlogged action), that's a signal to revisit the plan with the
  Owner, not to route around section 12's guardrails.
- Commits stay small and documented, same discipline as the work already
  merged on `claude/fix-dashboard-system`.
- Sections marked "planned" below are approved designs, not yet
  implemented; "done" items are already merged. This document is updated
  whenever a "planned" item is completed (moved to History) or a frozen
  decision is deliberately revisited with the Owner's sign-off.

This document is the single source of truth for how the Daily Sales + Ads
Dashboard is structured as it grows into the company's internal BI operating
system.

---

## History (what's already done vs. what's planned)

Done, on branch `claude/fix-dashboard-system`:

1. Removed unused `netlify.toml`, unused `prisma/` folder, stale project zip.
2. Fixed the P0 bug where every upload/delete wiped and reinserted all 12
   Supabase tables (`saveData()` was called redundantly after the already-
   correct targeted save/delete functions). New salesperson/platform names
   discovered during parsing are now persisted with a small additive-only
   `saveMasterDataAdditions()` instead.
3. Fixed the P1 bug where editing `leads`/`cpc` in the Ads preview table was
   silently discarded at save time.
4. Built the OCR provider abstraction (`src/lib/ocr/`) with Gemini Vision as
   the first implementation, wired into Sales image uploads, keeping the API
   key server-side only.
5. Recreated the missing `.env.example`.

Planned, not yet implemented (this document describes the target so all of
this can proceed without re-litigating structure):

- Name/platform normalization for cross-day aggregation (P2 bug).
- Local-midnight date bug fix (P2 bug).
- Migration from the current flat Supabase schema to the normalized
  brand/file/data schema described below.
- Splitting the current single-file `src/App.tsx` (1,300+ lines) into the
  feature-module folder structure described below.
- Mapping-memory wiring (corrections tables exist in the DB today but are
  not yet read or written by any code path).
- Multi-brand support beyond Ads (Sales currently has no brand dimension).
- **User roles & permissions** (section 13), **audit log** (section 14), and
  **file versioning** (section 15) — approved direction as of this revision,
  no code written yet. These three are interdependent: audit log entries
  need a real "user," which needs auth/roles to exist first; file-version
  restore/purge actions need a capability to gate them.
- **Backup & Restore strategy** (section 16) — approved direction as of this
  revision, no code written yet. Depends on file versioning (section 15,
  backups must capture superseded versions too) and surfaces a real
  prerequisite gap: uploaded files are not actually stored as blobs
  anywhere today (see section 16), so "recoverable file uploads" needs that
  fixed first.
- **System Health Monitoring** (section 17) and **Notification Center**
  (section 18) — approved direction as of this revision, no code written
  yet. Both are cross-cutting: they hook into OCR (section 5), Backup
  (section 16), and future cron/migration work, and both depend on the
  `system_health.view`/`notifications.view` capabilities (section 13).

---

## 1. Current system overview

- **Framework**: Next.js 14 (App Router), single client component
  (`"use client"` in `src/App.tsx`) renders all 6 pages, all upload cards,
  and all tables/charts. This is the main thing the module-structure
  migration (section 2) fixes.
- **Database**: Supabase Postgres, `@supabase/supabase-js` client using only
  the public anon key (no service-role key in client code — correct). RLS is
  enabled on every table but every policy is `using (true) with check
  (true)`: fully public read/write to anyone holding the anon key. This was
  an acknowledged MVP tradeoff; section 13 is the concrete plan that
  replaces it with role-based policies, so it is no longer an open-ended
  "revisit someday" item.
- **Identity**: none today. There is no login, no concept of "who did this."
  Section 13 introduces Supabase Auth to fix that.
- **Realtime**: Supabase Realtime subscription on all core tables triggers a
  full reload of the entire dataset into browser memory on any change.
- **Data model today**: the whole app state (`AppData`) is loaded via
  `select *` on every table into one in-memory object; every report/KPI/chart
  is computed client-side from that blob. No pagination, no server-side
  filtering yet. Fine at current data volumes; will need revisiting once
  history spans many months across multiple brands.
- **Hosting**: Vercel (`vercel.json` present, `netlify.toml` removed as
  unused).
- **Nav structure**: already matches the required 6 pages — Home Dashboard,
  Sales Upload, Ads Upload, Sales Report, Page Report, Settings.

---

## 2. Final module structure

Target layout (migration not yet executed):

```
src/
  app/                        # Next.js routing only — thin, no business logic
    page.tsx
    layout.tsx
    api/
      ocr/sales/route.ts      # done
      upload-auth/route.ts
      backup/run/route.ts      # daily backup job target, section 16
      backup/restore/route.ts  # Owner-gated restore trigger, section 16
      (future: assistant/, telegram/, ads-sync/ ...)
  features/
    sales-upload/             # calendar, preview tables, save/delete/replace logic
    ads-upload/                # brand+platform tabs, multi-file preview, save/delete
    dashboard/                  # KPIs, charts, filters
    sales-report/
    page-report/
    settings/                   # incl. user/role management UI (section 13)
  lib/
    supabase/                  # one place that talks to Supabase; typed table helpers
    mapping-memory/             # normalization + correction store (planned, section 5)
    ocr/                        # done — provider-agnostic interface + adapters
    brands/                     # brand master data (planned, multi-brand)
    permissions/                 # role -> capability map (section 13)
    audit/                       # centralized logAction() helper (section 14)
    backup/                      # BackupDestination interface + run/restore orchestration (section 16)
    health/                      # reportHealth() helper + system_health_status reads (section 17)
    notifications/               # notify() helper + NotificationChannel interface (section 18)
  types/                       # domain types, split per feature where useful
```

**Rule going forward**: a feature folder owns its own components and its own
save/delete/parse logic. Anything shared by 2+ features lives in `lib/`.
Nothing in `features/` imports Supabase directly — it goes through
`lib/supabase/`.

---

## 3. Database schema plan

Two schema files exist today:

- `supabase/schema.sql` — the **flat schema**, what the app currently reads
  and writes: `sales_raw_files`, `sales_by_salesperson`, `sales_by_platform`,
  `ads_raw_files`, `meta_ads`, `tiktok_ads`, `platform_settings`,
  `daily_summary` (write-only, never read back — effectively dead),
  `ocr_page_corrections`, `ocr_salesperson_corrections`, `salespeople`,
  `platforms`.
- `supabase/folder-calendar-structure.sql` — a **normalized schema**
  (`brands`, `sales_files`, `salespeople_sales`, `pages_sales`, `ads_files`,
  `ads_data`, `daily_combined_summary`) that was started but never wired into
  the app code.

**Decision**: migrate onto the normalized schema. It already models exactly
what the roadmap needs — a `brands` table, per-day file records with
`on delete cascade` child rows, and a per-brand daily summary — instead of
continuing to patch the flat one.

Planned migration path:

1. Add any columns the flat schema has that the normalized one is missing
   (e.g. `ad_account_name`, `messages_count`, `comments_count` on
   `ads_data`; keep `ocr_page_corrections`/`ocr_salesperson_corrections`/
   `salespeople`/`platforms` as-is — they're shared master/mapping tables,
   not part of either schema specifically).
2. Add a `brand_id` to `sales_files` (today only `ads_files`/`ads_data` are
   brand-scoped — Sales Upload currently has no brand dimension at all). This
   needs a product decision on whether one company's daily sales report can
   ever span multiple brands in one file, or whether brand is always
   Sales-Upload's first selector too, mirroring Ads Upload. **Open question,
   to confirm before multi-brand work starts** (section 19).
3. Add the tables and columns introduced by this revision:
   - `profiles` (section 13) — one row per authenticated user, holding role.
   - `audit_log` (section 14) — append-only action log.
   - Versioning columns on `sales_files` and `ads_files` (section 15) —
     `version`, `is_current`, `superseded_at`, `superseded_by`, plus
     replacing their plain unique constraints with partial unique indexes
     scoped to `is_current`.
   - `backup_runs` (section 16) — one row per daily/manual backup attempt,
     so retention pruning and restore both know what snapshots exist.
   - `system_health_status` (section 17) — one current-status row per
     monitored component (OCR, storage, backup, cron, api, per-module sync).
   - `notifications` (section 18) — actionable alert inbox, distinct from
     the permanent `audit_log`.
4. Update `src/lib/supabase/` (new home for storage functions) to read/write
   the normalized tables; keep the flat tables in place but unused during a
   transition window.
5. Verify against a staging Supabase project, then drop the flat tables in a
   dedicated migration once confirmed safe.
6. Retire `daily_summary` (dead, write-only today) in favor of
   `daily_combined_summary`, which already supports per-brand rows.

RLS: today's `using (true) with check (true)` policies are superseded by the
role-based policies in section 13 once that work lands — not an indefinite
MVP tradeoff anymore, but the migration hasn't been executed yet.

---

## 4. Upload flow architecture

Both Sales and Ads follow the same shape, parameterized by their own rules:

```
Select day (Sales) / Select brand → day → platform (Ads)
  → Choose file (Excel/CSV/image for Sales; CSV for Ads)
  → Parse (see section 5 for OCR; direct sheet read for Excel/CSV)
  → Validate (column detection, required-field checks, numeric parsing)
  → Editable Preview (user can correct any cell before saving)
  → Confirm Save
  → Targeted Supabase write (insert only; "replace" creates a new file
    version rather than deleting — see section 15 — never a full-table wipe,
    per the P0 fix)
  → Audit log entry written (section 14)
  → Realtime notifies other open tabs → dashboard/report aggregation re-reads
    (current-version rows only, per section 15)
```

Rules enforced by the module:

- **Sales**: one *current* saved upload per calendar day. A second upload on
  the same day creates a **new version** (section 15) — the previous
  version is marked superseded, not deleted. Deleting the current version
  resets the day's visible state; permanently purging historical data is a
  separate, gated action (section 15).
- **Ads**: multiple files per day are allowed, scoped by
  brand + day + platform. Uploading again for the same brand/day/platform is
  a **merge** (adds rows, does not replace) — multiple ad accounts/exports
  for one platform in one day are expected. Deleting a file removes only
  that file's own rows (`source_file_id` scoped), never siblings. If a
  single already-saved ads file itself needs correcting, that follows the
  same versioning path as Sales (section 15) rather than a hard delete.
- Every upload, replace, delete, and preview edit is subject to the
  capability checks in section 13 and produces an audit log entry
  (section 14).

---

## 5. OCR architecture

Already implemented in `src/lib/ocr/` (see commit history):

```
Upload File (image)
  → OCR Provider   (src/lib/ocr/geminiProvider.ts, behind OcrProvider interface)
  → Structured JSON  ({ rows: unknown[][], warnings, providerId })
  → Validation       (shared with Excel: processGridIntoMaps() in workbookParsers.ts)
  → Editable Preview  (same tables Excel uploads use)
  → Save to Database  (same saveSalesUpload() path)
```

- **Interface** (`src/lib/ocr/types.ts`): `OcrProvider.extractSalesTable(imageBase64, context) -> { rows, warnings, providerId }`.
  Nothing outside `lib/ocr/` and the one API route knows which vendor is in use.
- **Provider selection**: `getOcrProvider()` in `src/lib/ocr/index.ts` reads
  `OCR_PROVIDER` (default `gemini-vision`). Adding Google Vision, Azure
  Document Intelligence, or OpenAI Vision later is one new file implementing
  the interface + one new `case` in the switch — no changes to upload flow
  or business logic, per the requirement that started this work.
- **Key handling**: the Gemini API key is read server-side only, inside
  `src/app/api/ocr/sales/route.ts`. The browser posts the raw image via
  `FormData` to that route (`src/lib/ocr/client.ts`) and only ever sees the
  resulting JSON, never the key.
- **Shared validation**: OCR output is a row-major grid, deliberately the
  same shape `XLSX.utils.sheet_to_json(sheet, { header: 1 })` produces, so it
  runs through the exact same header-detection, shift-classification, and
  numeric-validation code as an Excel upload. One set of business rules, two
  entry points.

Planned, not yet built: **mapping-memory** application. `ocr_page_corrections`
and `ocr_salesperson_corrections` tables exist and are loaded into app state,
but nothing currently reads from or writes to them. The planned hook point is
between "Structured JSON" and "Validation": before column/row detection runs,
look up any known wrong→correct substitutions for salesperson names and page
names and apply them; when a user manually edits a preview cell whose
original OCR/parsed value differs, save that correction back to the
appropriate table (with a `usage_count` increment on repeat, per existing
schema), and log it via `lib/audit/logAction()` (section 14). This is
intentionally provider-agnostic — it lives in `lib/mapping-memory/`, not
inside any OCR provider.

---

## 6. Sales module architecture

- **UI**: calendar grid of the selected month, each day marked
  Uploaded/Empty. Selecting a day shows its current file version (if any),
  a link to that day's version history, or the upload control.
- **Parsing**: `parseSalesWorkbook` (Excel/CSV) or `parseSalesImage` (OCR) →
  both return `{ people: SalesBySalesperson[], platforms: SalesByPlatform[], errors: string[] }`.
  Detects two possible tables per file: salespeople (name, code, shift,
  orders, value) and pages/platforms (name, category, shift, orders, value),
  with subtotal/grand-total row classification so those rows don't pollute
  aggregation.
- **Editable preview**: `EditablePeopleTable` / `EditablePlatformTable`, plus
  a totals-reconciliation banner comparing salespeople-sum vs. platform-sum
  vs. the file's own printed grand total, warning on mismatch.
- **Save**: `saveSalesUpload()` — creates a new version (section 15) if the
  day already has a current file, otherwise a first version. New
  salesperson/platform names encountered are registered via the additive
  `saveMasterDataAdditions()` (not a full rewrite).
- **Delete**: removes the *current* version's visibility per section 15;
  permanent removal of any version's rows is a separate, gated, audited
  action — not the default "Delete" button behavior once versioning lands.
- Gated by `sales_upload.*` capabilities (section 13); every action logged
  (section 14).

---

## 7. Ads module architecture

- **UI**: brand tabs → calendar grid (per brand) → platform selector
  (Facebook Ads, Instagram Ads, WhatsApp Ads, TikTok Ads, WhatsApp TikTok
  Ads, Other) → file list for that exact brand/day/platform combination.
- **Storage note**: today the six display platforms collapse into two
  underlying tables (`meta_ads`/`tiktok_ads`) via a simple `adsPlatformKind()`
  name-sniff (anything containing "tiktok"/"تيك" → TikTok table, else Meta).
  The display platform name is preserved in `ad_account_name` for filtering.
  This is a deliberate simplification of the current flat schema; the
  normalized schema (section 3) models `ads_platform` as free text per row
  instead, which removes this two-bucket constraint going forward.
- **Parsing**: `parseAdsWorkbook(file, platform, date, sourceFileId)` — CSV
  only per the product requirement (no OCR for ads). Detects campaign/ad
  set/ad, spend, impressions, reach, clicks, CTR/CPC/CPM, and a generic
  "results" column that gets mapped to leads/messages/comments depending on
  the result-type label.
- **Editable preview**: `EditableAdsTable`. As of the P1 fix, user edits to
  `leads`/`cpc` are resolved once at preview time and never silently
  overwritten at save.
- **Save**: always merge (multiple files per day are expected).
- **Delete**: scoped strictly to the one file's `source_file_id` — never
  touches sibling files for the same brand/day/platform. Permanent purge
  vs. current-version delete follows the same section 15 model as Sales.
- Gated by `ads_upload.*` capabilities (section 13); every action logged
  (section 14).

---

## 8. Reports module architecture

- **Sales Report** (`SalesReportsPage`): sales-by-salesperson and
  sales-by-page/platform breakdowns with order/revenue share and AOV, plus a
  daily summary table.
- **Page Report** (`PageReportPage`): page performance (orders, revenue,
  share, AOV, related ad spend, ROAS, CPA) and an ads-platform comparison
  table, plus trend chart.
- **Known gap to resolve during the module migration**: `AdsReportsPage`
  (ads-by-brand, ads-by-platform, raw Meta/TikTok tables, combined
  spend/ROAS/ROI/CPA by date) is fully implemented but **not reachable from
  any nav item** — it was left behind when the nav was restructured into the
  current 6 pages. Decision needed: fold its content into Page Report, or
  keep it as a distinct view. Not resolved in this document; flagged for the
  reports-module work.
- Both report pages are visible to every role by default (`reports.view`,
  section 13) — reports are read-only and not currently planned to be
  directly editable; if that changes, edits must go through the same
  audit-logged path as everything else.

---

## 9. Aggregation/calculation logic

All in `src/lib/metrics.ts`, computed client-side over the in-memory
dataset filtered to the selected date range:

- **Revenue/orders**: summed from `salesBySalesperson` (source of truth for
  totals; platform rows are a parallel breakdown of the same data, reconciled
  at preview time, not summed twice).
- **Ads spend**: summed separately for Meta and TikTok, then combined.
- **ROAS** = totalSalesRevenue / totalAdsSpend.
- **ROI** = (totalSalesRevenue − totalAdsSpend) / totalAdsSpend × 100.
- **CPA** = totalAdsSpend / totalOrders.
- **AOV** = totalSalesRevenue / totalOrders.
- **Messages/Comments**: summed from ads rows' `messagesCount`/`commentsCount`.
- All ratios return `null` (rendered as "N/A") when the denominator is zero,
  not `0` — one existing inconsistency (`messageConversionRate`) does return
  `0` instead of `null`, but that field isn't currently displayed anywhere.
- **Best-performer labels** (top salesperson/platform by orders/revenue) are
  derived from the same aggregation, not queried separately.

**Known unresolved issue (planned fix, not yet done)**: `aggregatePeople`
and `aggregatePlatforms` key by raw `salespersonCode-salespersonName` /
raw `platformName` with no normalization across different days' uploads.
A name typed with a stray space or a different Arabic letter variant on two
different days currently produces two separate rows instead of merging.
The planned fix shares a normalization helper between parsing (already
partially normalizes for header matching) and aggregation (currently does
not normalize at all).

**Known unresolved issue (planned fix)**: date values throughout the app
(`today`, `toDateInput`, calendar day generation) are built via
`new Date(...).toISOString().slice(0,10)`, which always renders in UTC. For
any timezone ahead of UTC (Cairo is UTC+2), the first ~2 hours after local
midnight can report yesterday's date. Planned fix: compute local dates
without the UTC round-trip.

**New requirement from file versioning (section 15)**: once versioning
lands, every aggregation/report query must filter to `is_current = true`
(or the equivalent "no superseded rows" join). Superseded versions must
never be double-counted alongside their replacement.

---

## 10. Environment variables

| Variable | Required | Exposed to browser? | Purpose |
|---|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Yes | Yes (by design) | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Yes | Yes (by design — anon key is meant to be public; access control is RLS's job, see section 13) | Supabase anon client key |
| `SUPABASE_SERVICE_ROLE_KEY` | Planned, needed once section 13 lands | **No — server-only** | Admin actions that can't run under a normal user's RLS policy (e.g. inviting a user, assigning/changing a role). Read only inside API routes, never sent to the browser. |
| `OCR_PROVIDER` | No (defaults to `gemini-vision`) | No | Selects the OCR engine |
| `GEMINI_API_KEY` | Yes, if using Gemini OCR | **No — server-only** | Gemini Vision API key, read only inside `src/app/api/ocr/sales/route.ts` |
| `GEMINI_OCR_MODEL` | No (defaults to `gemini-2.0-flash`) | No | Overrides the Gemini model name |
| `UPLOAD_PASSWORD` | No | No | Optional shared password gate, checked by `src/app/api/upload-auth/route.ts`. Superseded in spirit by real per-user auth (section 13), but left as-is until that lands. |
| `BACKUP_STORAGE_PROVIDER` | Planned, needed once section 16 lands | No | Selects the backup destination (defaults to Supabase Storage), same pattern as `OCR_PROVIDER` |
| `BACKUP_CRON_SECRET` | Planned | **No — server-only** | Shared secret the daily Vercel Cron request must present to `app/api/backup/run`, so the endpoint can't be triggered by anyone who finds the URL |
| *(destination-specific, e.g. `GOOGLE_DRIVE_SERVICE_ACCOUNT_KEY`, `BACKUP_S3_*`)* | Only if a non-Supabase destination is configured | **No — server-only** | Credentials for whichever `BackupDestination` is active |

Rule: any future secret (Telegram bot token, n8n webhook secret, Google
Drive service-account key, Meta/TikTok API tokens) follows the same pattern
as `GEMINI_API_KEY`/`SUPABASE_SERVICE_ROLE_KEY` — server-side env var, read
only inside an API route, never a `NEXT_PUBLIC_*` variable.

---

## 11. Folder/file structure

**Current** (as of this freeze):

```
.
├── docs/ARCHITECTURE.md          # this file
├── prisma/                       # removed (was unused)
├── src/
│   ├── App.tsx                   # monolith — all pages/components (target: split, section 2)
│   ├── app/
│   │   ├── layout.tsx, page.tsx
│   │   └── api/
│   │       ├── ocr/sales/route.ts
│   │       └── upload-auth/route.ts
│   ├── lib/
│   │   ├── metrics.ts
│   │   ├── storage.ts            # Supabase read/write (target: move under lib/supabase/)
│   │   ├── supabase.ts           # client init
│   │   ├── workbookParsers.ts    # Excel/CSV + OCR-grid parsing
│   │   └── ocr/                  # provider interface + Gemini adapter
│   ├── types.ts
│   └── styles.css
├── supabase/
│   ├── schema.sql                       # current flat schema (in use)
│   ├── folder-calendar-structure.sql    # normalized schema (target, section 3)
│   └── reset-dashboard-data.sql
├── .env.example
├── next.config.mjs, tsconfig.json, vercel.json, package.json
```

**Target**, once the module migration (section 2) lands — see section 2 for
the full tree, now including `lib/permissions/`, `lib/audit/`,
`lib/backup/`, `lib/health/`, and `lib/notifications/`; only `app/`,
`features/*`, `lib/*`, and `types/` change.

---

## 12. What should not be changed later without approval

- **The `OcrProvider` interface shape** (`extractSalesTable(imageBase64, context) -> { rows, warnings, providerId }`).
  Adding a new provider is always fine; changing the interface itself affects
  every current and future adapter and should be a deliberate, reviewed
  change.
- **The one-current-upload-per-day-per-Sales-file rule** and the
  merge-per-file-for-Ads rule (section 4). These encode real business rules
  (one closing report per day; multiple ad exports per day are normal), not
  incidental behavior.
- **Delete scoping**: sales delete affects only the current version of one
  day; ads delete always removes only the one file's rows. Never widen a
  delete to affect siblings without an explicit request.
- **No full-table wipes as a save mechanism.** The P0 fix in this project's
  history exists because of exactly this pattern; any new save path must use
  targeted insert/update/delete, never delete-all-then-reinsert-all.
- **No hard-deleting a file version as part of a normal "replace" or
  "delete" action** (section 15). Only an explicit, separately-confirmed
  purge action — gated by a dedicated capability — may permanently remove a
  version's data.
- **Audit log entries are append-only.** No application code path may
  update or delete an `audit_log` row, ever (section 14).
- **Role → capability mappings** (section 13) should change deliberately,
  with the Owner's sign-off — not as a side effect of an unrelated feature
  change.
- **Supabase credentials and RLS policy changes.** The move from today's
  fully-open policies to the role-based model in section 13 is now the
  approved direction, but the migration itself — and any further tightening
  or loosening after that — needs a separate, deliberate decision, not a
  side effect of another change.
- **KPI formulas in `lib/metrics.ts`** — changing how ROAS/ROI/CPA/AOV are
  calculated changes historical reporting; needs a documented reason and
  ideally a before/after comparison on real data.
- **Database migrations that drop the flat schema tables** — only after the
  normalized schema is verified working end-to-end in a staging environment.
- **Branch/deploy discipline**: no direct commits to `main`; all work on
  feature branches; push and Vercel preview only after explicit confirmation
  (already the working agreement for this project).
- **Backup retention policy and destinations** (section 16) — changing how
  long backups are kept, or where they're stored, is a deliberate,
  Owner-approved decision, not an incidental config tweak.
- **Restoring from a backup is the one sanctioned exception to "no
  full-table wipes"** (section 16), and only through the dedicated,
  Owner-gated restore path — never as a side effect of a normal save, and
  never silently reachable from application code that isn't the restore
  route itself.
- **Notifications (section 18) are never a substitute for the audit log
  (section 14), and vice versa.** Don't repurpose one table to do the
  other's job — actions belong in `audit_log` (permanent, immutable);
  operational alerts belong in `notifications` (ephemeral, actionable).
- **No swallowed failures.** Any new code path that can fail in a way
  covered by section 17/18's categories (OCR, backup, upload, migration,
  storage) must report through `reportHealth()`/`notify()` — catching an
  error and only logging it to the server console is not sufficient going
  forward.

---

## 13. User Roles & Permissions

**Roles**: Owner, Marketing Manager, Media Buyer, Sales Manager, Data Entry,
Viewer.

**Identity**: the app has no authentication today (anon key only). This
introduces Supabase Auth so every action can be tied to a real user. Each
authenticated user gets exactly one role, stored separately from
`auth.users` (which Supabase manages):

```sql
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null,
  role text not null check (
    role in ('owner','marketing_manager','media_buyer','sales_manager','data_entry','viewer')
  ),
  active boolean not null default true,
  created_at timestamptz not null default now()
);
```

**Permissions are modular capabilities, not hardcoded per-role checks
scattered through the code.** A single list of capability strings is defined
once (`lib/permissions/`) and referenced everywhere a check is needed:

```
sales_upload.upload
sales_upload.replace
sales_upload.delete_current
sales_upload.purge_version
ads_upload.upload
ads_upload.delete
ads_upload.purge_version
preview.edit
mapping_memory.edit
settings.manage_master_data      (platforms/salespeople lists)
settings.manage_users            (assign/change roles)
reports.view
audit_log.view
file_versions.view
file_versions.restore
backup.run_manual
backup.restore
backup.view_history
system_health.view
notifications.view
```

**Proposed default role → capability matrix.** This is a starting point for
discussion, not a locked-in decision — confirm/adjust with the Owner before
implementation:

| Capability | Owner | Marketing Mgr | Media Buyer | Sales Mgr | Data Entry | Viewer |
|---|---|---|---|---|---|---|
| reports.view | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| sales_upload.upload / replace | ✅ | | | ✅ | ✅ | |
| sales_upload.delete_current | ✅ | | | ✅ | | |
| ads_upload.upload | ✅ | ✅ | ✅ | | | |
| ads_upload.delete | ✅ | ✅ | | | | |
| preview.edit | ✅ | ✅ | ✅ | ✅ | ✅ | |
| mapping_memory.edit | ✅ | ✅ | ✅ | ✅ | ✅ | |
| settings.manage_master_data | ✅ | ✅ | | ✅ | | |
| settings.manage_users | ✅ | | | | | |
| audit_log.view | ✅ | ✅ | | | | |
| file_versions.view | ✅ | ✅ | ✅ | ✅ | | |
| `*.purge_version` | ✅ | | | | | |
| backup.run_manual / backup.restore | ✅ | | | | | |
| backup.view_history | ✅ | ✅ | | | | |
| system_health.view | ✅ | ✅ | | | | |
| notifications.view | ✅ | ✅ | | | | |

**Enforcement happens in two layers, and only one of them is real security:**

1. **RLS policies (the actual boundary)** — every table's policy checks the
   caller's role via a join to `profiles`, replacing today's
   `using (true) with check (true)`.
2. **UI-level `can(role, capability)` helper (convenience only)** — hides or
   disables actions the current user's role doesn't have, so the interface
   doesn't invite denied actions. Never the thing actually preventing them.

**Sequencing**: this must land before Audit Log (section 14) is meaningful —
a log entry's "User" field requires a real identity to exist.

---

## 14. Audit Log

Every important action is recorded, append-only, with who/when/what/before/
after:

```sql
create table public.audit_log (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id),
  user_role text not null,
  action text not null,          -- e.g. 'sales_upload.replace', 'ocr_correction.save'
  entity_type text not null,     -- e.g. 'sales_file', 'ads_file', 'mapping_correction'
  entity_id text,
  previous_value jsonb,
  new_value jsonb,
  metadata jsonb,                -- report_date, brand_id, platform, etc.
  created_at timestamptz not null default now()
);
```

- **Append-only by construction**: RLS grants `insert` to any authenticated
  role; there is no `update` or `delete` policy at all, so no application
  code path — not even an Owner's — can alter or erase history.
- **What gets logged**, matching the request directly: file upload, file
  replace (i.e. a new version created, section 15), file delete (current-
  version delete and permanent purge are logged as distinct actions),
  preview data edits before save, report edits (if reports ever become
  directly editable), OCR/mapping corrections, and settings/master-data or
  role changes.
- **Where it's written from**: centralized in a single `lib/audit/logAction()`
  helper, called once per action from the same targeted save/delete
  functions already living in `lib/supabase/` (`saveSalesUpload`,
  `saveAdsUpload`, `deleteRawFile`/version-purge, `saveMasterDataAdditions`,
  mapping-memory writes, settings updates). Not duplicated per feature — one
  extra, scoped insert per action, consistent with the "no full-table
  wipes" rule (section 12).
- **Read access**: gated by the `audit_log.view` capability (section 13) —
  proposed default is Owner and Marketing Manager only.

---

## 15. File Versioning

**Problem today**: Sales "replace" deletes the existing day's rows and
inserts new ones — no history survives. Ads has no replace concept
currently (uploads always merge), but a single already-saved ads file may
need the same treatment if it turns out to be wrong.

**Schema change** (amends section 3): both `sales_files` and `ads_files`
gain version-tracking columns, and their uniqueness constraints move from
"one row per day" to "one *current* row per day":

```sql
alter table public.sales_files
  add column version integer not null default 1,
  add column is_current boolean not null default true,
  add column superseded_at timestamptz,
  add column superseded_by uuid references public.sales_files(id);

drop index if exists sales_files_report_date_key; -- old flat unique(report_date)
create unique index sales_files_current_report_date_key
  on public.sales_files(report_date) where is_current;
```

The equivalent applies to `ads_files`, scoped to
`(brand_id, report_date, ads_platform)` instead of just `report_date`,
matching how ads files are already keyed.

**Behavior change — "replace" stops deleting anything:**

1. The existing current file row is marked `is_current = false`,
   `superseded_at = now()`, `superseded_by = <new file id>`.
2. A brand-new file row is inserted with `version = previous version + 1`,
   `is_current = true`, and its own new child rows
   (`salespeople_sales`/`pages_sales`/`ads_data`) tied to the new file's id.
3. Old versions and their rows remain in the database, untouched and
   inspectable, until an explicit purge.

**"Delete" splits into two distinct, separately-confirmed actions:**

- *Delete current version* — removes the current version from the day's
  visible state. **Open UX question, not decided here**: should the day
  then revert to showing the previous version as current, or become Empty
  even though history exists? Recommendation to confirm with the Owner:
  revert to the previous version if one exists, otherwise Empty.
- *Permanently purge a version* — irreversible; gated by the
  `*.purge_version` capability (section 13, Owner-only by default);
  requires a separate, explicit confirmation distinct from normal delete;
  writes an audit log entry (section 14) whose `previous_value` captures a
  full snapshot of what was removed, since it cannot be recovered from the
  database after this action.

**Aggregation impact** (amends section 9): every report/KPI query must
filter to `is_current = true` (or the equivalent "not superseded" join) so a
superseded version is never double-counted alongside its replacement.

**UI**: a per-day/file "Version history" panel listing Version 1, Version 2,
Version 3… each showing `uploaded_at` and `uploaded_by` (needs section 13's
identity), with a read-only preview of that version's data. The purge action
is visually distinct (destructive styling) from the normal delete action.

---

## 16. Backup & Restore Strategy

**Prerequisite gap this surfaces**: today, uploaded files are not actually
stored anywhere as blobs. `SalesRawFile.filePath`/`AdsRawFile.filePath` are
set to `file.name` — just the original filename string — never an actual
upload to Supabase Storage or any object store. Only the *parsed, structured*
data (salespeople/platform/ads rows) is persisted. This means "file uploads
must be recoverable" cannot be satisfied until raw file blobs are actually
stored somewhere at upload time. This section assumes that gap is closed
first: every Sales/Ads upload writes its original file to a Supabase Storage
bucket, and `file_path` becomes a real storage reference instead of a bare
filename.

**Scope of what gets backed up:**

1. **Database data** — every table (both schemas during the transition
   window, section 3): sales/ads structured rows, file version history
   (section 15), master data (salespeople/platforms/brands), mapping-memory
   corrections, `profiles`, and the `audit_log` itself.
2. **Original uploaded files** — the raw Excel/CSV/image blobs, once stored
   per the prerequisite above.
3. **Metadata** — file records (including superseded versions, not just
   current), so a restore can reconstruct exactly what a user saw at any
   point in time, not just today's state.

**Pluggable backup destination**, mirroring the OCR provider pattern
(section 5) rather than hardcoding one vendor:

```ts
interface BackupDestination {
  readonly id: string;
  upload(objectKey: string, data: Buffer, contentType: string): Promise<{ locationRef: string }>;
  list(prefix: string): Promise<Array<{ locationRef: string; sizeBytes: number; createdAt: string }>>;
  download(locationRef: string): Promise<Buffer>;
  delete(locationRef: string): Promise<void>; // used by retention pruning
}
```

Primary implementation: Supabase Storage (already in the stack, no new
vendor needed to satisfy "should work with Supabase"). A second destination
(Google Drive, S3, Google Cloud Storage) can be added later as a true
off-project copy — important because a backup that lives only inside the
same Supabase project doesn't protect against losing that project itself.
**Recommendation**: once this is built, configure a second destination for
redundancy rather than relying on Supabase Storage alone; which one is a
cost/ops decision for the Owner, not decided here.

**Orchestration**: `lib/backup/runBackup()` — exports every table to JSON,
uploads the bundle plus any file blobs not yet backed up, records the result
in `backup_runs` (id, started_at, completed_at, status, destination,
location_ref, table_row_counts, file_count, triggered_by). Triggered by:

- **Daily automatic run** — Vercel Cron hits `app/api/backup/run`, guarded
  by `BACKUP_CRON_SECRET` (section 10) so it can't be triggered externally.
- **On-demand run** — Owner-only (`backup.run_manual`, section 13), e.g.
  before a risky schema migration.

**Backup frequency**: daily, at a fixed low-traffic time (proposed 03:00
Cairo time). Adjustable, but "daily" is the floor per the requirement.

**Retention policy** (proposed default, adjustable by the Owner — same
caveat as the permissions matrix in section 13):

| Tier | Keep |
|---|---|
| Daily | Every daily backup for 14 days |
| Weekly | One backup per week for 8 weeks |
| Monthly | One backup per month for 12 months |

Pruning runs as part of the same daily job, using `backup_runs` to know what
exists and what's now outside every tier's window.

**Recovery process** — two distinct scenarios, not to be confused:

1. **Routine "I made a mistake" recovery** — handled by file versioning
   (section 15) directly in the app: view/inspect a prior version, no
   backup restore needed. This is the common case and is self-service.
2. **Disaster recovery** (Supabase project lost/corrupted, accidental
   truncation outside the app, or a schema migration gone wrong) — a
   deliberate, Owner-gated restore via `app/api/backup/restore`
   (`backup.restore`, section 13):
   1. Identify the target snapshot from `backup_runs`.
   2. Point the restore at a ready-to-receive Supabase project (the original,
      repaired, or a fresh one).
   3. Truncate only the specific target tables being restored, then reinsert
      every row from the snapshot — this is the **one sanctioned exception**
      to the "no full-table wipes" guardrail (section 12), reachable only
      through this dedicated route, never as a side effect of a normal save.
   4. Re-upload/re-link file blobs from the backup destination back into
      Supabase Storage.
   5. Verify row counts against the snapshot's recorded `table_row_counts`.
   6. Write an audit log entry (section 14) for the restore itself — who,
      when, from which snapshot — since this is one of the most consequential
      actions the system can perform.

**Monitoring**: a failed daily backup should not fail silently. `runBackup()`
reports its outcome to System Health Monitoring (section 17) and, on
failure, raises a Notification Center alert (section 18) in the `backup`
category — not just a row in `backup_runs` that someone has to remember to
check. Once the Telegram integration (section 19) exists, that's an
additional delivery channel for the same alert, not a replacement for it.

---

## 17. System Health Monitoring

**Purpose**: a current-state view of whether each subsystem is healthy right
now — distinct from the Notification Center (section 18), which is a log of
things that went wrong that a human needs to act on. Health Monitoring
answers "is X okay right now"; Notification Center answers "what happened
and have I dealt with it."

**Components tracked**, matching the request directly: OCR, Storage, Backup,
Cron, API, and last-successful-sync timestamps per module.

**Storage** — one current-status row per component, upserted in place (not
an append-only log; that's what `audit_log` and `notifications` are for):

```sql
create table public.system_health_status (
  component text primary key,       -- 'ocr.gemini-vision', 'storage', 'backup',
                                     -- 'cron.backup-daily', 'api', 'sync.sales_upload',
                                     -- 'sync.ads_upload', ...
  status text not null check (status in ('ok','degraded','down','unknown')),
  last_success_at timestamptz,
  last_failure_at timestamptz,
  last_error_message text,
  updated_at timestamptz not null default now()
);
```

**Written by**: a single `lib/health/reportHealth(component, status, details)`
helper, called from the same places that already exist:

- The OCR provider wrapper (section 5) — after every `extractSalesTable`
  call, success or failure.
- `runBackup()` (section 16) — after every daily/manual run.
- Supabase Storage operations (once wired in per section 16's prerequisite)
  — upload/download failures.
- Every cron-triggered route (today: backup; future: retention pruning) —
  on entry (mark running) and exit (mark success/failure), so a cron job
  that silently stopped firing shows up as a stale `last_success_at`
  instead of going unnoticed.
- Sales Upload and Ads Upload save paths — each save/replace updates its own
  `sync.*` component, which is what "last successful syncs" surfaces.

**Read by**: a `GET /api/health` route that returns every component's status
in one response — usable both by an in-app panel and by an external uptime
monitor later. In-app, this lives as a panel inside **Settings** (not a new
top-level nav item, keeping the required 6-page nav intact), gated by a new
`system_health.view` capability (section 13) — proposed default Owner +
Marketing Manager, matching `audit_log.view`.

**Relationship to other sections**: a component transitioning from `ok` to
`degraded`/`down` is exactly the trigger that raises a Notification Center
alert (section 18) — health monitoring and notifications are wired together,
not two places that separately try to detect the same failure.

---

## 18. Notification Center

**Purpose**: every OCR failure, backup failure, upload failure, migration
error, storage warning, and system alert lands somewhere a human will
actually see it — not just a `console.error` or a silently-failed row.

**This is deliberately not the same thing as the audit log (section 14).**
`audit_log` is a permanent, immutable, append-only historical record of
*actions taken* (who did what, when). `notifications` is a
day-to-day, markable-as-read inbox of *things that need attention*. Audit
log entries are never deleted; notifications are ephemeral and may be
pruned once old and read.

```sql
create table public.notifications (
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
```

**Categories map directly to the request**: `ocr` (extraction failures),
`backup` (failed daily/manual runs), `upload` (Sales/Ads save failures),
`migration` (schema migration errors, section 3), `storage` (Supabase
Storage failures/quota warnings), `system` (everything else, including a
health-status flip to `down`).

**Written by**: a single `lib/notifications/notify(category, severity, title, message, relatedEntity?)`
helper — the same centralization pattern as `lib/audit/logAction()` and
`lib/health/reportHealth()`. Called from the same failure points listed in
section 17, plus schema migration scripts (section 3).

**Delivery is channel-agnostic, following the same plug-in pattern as OCR
providers (section 5) and backup destinations (section 16)** — this is the
third instance of that pattern in this architecture, not a one-off:

```ts
interface NotificationChannel {
  readonly id: string;
  send(notification: { severity: string; category: string; title: string; message: string }): Promise<void>;
}
```

The in-app channel (writing to the `notifications` table, always on) is the
only implementation for now. Telegram (section 19) becomes a second channel
later — `notify()` fans out to every configured channel, so adding Telegram
is a new file + registration, not a rewrite of every call site.

**Read access**: gated by a new `notifications.view` capability (section 13)
— proposed default Owner + Marketing Manager, same as `audit_log.view` and
`system_health.view`. Finer-grained, per-category subscriptions (e.g. a
Sales Manager only wanting `upload` alerts) are a plausible future
refinement, not part of this freeze.

**UI**: a small notification indicator (bell/badge) rather than a new
top-level nav item, consistent with keeping the 6-page nav simple — opens a
dropdown/panel of recent unread items, with a link into Settings for the
full history.

---

## 19. Future modules (planned hook points, not built yet)

None of the following are implemented. This section exists so the modular
structure accommodates them without rework when their time comes.

- **AI Assistant**: would consume the same `lib/` data-access layer through a
  new `app/api/assistant/` route (or a small set of them), not by talking to
  Supabase directly from a UI component. Needs its own role/capability
  (section 13) — likely a read-scoped one, since an assistant answering
  questions shouldn't implicitly gain write access — and any action it does
  take (if it's ever allowed to write) must go through the same
  `lib/audit/logAction()` path (section 14) as a human user, attributed to
  a distinct service identity rather than impersonating a person.
- **Telegram integration**: a notification/bot layer — most likely a
  scheduled or webhook-triggered API route that reads already-aggregated,
  current-version data (section 15) and posts to Telegram. Should not
  require touching upload or report module internals; it's a consumer of
  existing aggregation.
- **n8n workflows**: external automation calling Supabase's REST API or
  dedicated webhook routes in this app. Will need a scoped API key/policy
  rather than the public anon key, since n8n runs server-side and can hold a
  secret safely — likely its own service role under section 13's model,
  logged like any other actor under section 14.
- **Google Drive backup**: not a separate idea — this is one possible
  `BackupDestination` implementation for the Backup & Restore architecture
  in section 16, alongside or instead of Supabase Storage. Adding it later
  is a new file implementing that interface plus a Google service-account
  credential, no changes to the backup orchestration itself.
- **Meta/TikTok API integrations**: direct pulls via the Marketing APIs as an
  alternative to manual CSV upload. In the normalized schema, `ads_data` rows
  would need a `source` field (`manual_upload` vs `api_sync`) so both paths
  can coexist and reports don't care which one populated a given row. This
  would live in `features/ads-upload/` as an alternate data-entry path, not
  a separate module. API-synced rows still go through the same versioning
  (section 15) and audit logging (section 14) as manual uploads.
- **Multi-brand support**: partially modeled already (`brands` table, Ads
  Upload already brand-scoped). Extending it to Sales Upload requires the
  open schema question in section 3 (does one sales report ever span
  multiple brands?) to be answered first.

---

*This document should be updated whenever a decision in section 12 is
deliberately revisited, or when a "planned" item above is completed — move
it to the History section with the commit/PR that did it.*
