import { NextResponse } from "next/server";
import { listHealthStatus } from "../../../lib/health";

export const runtime = "nodejs";

// GET /api/health - aggregates every monitored component's current status
// in one response. Usable by an in-app Settings panel and by an external
// uptime monitor. Also reports, as booleans only (never values), which
// server-only env vars this exact deployment's runtime actually sees - the
// fastest way to confirm a Vercel env var change took effect without
// exposing any secret.
export async function GET() {
  const components = await listHealthStatus();
  return NextResponse.json({
    components,
    env: {
      hasSupabaseUrl: Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL),
      hasSupabaseAnonKey: Boolean(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY),
      hasSupabaseServiceRoleKey: Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY)
    }
  });
}
