-- Reset operational dashboard data before a clean re-upload.
-- This keeps the schema, policies, and Supabase project setup intact.

truncate table public.daily_summary restart identity cascade;
truncate table public.meta_ads restart identity cascade;
truncate table public.tiktok_ads restart identity cascade;
truncate table public.ads_raw_files restart identity cascade;
truncate table public.sales_by_platform restart identity cascade;
truncate table public.sales_by_salesperson restart identity cascade;
truncate table public.sales_raw_files restart identity cascade;

-- Final folder/calendar tables, if the migration has been applied.
truncate table if exists public.daily_combined_summary restart identity cascade;
truncate table if exists public.ads_data restart identity cascade;
truncate table if exists public.ads_files restart identity cascade;
truncate table if exists public.pages_sales restart identity cascade;
truncate table if exists public.salespeople_sales restart identity cascade;
truncate table if exists public.sales_files restart identity cascade;

-- Mapping memory (OCR/name corrections and the column-mapping wizard's
-- learned layouts) is learned configuration, not operational sales/ads
-- data - intentionally NOT truncated here. Wiping it on every reset would
-- destroy corrections and column mappings that have nothing to do with a
-- clean re-upload. Truncate ocr_page_corrections / ocr_salesperson_corrections
-- / column_mappings manually only if you actually want to forget everything
-- the app has learned.
