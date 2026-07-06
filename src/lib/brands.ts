import type { AdsRow, AppData, BrandMaster } from "../types";
import { normalizeArabicText } from "./normalize";

// "واتس" / "واتس اب" / "واتساب" are all the same colloquial spelling of
// WhatsApp - normalizeArabicText's letter-folding doesn't merge these since
// they differ by an actual space, not stray whitespace/diacritics. Token-
// level fix-up, applied after general normalization.
const collapseWhatsappTokens = (text: string): string => {
  const tokens = text.split(" ").filter(Boolean);
  const merged: string[] = [];
  for (let index = 0; index < tokens.length; index += 1) {
    if (tokens[index] === "واتس" && tokens[index + 1] === "اب") {
      merged.push("واتساب");
      index += 1;
    } else if (tokens[index] === "واتس") {
      merged.push("واتساب");
    } else {
      merged.push(tokens[index]);
    }
  }
  return merged.join(" ");
};

// The one normalization key used everywhere a Brand name is compared or
// merged: Sales upload auto-sync, Settings display, Dashboard/Ads Upload
// dropdowns, and Dashboard filtering. Two spellings with the same key are
// the same Brand.
export const brandKey = (name: string): string => collapseWhatsappTokens(normalizeArabicText(name));

// Section 19: every unique Page name from Sales IS a Brand. Deduplicated by
// brandKey - the last raw spelling seen (Sales rows are read in upload
// order, so this approximates "the newest version") wins as the display
// label, so a Page typed/OCR'd slightly differently across days collapses
// into one Brand instead of a duplicate.
export const getEffectiveBrandNames = (data: AppData): string[] => {
  const byKey = new Map<string, string>();
  const consider = (name: string | undefined | null) => {
    const trimmed = name?.trim();
    if (!trimmed) return;
    byKey.set(brandKey(trimmed), trimmed);
  };
  data.brands.filter((item) => item.active).forEach((item) => consider(item.name));
  data.salesByPlatform.forEach((row) => consider(row.platformName));
  return [...byKey.values()].sort((a, b) => a.localeCompare(b, "ar"));
};

// Resolves a raw (possibly differently-spelled) Brand name to whichever
// spelling is already the canonical one for its brandKey, so saving a new
// upload never creates a second Brand for a name that only differs by
// spacing/hamza/case/whitsapp-spelling.
export const resolveBrandName = (data: AppData, rawName: string): string => {
  const trimmed = rawName.trim();
  if (!trimmed) return trimmed;
  const key = brandKey(trimmed);
  const existing = getEffectiveBrandNames(data).find((name) => brandKey(name) === key);
  return existing ?? trimmed;
};

// One-time cleanup: collapses every existing duplicate Brand (by brandKey)
// down to one canonical spelling, and rewrites every Sales/Ads row that
// referenced an old spelling to point at it instead. Idempotent - safe to
// run more than once, a no-op once nothing is left to merge.
export const mergeDuplicateBrands = (data: AppData): AppData => {
  const canonicalByKey = new Map<string, string>();
  const noteName = (name: string | undefined | null) => {
    const trimmed = name?.trim();
    if (!trimmed) return;
    canonicalByKey.set(brandKey(trimmed), trimmed);
  };
  data.brands.forEach((item) => noteName(item.name));
  data.salesByPlatform.forEach((row) => noteName(row.platformName));
  data.adsRawFiles.forEach((file) => noteName(file.salesPlatformName));
  [...data.metaAds, ...data.tiktokAds].forEach((row) => noteName(row.salesPlatformName));

  const canonicalFor = (name: string) => canonicalByKey.get(brandKey(name)) ?? name;

  const seenBrandKeys = new Set<string>();
  const dedupedBrands: BrandMaster[] = [];
  for (const item of data.brands) {
    const key = brandKey(item.name);
    if (seenBrandKeys.has(key)) continue;
    seenBrandKeys.add(key);
    dedupedBrands.push({ ...item, name: canonicalFor(item.name) });
  }

  const rewriteAds = (row: AdsRow): AdsRow => ({ ...row, salesPlatformName: canonicalFor(row.salesPlatformName) });

  return {
    ...data,
    brands: dedupedBrands,
    salesByPlatform: data.salesByPlatform.map((row) => ({ ...row, platformName: canonicalFor(row.platformName) })),
    adsRawFiles: data.adsRawFiles.map((file) => ({ ...file, salesPlatformName: canonicalFor(file.salesPlatformName) })),
    metaAds: data.metaAds.map(rewriteAds),
    tiktokAds: data.tiktokAds.map(rewriteAds)
  };
};
