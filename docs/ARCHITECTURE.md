# Architecture Document

Status: **DRAFT — pending approval.** No new features will be built against
this document until it is approved. Bug fixes already merged before this
freeze (see "History" below) are reflected as done; everything else marked
"planned" is a decision, not yet implemented.

This document is the single source of truth for how the Daily Sales + Ads
Dashboard is structured as it grows into the company's internal BI operating
system. It reflects decisions already confirmed with the product owner:
migrate to a normalized, brand-aware database schema; use Gemini Vision as
the primary OCR engine behind a swappable interface; keep the codebase
modular so future modules can be added without touching unrelated code.

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

---

## 1. Current system overview

- **Framework**: Next.js 14 (App Router), single client component
  (`"use client"` in `src/App.tsx`) renders all 6 pages, all upload cards,
  and all tables/charts. This is the main thing the module-structure
  migration (section 2) fixes.
- **Database**: Supabase Postgres, `@supabase/supabase-js` client using only
  the public anon key (no service-role key in client code — correct). RLS is
  enabled on every table but every policy is `using (true) with check
  (true)`: fully public read/write to anyone holding the anon key. Acceptable
  for the current MVP stage, flagged in section 12 as something that needs a
  deliberate decision once this becomes a real internal system.
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
      (future: assistant/, telegram/, drive-backup/, ads-sync/ ...)
  features/
    sales-upload/             # calendar, preview tables, save/delete/replace logic
    ads-upload/                # brand+platform tabs, multi-file preview, save/delete
    dashboard/                  # KPIs, charts, filters
    sales-report/
    page-report/
    settings/
  lib/
    supabase/                  # one place that talks to Supabase; typed table helpers
    mapping-memory/             # normalization + correction store (planned, section 5)
    ocr/                        # done — provider-agnostic interface + adapters
    brands/                     # brand master data (planned, multi-brand)
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
   to confirm before multi-brand work starts** (section 13).
3. Update `src/lib/supabase/` (new home for storage functions) to read/write
   the normalized tables; keep the flat tables in place but unused during a
   transition window.
4. Verify against a staging Supabase project, then drop the flat tables in a
   dedicated migration once confirmed safe.
5. Retire `daily_summary` (dead, write-only today) in favor of
   `daily_combined_summary`, which already supports per-brand rows.

RLS: keep the existing pattern (`using (true) with check (true)`) during
migration so behavior doesn't change; revisit access control separately
(section 12).

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
  → Targeted Supabase write (insert only; replace only deletes rows for
    the same key being replaced — never a full-table wipe, per the P0 fix)
  → Realtime notifies other open tabs → dashboard/report aggregation re-reads
```

Rules enforced by the module:

- **Sales**: one saved upload per calendar day. A second upload on the same
  day is a **replace** (deletes that day's existing rows, then inserts the
  new ones) — never a merge. Deleting resets the day to "Empty" and removes
  all rows tied to that file's `source_file_id`.
- **Ads**: multiple files per day are allowed, scoped by
  brand + day + platform. Uploading again for the same brand/day/platform is
  a **merge** (adds rows, does not replace) — multiple ad accounts/exports
  for one platform in one day are expected. Deleting a file removes only
  that file's own rows (`source_file_id` scoped), never siblings.

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
schema). This is intentionally provider-agnostic — it lives in
`lib/mapping-memory/`, not inside any OCR provider.

---

## 6. Sales module architecture

- **UI**: calendar grid of the selected month, each day marked
  Uploaded/Empty. Selecting a day shows its existing file (if any) or the
  upload control.
- **Parsing**: `parseSalesWorkbook` (Excel/CSV) or `parseSalesImage` (OCR) →
  both return `{ people: SalesBySalesperson[], platforms: SalesByPlatform[], errors: string[] }`.
  Detects two possible tables per file: salespeople (name, code, shift,
  orders, value) and pages/platforms (name, category, shift, orders, value),
  with subtotal/grand-total row classification so those rows don't pollute
  aggregation.
- **Editable preview**: `EditablePeopleTable` / `EditablePlatformTable`, plus
  a totals-reconciliation banner comparing salespeople-sum vs. platform-sum
  vs. the file's own printed grand total, warning on mismatch.
- **Save**: `saveSalesUpload()` — replace mode if the day already has data,
  merge mode otherwise. New salesperson/platform names encountered are
  registered via the additive `saveMasterDataAdditions()` (not a full
  rewrite).
- **Delete**: `deleteRawFile()` cascades by `source_file_id` to
  `sales_by_salesperson` and `sales_by_platform`, resets the day to Empty.

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
  touches sibling files for the same brand/day/platform.

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

---

## 10. Environment variables

| Variable | Required | Exposed to browser? | Purpose |
|---|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Yes | Yes (by design) | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Yes | Yes (by design — anon key is meant to be public; access control is RLS's job, see section 12) | Supabase anon client key |
| `OCR_PROVIDER` | No (defaults to `gemini-vision`) | No | Selects the OCR engine |
| `GEMINI_API_KEY` | Yes, if using Gemini OCR | **No — server-only** | Gemini Vision API key, read only inside `src/app/api/ocr/sales/route.ts` |
| `GEMINI_OCR_MODEL` | No (defaults to `gemini-2.0-flash`) | No | Overrides the Gemini model name |
| `UPLOAD_PASSWORD` | No | No | Optional shared password gate, checked by `src/app/api/upload-auth/route.ts` |

Rule: any future secret (Telegram bot token, n8n webhook secret, Google
Drive service-account key, Meta/TikTok API tokens) follows the same pattern
as `GEMINI_API_KEY` — server-side env var, read only inside an API route,
never a `NEXT_PUBLIC_*` variable.

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
the full tree; only `app/`, `features/*`, `lib/*`, and `types/` change.

---

## 12. What should not be changed later without approval

- **The `OcrProvider` interface shape** (`extractSalesTable(imageBase64, context) -> { rows, warnings, providerId }`).
  Adding a new provider is always fine; changing the interface itself affects
  every current and future adapter and should be a deliberate, reviewed
  change.
- **The one-upload-per-day-per-Sales-file rule** and the
  merge-per-file-for-Ads rule (section 4). These encode real business rules
  (one closing report per day; multiple ad exports per day are normal), not
  incidental behavior.
- **Delete scoping**: sales delete always resets the day to Empty and
  removes only that day's rows; ads delete always removes only the one
  file's rows. Never widen a delete to affect siblings without an explicit
  request.
- **No full-table wipes as a save mechanism.** The P0 fix in this project's
  history exists because of exactly this pattern; any new save path must use
  targeted insert/update/delete, never delete-all-then-reinsert-all.
- **Supabase credentials and RLS policy changes.** Current policies are
  fully open (`using (true) with check (true)`) as an explicit, acknowledged
  MVP tradeoff — not an oversight. Tightening or loosening this needs a
  separate, deliberate decision, not a side effect of another change.
- **KPI formulas in `lib/metrics.ts`** — changing how ROAS/ROI/CPA/AOV are
  calculated changes historical reporting; needs a documented reason and
  ideally a before/after comparison on real data.
- **Database migrations that drop the flat schema tables** — only after the
  normalized schema is verified working end-to-end in a staging environment.
- **Branch/deploy discipline**: no direct commits to `main`; all work on
  feature branches; push and Vercel preview only after explicit confirmation
  (already the working agreement for this project).

---

## 13. Future modules (planned hook points, not built yet)

None of the following are implemented. This section exists so the modular
structure accommodates them without rework when their time comes.

- **AI Assistant**: would consume the same `lib/` data-access layer through a
  new `app/api/assistant/` route (or a small set of them), not by talking to
  Supabase directly from a UI component. Likely needs a read-scoped Supabase
  role (see section 12's RLS note) rather than the current fully-open anon
  policy, once it's making automated queries.
- **Telegram integration**: a notification/bot layer — most likely a
  scheduled or webhook-triggered API route that reads already-aggregated
  data (e.g. daily KPIs) and posts to Telegram. Should not require touching
  upload or report module internals; it's a consumer of existing aggregation.
- **n8n workflows**: external automation calling Supabase's REST API or
  dedicated webhook routes in this app. Will need a scoped API key/policy
  rather than the public anon key, since n8n runs server-side and can hold a
  secret safely.
- **Google Drive backup**: a scheduled job (Vercel Cron or an n8n workflow)
  exporting raw uploaded files and/or a DB snapshot to Drive via a Google
  service account. Reads already-saved data; should not sit in the
  upload-save critical path.
- **Meta/TikTok API integrations**: direct pulls via the Marketing APIs as an
  alternative to manual CSV upload. In the normalized schema, `ads_data` rows
  would need a `source` field (`manual_upload` vs `api_sync`) so both paths
  can coexist and reports don't care which one populated a given row. This
  would live in `features/ads-upload/` as an alternate data-entry path, not
  a separate module.
- **Multi-brand support**: partially modeled already (`brands` table, Ads
  Upload already brand-scoped). Extending it to Sales Upload requires the
  open schema question in section 3 (does one sales report ever span
  multiple brands?) to be answered first.

---

*This document should be updated whenever a decision in section 12 is
deliberately revisited, or when a "planned" item above is completed — move
it to the History section with the commit/PR that did it.*
