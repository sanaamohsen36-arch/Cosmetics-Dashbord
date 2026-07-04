import { NextResponse } from "next/server";
import { getOcrProvider } from "../../../../lib/ocr";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const formData = await request.formData().catch(() => null);
  const file = formData?.get("file");
  const reportDate = String(formData?.get("reportDate") ?? "");

  if (!file || !(file instanceof Blob)) {
    return NextResponse.json({ error: "No file uploaded." }, { status: 400 });
  }

  try {
    const provider = getOcrProvider();
    const arrayBuffer = await file.arrayBuffer();
    const base64 = Buffer.from(arrayBuffer).toString("base64");
    const result = await provider.extractSalesTable(base64, {
      reportDate,
      mimeType: file.type || "image/jpeg"
    });
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : String(error) }, { status: 500 });
  }
}
