// Contract every OCR engine must implement. The upload pipeline (App.tsx,
// workbookParsers.ts) only ever talks to this interface, never to a specific
// vendor SDK, so swapping Gemini for Google Vision, Azure Document
// Intelligence, OpenAI Vision, etc. later means adding one new file here and
// registering it in getOcrProvider() - nothing about the upload flow changes.

export interface OcrRequestContext {
  reportDate: string;
  mimeType: string;
}

export interface OcrTableResult {
  // Row-major grid of cell text, matching the shape XLSX.utils.sheet_to_json
  // produces with { header: 1 }. This lets OCR output run through the exact
  // same column-detection/validation logic as an Excel upload.
  rows: unknown[][];
  warnings: string[];
  providerId: string;
}

export interface OcrProvider {
  readonly id: string;
  extractSalesTable(imageBase64: string, context: OcrRequestContext): Promise<OcrTableResult>;
}
