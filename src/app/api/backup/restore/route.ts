import { NextResponse } from "next/server";
import { restoreBackup } from "../../../../lib/backup";

export const runtime = "nodejs";

// Owner-gated, disaster-recovery only. This route itself does not check
// the caller's role - the caller (UI) must already have verified
// backup.restore before invoking this, and Supabase RLS is the real
// boundary once section 13 lands. Deliberately not wired into any UI yet.
export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as { locationRef?: string; restoredBy?: string };
  if (!body.locationRef || !body.restoredBy) {
    return NextResponse.json({ error: "locationRef and restoredBy are required." }, { status: 400 });
  }
  try {
    await restoreBackup(body.locationRef, body.restoredBy);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : String(error) }, { status: 500 });
  }
}
