import { GeminiVisionProvider } from "./geminiProvider";
import type { OcrProvider } from "./types";

export type { OcrProvider, OcrRequestContext, OcrTableResult } from "./types";

// Server-side only: selects the configured OCR engine. Never import this from
// client components - provider implementations read API keys from
// process.env and must only run in API routes/server code.
export const getOcrProvider = (): OcrProvider => {
  const providerId = (process.env.OCR_PROVIDER || "gemini-vision").toLowerCase();
  switch (providerId) {
    case "gemini-vision":
    case "gemini":
      return new GeminiVisionProvider();
    default:
      throw new Error(
        `Unknown OCR_PROVIDER "${providerId}". Add an implementation in src/lib/ocr/ and register it in getOcrProvider().`
      );
  }
};
