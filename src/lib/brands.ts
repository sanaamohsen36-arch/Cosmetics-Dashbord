import type { AppData } from "../types";

// Section 19 revision: the Sales Report is the only source of Brands now -
// every unique Page name in a Sales file's Pages_Input sheet IS a Brand
// (no parent Brand with Facebook/Instagram/TikTok children). Derived at
// read time (not only from the persisted `brands` table) so every already-
// uploaded Sales file's page names count immediately, with no migration
// step and no risk of losing any existing Ads file's Brand tag.
export const getEffectiveBrandNames = (data: AppData): string[] =>
  [...new Set([...data.brands.filter((item) => item.active).map((item) => item.name), ...data.salesByPlatform.map((row) => row.platformName).filter(Boolean)])].sort((a, b) =>
    a.localeCompare(b, "ar")
  );
