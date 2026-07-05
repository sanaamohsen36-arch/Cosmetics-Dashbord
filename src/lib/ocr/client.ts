import type { OcrTableResult } from "./types";

// Browser-side helper. The image and the OCR API key must never meet on the
// client - this posts the raw file to our own API route, which holds the
// provider and its credentials server-side.
export const requestOcrExtraction = async (file: File, reportDate: string): Promise<OcrTableResult> => {
  const formData = new FormData();
  formData.append("file", file);
  formData.append("reportDate", reportDate);

  const response = await fetch("/api/ocr/sales", { method: "POST", body: formData });
  const payload = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(payload?.error || `OCR request failed (${response.status}).`);
  }

  return payload as OcrTableResult;
};
