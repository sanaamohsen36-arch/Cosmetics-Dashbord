# Daily Sales + Ads Dashboard

Next.js dashboard عربي RTL للمبيعات والإعلانات، مع قاعدة بيانات Supabase مشتركة وDeploy مجاني على Vercel.

## Stack

- Next.js
- React
- Supabase Database + Realtime
- Vercel Hosting
- Recharts
- Tesseract OCR
- XLSX parser

## Local Setup

1. Install dependencies:

```bash
npm install
```

2. Create `.env.local`:

```bash
cp .env.example .env.local
```

3. Add your Supabase values:

```text
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-supabase-anon-key
```

4. Run locally:

```bash
npm run dev
```

Open:

```text
http://127.0.0.1:3000
```

## Supabase Setup

1. Create a free project at Supabase.
2. Open **SQL Editor**.
3. Paste and run:

```text
supabase/schema.sql
```

4. Go to **Project Settings > API**.
5. Copy:

- Project URL
- anon public key

Use them in `.env.local` and later in Vercel environment variables.

The schema creates:

- `sales_raw_files`
- `sales_by_salesperson`
- `sales_by_platform`
- `ads_raw_files`
- `meta_ads`
- `tiktok_ads`
- `platform_settings`
- `daily_summary`

Realtime is enabled for the live dashboard tables.

## Vercel Free Deploy

1. Push this project to GitHub.
2. Open Vercel.
3. Click **Add New Project**.
4. Import the GitHub repo.
5. Add environment variables:

```text
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY
```

6. Deploy.

Vercel will detect Next.js and use:

```bash
npm run build
```

After deploy, send the Vercel URL to anyone. Everyone opens the same live dashboard and reads from the same Supabase database.

## Live vs Snapshot

The live Vercel dashboard auto-refreshes from Supabase Realtime when data changes.

The **Export HTML Snapshot** button creates one static `.html` file from the current dashboard data. This file is only a snapshot:

- It opens without localhost.
- It does not need Supabase.
- It does not auto-refresh.
- Export a new HTML file after updating data if you want to share the latest snapshot.

## Upload Flow

1. Upload the daily sales closing image.
2. Run OCR.
3. Review and edit the OCR preview tables.
4. Save sales data to Supabase.
5. For ads, choose:
   - Ads platform: Meta or TikTok
   - Sales page/platform: `ريجينكس eg`, `واتس اب ريجينكس`, etc.
6. Upload the Excel/CSV ads file for that selected page.
7. Save ads data to Supabase.

## Important Security Note

This MVP uses public anon read/write policies so it is easy to share quickly. For production, add authentication and restrict insert/update/delete permissions to approved users only.
