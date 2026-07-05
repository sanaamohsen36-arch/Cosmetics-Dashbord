import { NextResponse } from "next/server";
import { listHealthStatus } from "../../../lib/health";

export const runtime = "nodejs";

// GET /api/health - aggregates every monitored component's current status
// in one response. Usable by an in-app Settings panel and by an external
// uptime monitor.
export async function GET() {
  const components = await listHealthStatus();
  return NextResponse.json({ components });
}
