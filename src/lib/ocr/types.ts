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
  // One row-major grid per visually distinct table in the image (e.g. a
  // salespeople table and a separate pages/platforms table), each shaped
  // like XLSX.utils.sheet_to_json with { header: 1 }. Kept as separate
  // grids - not flattened into one - because two tables in the same image
  // commonly have different column counts/order; forcing them into a
  // single grid under one header row causes column misalignment. Each
  // grid runs through the exact same column-detection/validation logic as
  // an Excel sheet.
  tables: unknown[][][];
  warnings: string[];
  providerId: string;
}

export interface OcrProvider {
  readonly id: string;
  extractSalesTable(imageBase64: string, context: OcrRequestContext): Promise<OcrTableResult>;
}
