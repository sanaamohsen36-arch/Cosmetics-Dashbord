import type { OcrPageCorrection, OcrSalespersonCorrection, SalesByPlatform, SalesBySalesperson } from "../../types";
import { normalizeArabicText } from "../normalize";

// Applies previously-saved user corrections to freshly parsed rows, before
// they're shown in the editable preview. Salesperson corrections are scoped
// to a code where one is known (two people can share a misread name), page
// corrections are global (a page name is unambiguous on its own).
export const applySalespersonCorrections = (
  rows: SalesBySalesperson[],
  corrections: OcrSalespersonCorrection[]
): SalesBySalesperson[] => {
  if (!corrections.length) return rows;
  const scoped = new Map(
    corrections
      .filter((item) => item.salespersonCode)
      .map((item) => [`${item.salespersonCode}|${normalizeArabicText(item.wrongValue)}`, item.correctValue])
  );
  const unscoped = new Map(
    corrections.filter((item) => !item.salespersonCode).map((item) => [normalizeArabicText(item.wrongValue), item.correctValue])
  );
  return rows.map((row) => {
    const correct =
      scoped.get(`${row.salespersonCode}|${normalizeArabicText(row.salespersonName)}`) ??
      unscoped.get(normalizeArabicText(row.salespersonName));
    return correct && correct !== row.salespersonName ? { ...row, salespersonName: correct } : row;
  });
};

export const applyPageCorrections = (rows: SalesByPlatform[], corrections: OcrPageCorrection[]): SalesByPlatform[] => {
  if (!corrections.length) return rows;
  const map = new Map(corrections.map((item) => [normalizeArabicText(item.wrongValue), item.correctValue]));
  return rows.map((row) => {
    const correct = map.get(normalizeArabicText(row.platformName));
    return correct && correct !== row.platformName ? { ...row, platformName: correct } : row;
  });
};

// Diffs the preview state as first shown (post-parse, post-correction)
// against what the user actually saves, so a manual name edit becomes a
// remembered correction for next time - without re-saving a "correction"
// for every unrelated numeric edit.
export const diffSalespersonCorrections = (before: SalesBySalesperson[], after: SalesBySalesperson[]) => {
  const beforeById = new Map(before.map((row) => [row.id, row]));
  const corrections: Array<{ wrongValue: string; correctValue: string; salespersonCode: string }> = [];
  for (const row of after) {
    const previous = beforeById.get(row.id);
    if (!previous) continue;
    const wrongValue = previous.salespersonName.trim();
    const correctValue = row.salespersonName.trim();
    if (wrongValue && correctValue && wrongValue !== correctValue) {
      corrections.push({ wrongValue, correctValue, salespersonCode: row.salespersonCode });
    }
  }
  return corrections;
};

export const diffPageCorrections = (before: SalesByPlatform[], after: SalesByPlatform[]) => {
  const beforeById = new Map(before.map((row) => [row.id, row]));
  const corrections: Array<{ wrongValue: string; correctValue: string }> = [];
  for (const row of after) {
    const previous = beforeById.get(row.id);
    if (!previous) continue;
    const wrongValue = previous.platformName.trim();
    const correctValue = row.platformName.trim();
    if (wrongValue && correctValue && wrongValue !== correctValue) {
      corrections.push({ wrongValue, correctValue });
    }
  }
  return corrections;
};
