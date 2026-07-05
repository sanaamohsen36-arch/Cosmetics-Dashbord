// Shared Arabic/English text normalization. A salesperson or page name typed
// slightly differently across different days' uploads (stray whitespace, a
// different hamza/alef-maksura/taa-marbuta form, leftover diacritics) must
// resolve to the same entity everywhere this is used - column/alias matching
// in workbookParsers.ts and cross-day aggregation keys in metrics.ts. Both
// call this one function so the rules can't drift apart.
export const normalizeArabicText = (value: unknown): string =>
  String(value ?? "")
    .replace(/[ً-ٰٟ]/g, "") // strip Arabic diacritics (tashkeel)
    .replace(/ـ/g, "") // strip tatweel
    .replace(/[أإآ]/g, "ا") // إ أ آ -> ا
    .replace(/ى/g, "ي") // ى -> ي
    .replace(/ة/g, "ه") // ة -> ه
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
