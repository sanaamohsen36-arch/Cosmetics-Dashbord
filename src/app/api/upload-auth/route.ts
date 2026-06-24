import { NextResponse } from "next/server";

export async function POST(request: Request) {
  const configuredPassword = process.env.UPLOAD_PASSWORD;

  if (!configuredPassword) {
    return NextResponse.json({ ok: true, protected: false });
  }

  const body = (await request.json().catch(() => ({}))) as { password?: string };
  return NextResponse.json({ ok: body.password === configuredPassword, protected: true });
}
