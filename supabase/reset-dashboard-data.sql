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

-- Legacy OCR learning data is no longer used by the rebuilt upload flow.
truncate table public.ocr_page_corrections restart identity cascade;
truncate table public.ocr_salesperson_corrections restart identity cascade;
