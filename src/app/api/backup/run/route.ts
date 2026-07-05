import { NextResponse } from "next/server";
import { runBackup } from "../../../../lib/backup";

export const runtime = "nodejs";

// Daily automatic run target (Vercel Cron) - guarded by BACKUP_CRON_SECRET
// so it can't be triggered by anyone who finds the URL. Manual runs go
// through the same function from a UI action gated by backup.run_manual.
export async function POST(request: Request) {
  const secret = process.env.BACKUP_CRON_SECRET;
  if (secret) {
    const provided = request.headers.get("x-backup-cron-secret");
    if (provided !== secret) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  try {
    const run = await runBackup(secret ? "cron" : "manual");
    return NextResponse.json(run);
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : String(error) }, { status: 500 });
  }
}
