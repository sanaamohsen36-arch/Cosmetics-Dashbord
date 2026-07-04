import type { OcrProvider, OcrRequestContext, OcrTableResult } from "./types";

const DEFAULT_MODEL = "gemini-2.0-flash";

const PROMPT = `You are transcribing a screenshot of a daily sales closing report. The report may be in Arabic, English, or a mix of both, and may contain a table for salespeople (with a shift/morning-evening column) and/or a table for sales pages/platforms, possibly with subtotal or grand-total rows.

Transcribe every row of every table exactly as printed, top to bottom, left to right, including the header row. Do not translate any text, do not summarize, do not skip empty-looking rows, and do not convert Arabic-Indic digits to Western digits - copy every cell exactly as it appears.

Respond with ONLY valid JSON of this exact shape, no commentary, no markdown fences:
{"rows": [["header cell 1", "header cell 2", ...], ["row1 cell1", "row1 cell2", ...], ...]}`;

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

    const rows = (parsed as { rows?: unknown })?.rows;
    if (!Array.isArray(rows)) {
      throw new Error("Gemini Vision response was missing the expected 'rows' table.");
    }

    return { rows: rows as unknown[][], warnings: [], providerId: this.id };
  }
}
