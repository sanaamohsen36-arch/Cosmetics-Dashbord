import type { OcrProvider, OcrRequestContext, OcrTableResult } from "./types";

const DEFAULT_MODEL = "gemini-2.0-flash";

const PROMPT = `You are transcribing a screenshot of a daily sales closing report. These reports almost always contain BOTH of the following, as two separate visual tables, usually side by side or stacked:
1. A salespeople table - one row per salesperson, with a name column, a code column, and morning/evening order-count/value columns.
2. A pages/platforms table - one row per page or ad platform (brand-specific page names, social/follow-up categories, etc.), usually titled something like "الصفحات" / "Pages", with its own morning/evening/total order-count/value columns, plus subtotal rows (e.g. "اجمالي السوشيال") and a grand-total row.

You MUST look for and transcribe BOTH tables if both are present - do not stop after the first one. Output each table as its OWN entry in the "tables" array below - do NOT merge them into one flat grid. The two tables commonly have different column counts and different column order, so keeping them separate is required for correct column alignment. Never summarize a table down to just its grand-total row - the individual line items (each salesperson, each page/platform) are required, not optional. A table with 20+ line items must produce 20+ output rows for it, not one. If you only find one table, output just that one entry - but check carefully for a second table before concluding there isn't one.

Within each table, transcribe every row exactly as printed, top to bottom, left to right. Do not translate any text, do not summarize, do not skip empty-looking rows, and do not convert Arabic-Indic digits to Western digits - copy every cell exactly as it appears. Transcribe header text exactly, letter for letter - do not add, drop, or substitute any letter.

Many of these reports use a two-row merged header within a table: a top row with a group label (e.g. "اجمالي اليوم" / "مسائي" / "صباحي" / "Total Today" / "Morning" / "Evening") spanning two sub-columns, and a second row underneath with the actual sub-column labels (e.g. "عدد الاوردرات" / "قيمة الاوردرات" / "Orders" / "Value") directly below each half of the group. When you see this pattern, DO NOT output the group row and sub-header row as two separate rows, and do not leave a sub-column's header blank. Instead, flatten each pair into ONE header row by combining the group label with its specific sub-column label, separated by " - " (for example "اجمالي اليوم - عدد الاوردرات" and "اجمالي اليوم - قيمة الاوردرات"). Every column's header in row 0 of each table must be non-empty and unique - never leave a header cell blank just because it was visually merged in the image.

Respond with ONLY valid JSON of this exact shape, no commentary, no markdown fences:
{"tables": [{"rows": [["header cell 1", "header cell 2", ...], ["row1 cell1", "row1 cell2", ...], ...]}, {"rows": [[...]]}]}`;

export class GeminiVisionProvider implements OcrProvider {
  readonly id = "gemini-vision";

  async extractSalesTable(imageBase64: string, context: OcrRequestContext): Promise<OcrTableResult> {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      throw new Error("GEMINI_API_KEY is not configured on the server.");
    }
    const model = process.env.GEMINI_OCR_MODEL || DEFAULT_MODEL;

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [
            {
              parts: [{ text: PROMPT }, { inline_data: { mime_type: context.mimeType, data: imageBase64 } }]
            }
          ],
          generationConfig: {
            responseMimeType: "application/json",
            temperature: 0
          }
        })
      }
    );

    if (!response.ok) {
      const bodyText = await response.text().catch(() => "");
      throw new Error(`Gemini Vision request failed (${response.status}): ${bodyText.slice(0, 300)}`);
    }

    const payload = (await response.json()) as {
      candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
    };
    const text = payload.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) {
      throw new Error("Gemini Vision returned no readable content for this image.");
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch {
      throw new Error("Gemini Vision did not return valid JSON. Try a clearer photo of the report.");
    }

    const tables = (parsed as { tables?: unknown })?.tables;
    if (!Array.isArray(tables)) {
      // Backward-compatible fallback: an older-style single flat "rows"
      // response is still treated as one table rather than a hard failure.
      const rows = (parsed as { rows?: unknown })?.rows;
      if (Array.isArray(rows)) {
        return { tables: [rows as unknown[][]], warnings: [], providerId: this.id };
      }
      throw new Error("Gemini Vision response was missing the expected 'tables' array.");
    }

    const grids = tables
      .map((table) => (table as { rows?: unknown })?.rows)
      .filter((rows): rows is unknown[][] => Array.isArray(rows));

    return { tables: grids, warnings: [], providerId: this.id };
  }
}
