import Tesseract from "tesseract.js";
import type { OcrFieldWarnings } from "../types";

type CellKey =
  | "name"
  | "code"
  | "morningOrders"
  | "morningRevenue"
  | "eveningOrders"
  | "eveningRevenue"
  | "reportTotalOrders"
  | "reportTotalRevenue";

export interface FixedTemplateRow {
  name: string;
  code?: string;
  morningOrders: number;
  morningRevenue: number;
  eveningOrders: number;
  eveningRevenue: number;
  totalOrders: number;
  totalRevenue: number;
  confidence: number;
  fieldConfidence: Record<string, number>;
  fieldWarnings: OcrFieldWarnings;
  cellImages: Record<string, string>;
  isSubtotal?: boolean;
}

export interface FixedTemplateData {
  people: FixedTemplateRow[];
  platforms: FixedTemplateRow[];
  debugImages: string[];
}

interface OcrCell {
  text: string;
  confidence: number;
  image: string;
  hadLetters: boolean;
  pass: "normal" | "tight" | "wide";
}

interface CropRange {
  x1: number;
  x2: number;
  y1: number;
  y2: number;
}

interface RowRange {
  y1: number;
  y2: number;
}

interface RowDetectionOptions {
  x1: number;
  x2: number;
  y1: number;
  y2: number;
  contentY1: number;
  contentY2: number;
  fallbackFirstRowTop: number;
  fallbackRowHeight: number;
  fallbackRowCount: number;
  minRows: number;
  maxRows: number;
}

const platformColumns: Record<CellKey, [number, number]> = {
  name: [0.372, 0.477],
  code: [0, 0],
  morningOrders: [0.31, 0.372],
  morningRevenue: [0.247, 0.31],
  eveningOrders: [0.195, 0.247],
  eveningRevenue: [0.142, 0.195],
  reportTotalOrders: [0.071, 0.142],
  reportTotalRevenue: [0, 0.071]
};

const salesColumns: Record<CellKey, [number, number]> = {
  name: [0.81, 0.935],
  code: [0.935, 0.982],
  morningOrders: [0.748, 0.81],
  morningRevenue: [0.689, 0.748],
  eveningOrders: [0.638, 0.689],
  eveningRevenue: [0.585, 0.638],
  reportTotalOrders: [0.535, 0.585],
  reportTotalRevenue: [0.478, 0.535]
};

const pageNames = [
  { canonical: "Regenix eg", aliases: ["regenix eg", "ريجينكس eg"] },
  { canonical: "ريجينكس", aliases: ["ريجينكس", "regenix"] },
  { canonical: "واتس اب ريجينكس", aliases: ["واتس اب ريجينكس", "واتساب ريجينكس", "whatsapp regenix"] },
  { canonical: "واتس اب تيك توك", aliases: ["واتس اب تيك توك", "واتساب تيك توك", "whatsapp tiktok"] },
  { canonical: "Website CELIXI", aliases: ["website celixi", "web site celixi", "ويب سايت celixi", "celixi"] },
  { canonical: "Instagram", aliases: ["instagram", "انستجرام", "انستغرام"] },
  { canonical: "تليفون اعلان", aliases: ["تليفون اعلان", "تليفون إعلان", "tv ad"] },
  { canonical: "تيم المتابعه", aliases: ["تيم المتابعه", "تيم المتابعة", "follow up team", "follow-up team"] },
  { canonical: "المتابعه", aliases: ["المتابعه", "المتابعة", "follow up", "follow-up"] },
  { canonical: "إجمالي السوشيال", aliases: ["اجمالي السوشيال", "إجمالي السوشيال", "social total"] },
  { canonical: "إجمالي اليوم", aliases: ["اجمالي اليوم", "إجمالي اليوم", "daily total"] }
];

export const extractFixedTemplateSales = async (
  file: File,
  onProgress: (message: string, progress: number) => void
): Promise<FixedTemplateData | null> => {
  if (!file.type.startsWith("image/")) return null;

  onProgress("تجهيز الصورة بنظام fixed template", 5);
  const canvas = await preprocessReportImage(file);

  onProgress("اكتشاف خطوط جدول التقرير", 12);
  const platformRows = detectRowRanges(canvas, {
    x1: 0,
    x2: 0.477,
    y1: 0.145,
    y2: 0.56,
    contentY1: 0.19,
    contentY2: 0.535,
    fallbackFirstRowTop: 0.195,
    fallbackRowHeight: 0.0355,
    fallbackRowCount: 10,
    minRows: 6,
    maxRows: 12
  });
  const salesRows = detectRowRanges(canvas, {
    x1: 0.478,
    x2: 0.982,
    y1: 0.08,
    y2: 0.965,
    contentY1: 0.125,
    contentY2: 0.945,
    fallbackFirstRowTop: 0.132,
    fallbackRowHeight: 0.0329,
    fallbackRowCount: 28,
    minRows: 18,
    maxRows: 32
  });

  const debugImages = [
    drawDebugOverlay(canvas, platformRows, platformColumns, "جدول الصفحات"),
    drawDebugOverlay(canvas, salesRows, salesColumns, "جدول السيلز")
  ];

  onProgress("قراءة خلايا الصفحات", 22);
  const platforms = await extractRows(canvas, platformColumns, {
    rows: platformRows,
    kind: "platform"
  });

  onProgress("قراءة خلايا السيلز", 58);
  const people = await extractRows(canvas, salesColumns, {
    rows: salesRows,
    kind: "sales"
  });

  return {
    people: people.filter((row) => row.name && row.code && !isHeaderOrTotal(row.name) && (row.totalOrders || row.totalRevenue)),
    platforms: platforms.filter((row) => row.name && !isHeaderOrTotal(row.name) && (row.totalOrders || row.totalRevenue)),
    debugImages
  };
};

const extractRows = async (
  canvas: HTMLCanvasElement,
  columns: Record<CellKey, [number, number]>,
  options: { rows: RowRange[]; kind: "sales" | "platform" }
) => {
  const rows: FixedTemplateRow[] = [];
  for (const rowRange of options.rows) {
    const read = async (field: CellKey, numeric: boolean) => {
      const [x1, x2] = columns[field];
      if (x1 === x2) return { text: "", confidence: 100, image: "", hadLetters: false, pass: "normal" as const };
      return recognizeCellWithRetry(canvas, { x1, x2, y1: rowRange.y1, y2: rowRange.y2 }, numeric, field);
    };

    const nameCell = await read("name", false);
    const codeCell = options.kind === "sales" ? await read("code", true) : { text: "", confidence: 100, image: "", hadLetters: false };
    const morningOrders = await read("morningOrders", true);
    const morningRevenue = await read("morningRevenue", true);
    const eveningOrders = await read("eveningOrders", true);
    const eveningRevenue = await read("eveningRevenue", true);
    const reportTotalOrders = await read("reportTotalOrders", true);
    const reportTotalRevenue = await read("reportTotalRevenue", true);

    const warnings: OcrFieldWarnings = {};
    const fieldConfidence = {
      name: nameCell.confidence,
      code: codeCell.confidence,
      morningOrders: morningOrders.confidence,
      morningRevenue: morningRevenue.confidence,
      eveningOrders: eveningOrders.confidence,
      eveningRevenue: eveningRevenue.confidence,
      reportTotalOrders: reportTotalOrders.confidence,
      reportTotalRevenue: reportTotalRevenue.confidence
    };

    const values = {
      morningOrders: numericValue(morningOrders, "morningOrders", warnings),
      morningRevenue: numericValue(morningRevenue, "morningRevenue", warnings),
      eveningOrders: numericValue(eveningOrders, "eveningOrders", warnings),
      eveningRevenue: numericValue(eveningRevenue, "eveningRevenue", warnings),
      reportTotalOrders: numericValue(reportTotalOrders, "reportTotalOrders", warnings),
      reportTotalRevenue: numericValue(reportTotalRevenue, "reportTotalRevenue", warnings)
    };

    reconcileWithOcrTotal(values, warnings);
    validateCalculatedTotals(values, warnings);

    const totalOrders = values.morningOrders + values.eveningOrders;
    const totalRevenue = values.morningRevenue + values.eveningRevenue;
    const name = options.kind === "platform" ? normalizePageName(nameCell.text, warnings) : cleanText(nameCell.text);
    const confidence = average(Object.values(fieldConfidence));

    if (confidence < 72) addWarning(warnings, "row", "ثقة OCR منخفضة، راجع الصف قبل الحفظ");

    rows.push({
      name,
      code: onlyDigits(codeCell.text),
      morningOrders: values.morningOrders,
      morningRevenue: values.morningRevenue,
      eveningOrders: values.eveningOrders,
      eveningRevenue: values.eveningRevenue,
      totalOrders,
      totalRevenue,
      confidence,
      fieldConfidence,
      fieldWarnings: warnings,
      cellImages: {
        name: nameCell.image,
        code: codeCell.image,
        morningOrders: morningOrders.image,
        morningRevenue: morningRevenue.image,
        eveningOrders: eveningOrders.image,
        eveningRevenue: eveningRevenue.image,
        reportTotalOrders: reportTotalOrders.image,
        reportTotalRevenue: reportTotalRevenue.image,
        total: reportTotalRevenue.image || reportTotalOrders.image
      },
      isSubtotal: isSubtotalName(name)
    });
  }
  return rows;
};

const recognizeCellWithRetry = async (
  canvas: HTMLCanvasElement,
  range: CropRange,
  numeric: boolean,
  field: CellKey
): Promise<OcrCell> => {
  const first = await recognizeCell(canvas, range, numeric, "normal");
  if (!numeric) return first.confidence < 65 ? chooseBestCell(first, await recognizeCell(canvas, range, numeric, "wide"), field) : first;

  const digits = onlyDigits(first.text);
  const looksSuspicious =
    first.confidence < 78 ||
    first.hadLetters ||
    !digits ||
    (field.toLowerCase().includes("orders") && digits.length > 2) ||
    (field.toLowerCase().includes("revenue") && digits.length > 7);

  if (!looksSuspicious) return first;

  const tight = await recognizeCell(canvas, range, numeric, "tight");
  const best = chooseBestCell(first, tight, field);
  if (best.confidence >= 78 && onlyDigits(best.text)) return best;

  return chooseBestCell(best, await recognizeCell(canvas, range, numeric, "wide"), field);
};

const recognizeCell = async (
  canvas: HTMLCanvasElement,
  range: CropRange,
  numeric: boolean,
  pass: "normal" | "tight" | "wide"
): Promise<OcrCell> => {
  const crop = cropCanvas(canvas, range, numeric, pass);
  const image = crop.toDataURL("image/png");
  const blob = await canvasToBlob(crop);
  const result = await Tesseract.recognize(blob, numeric ? "eng" : "ara+eng", {
    tessedit_char_whitelist: numeric ? "0123456789" : undefined,
    tessedit_pageseg_mode: "7"
  } as Partial<Tesseract.WorkerOptions>);
  const text = result.data.text.replace(/\s+/g, " ").trim();
  return {
    text,
    confidence: Math.round(result.data.confidence || 0),
    image,
    hadLetters: numeric && /[A-Za-z\u0600-\u06ff]/.test(text),
    pass
  };
};

const preprocessReportImage = async (file: File) => {
  const image = await loadImage(file);
  const scale = Math.min(3, Math.max(2, 2800 / Math.max(image.naturalWidth || image.width, 1)));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round((image.naturalWidth || image.width) * scale);
  canvas.height = Math.round((image.naturalHeight || image.height) * scale);
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) throw new Error("تعذر تجهيز الصورة للقراءة");

  context.fillStyle = "#fff";
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = "high";
  context.drawImage(image, 0, 0, canvas.width, canvas.height);

  const imageData = context.getImageData(0, 0, canvas.width, canvas.height);
  const data = imageData.data;
  for (let index = 0; index < data.length; index += 4) {
    const gray = data[index] * 0.299 + data[index + 1] * 0.587 + data[index + 2] * 0.114;
    const contrast = Math.max(0, Math.min(255, (gray - 128) * 1.65 + 128));
    const denoised = contrast > 245 ? 255 : contrast < 65 ? 0 : contrast;
    data[index] = denoised;
    data[index + 1] = denoised;
    data[index + 2] = denoised;
  }
  context.putImageData(imageData, 0, 0);
  sharpenCanvas(canvas);
  return deskewCanvas(canvas);
};

const chooseBestCell = (left: OcrCell, right: OcrCell, field: CellKey): OcrCell => {
  if (!right.text && left.text) return left;
  if (!left.text && right.text) return right;

  const leftDigits = onlyDigits(left.text);
  const rightDigits = onlyDigits(right.text);
  const isOrderField = field.toLowerCase().includes("orders");

  if (isOrderField && leftDigits.length > 2 && rightDigits.length <= 2 && rightDigits) return right;
  if (isOrderField && rightDigits.length > 2 && leftDigits.length <= 2 && leftDigits) return left;
  if (left.hadLetters && !right.hadLetters) return right;
  if (right.hadLetters && !left.hadLetters) return left;

  return right.confidence > left.confidence ? right : left;
};

const detectRowRanges = (canvas: HTMLCanvasElement, options: RowDetectionOptions): RowRange[] => {
  const lineCenters = detectHorizontalLineCenters(canvas, options);
  const rows: RowRange[] = [];
  const minHeight = canvas.height * 0.012;
  const maxHeight = canvas.height * 0.06;

  for (let index = 0; index < lineCenters.length - 1; index += 1) {
    const top = lineCenters[index];
    const bottom = lineCenters[index + 1];
    const height = bottom - top;
    const centerRatio = ((top + bottom) / 2) / canvas.height;
    if (height < minHeight || height > maxHeight) continue;
    if (centerRatio < options.contentY1 || centerRatio > options.contentY2) continue;
    rows.push({
      y1: Math.max(0, (top + Math.max(2, height * 0.06)) / canvas.height),
      y2: Math.min(1, (bottom - Math.max(2, height * 0.06)) / canvas.height)
    });
  }

  const cleaned = removeDuplicateRows(rows).slice(0, options.maxRows);
  if (cleaned.length >= options.minRows) return cleaned;
  return fallbackRows(options);
};

const detectHorizontalLineCenters = (canvas: HTMLCanvasElement, options: RowDetectionOptions) => {
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) return [];
  const x = Math.round(options.x1 * canvas.width);
  const y = Math.round(options.y1 * canvas.height);
  const width = Math.max(1, Math.round((options.x2 - options.x1) * canvas.width));
  const height = Math.max(1, Math.round((options.y2 - options.y1) * canvas.height));
  const imageData = context.getImageData(x, y, width, height);
  const scores: number[] = [];

  for (let row = 0; row < height; row += 1) {
    let dark = 0;
    for (let col = 0; col < width; col += 1) {
      const offset = (row * width + col) * 4;
      if (imageData.data[offset] < 150) dark += 1;
    }
    scores.push(dark / width);
  }

  const threshold = Math.max(0.18, percentile(scores, 0.93));
  const candidateRows: number[] = [];
  scores.forEach((value, index) => {
    if (value >= threshold) candidateRows.push(y + index);
  });

  return groupLineCandidates(candidateRows);
};

const groupLineCandidates = (rows: number[]) => {
  if (!rows.length) return [];
  const groups: number[][] = [[rows[0]]];
  for (let index = 1; index < rows.length; index += 1) {
    const current = rows[index];
    const lastGroup = groups[groups.length - 1];
    if (current - lastGroup[lastGroup.length - 1] <= 4) {
      lastGroup.push(current);
    } else {
      groups.push([current]);
    }
  }
  return groups.map((group) => Math.round(group.reduce((total, value) => total + value, 0) / group.length));
};

const removeDuplicateRows = (rows: RowRange[]) => {
  const result: RowRange[] = [];
  for (const row of rows) {
    const last = result[result.length - 1];
    if (last && Math.abs(row.y1 - last.y1) < 0.006) continue;
    result.push(row);
  }
  return result;
};

const fallbackRows = (options: RowDetectionOptions) =>
  Array.from({ length: options.fallbackRowCount }, (_, index) => {
    const y1 = options.fallbackFirstRowTop + index * options.fallbackRowHeight;
    return { y1, y2: y1 + options.fallbackRowHeight };
  });

const percentile = (values: number[], ratio: number) => {
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.max(0, Math.min(sorted.length - 1, Math.floor(sorted.length * ratio)))] ?? 0;
};

const drawDebugOverlay = (source: HTMLCanvasElement, rows: RowRange[], columns: Record<CellKey, [number, number]>, title: string) => {
  const maxWidth = 1400;
  const scale = Math.min(1, maxWidth / source.width);
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(source.width * scale);
  canvas.height = Math.round(source.height * scale);
  const context = canvas.getContext("2d");
  if (!context) return "";
  context.drawImage(source, 0, 0, canvas.width, canvas.height);
  context.lineWidth = Math.max(1, 2 * scale);
  context.font = `${Math.max(12, 18 * scale)}px sans-serif`;
  context.fillStyle = "rgba(14, 165, 233, 0.9)";
  context.fillText(title, 12, 24);

  rows.forEach((row, rowIndex) => {
    Object.entries(columns).forEach(([field, [x1, x2]]) => {
      if (x1 === x2) return;
      const x = x1 * canvas.width;
      const y = row.y1 * canvas.height;
      const width = (x2 - x1) * canvas.width;
      const height = (row.y2 - row.y1) * canvas.height;
      context.strokeStyle = field.includes("Orders") ? "rgba(34, 197, 94, 0.95)" : "rgba(14, 165, 233, 0.85)";
      context.strokeRect(x, y, width, height);
      if (field === "name") {
        context.fillStyle = "rgba(14, 165, 233, 0.9)";
        context.fillText(String(rowIndex + 1), x + 4, y + 16);
      }
    });
  });

  return canvas.toDataURL("image/png");
};

const cropCanvas = (source: HTMLCanvasElement, range: CropRange, numeric: boolean, pass: "normal" | "tight" | "wide") => {
  const padX = pass === "tight" ? 0.001 : pass === "wide" ? 0.006 : numeric ? 0.002 : 0.002;
  const padY = pass === "tight" ? 0.001 : pass === "wide" ? 0.006 : 0.002;
  const x = Math.max(0, Math.floor((range.x1 - padX) * source.width));
  const y = Math.max(0, Math.floor((range.y1 - padY) * source.height));
  const width = Math.min(source.width - x, Math.ceil((range.x2 - range.x1 + padX * 2) * source.width));
  const height = Math.min(source.height - y, Math.ceil((range.y2 - range.y1 + padY * 2) * source.height));
  const crop = document.createElement("canvas");
  crop.width = Math.max(width * 2, 80);
  crop.height = Math.max(height * 2, 40);
  const context = crop.getContext("2d", { willReadFrequently: true });
  if (!context) return crop;
  context.fillStyle = "#fff";
  context.fillRect(0, 0, crop.width, crop.height);
  context.imageSmoothingEnabled = false;
  context.drawImage(source, x, y, width, height, 0, 0, crop.width, crop.height);
  return crop;
};

const reconcileWithOcrTotal = (
  values: {
    morningOrders: number;
    morningRevenue: number;
    eveningOrders: number;
    eveningRevenue: number;
    reportTotalOrders: number;
    reportTotalRevenue: number;
  },
  warnings: OcrFieldWarnings
) => {
  const expectedMorningOrders = values.reportTotalOrders - values.eveningOrders;
  if (values.reportTotalOrders > 0 && values.morningOrders + values.eveningOrders !== values.reportTotalOrders && expectedMorningOrders >= 0) {
    values.morningOrders = expectedMorningOrders;
    addWarning(warnings, "morningOrders", "تم تصحيح العدد من إجمالي الصف");
  }

  const expectedEveningOrders = values.reportTotalOrders - values.morningOrders;
  if (values.reportTotalOrders > 0 && values.morningOrders + values.eveningOrders !== values.reportTotalOrders && expectedEveningOrders >= 0) {
    values.eveningOrders = expectedEveningOrders;
    addWarning(warnings, "eveningOrders", "تم تصحيح العدد من إجمالي الصف");
  }

  const expectedMorningRevenue = values.reportTotalRevenue - values.eveningRevenue;
  if (values.reportTotalRevenue > 0 && values.morningRevenue + values.eveningRevenue !== values.reportTotalRevenue && expectedMorningRevenue >= 0) {
    values.morningRevenue = expectedMorningRevenue;
    addWarning(warnings, "morningRevenue", "تم تصحيح القيمة من إجمالي الصف");
  }

  const expectedEveningRevenue = values.reportTotalRevenue - values.morningRevenue;
  if (values.reportTotalRevenue > 0 && values.morningRevenue + values.eveningRevenue !== values.reportTotalRevenue && expectedEveningRevenue >= 0) {
    values.eveningRevenue = expectedEveningRevenue;
    addWarning(warnings, "eveningRevenue", "تم تصحيح القيمة من إجمالي الصف");
  }
};

const numericValue = (cell: OcrCell, field: string, warnings: OcrFieldWarnings) => {
  if (cell.hadLetters) addWarning(warnings, field, "الخلية الرقمية احتوت حروف وتم رفضها");
  const value = Number(onlyDigits(cell.text));
  if (cell.text && cell.confidence < 72) addWarning(warnings, field, "ثقة الرقم منخفضة");
  if (field.toLowerCase().includes("orders") && value > 99) addWarning(warnings, field, "رقم الطلبات غير منطقي ومحتاج مراجعة");
  if (field.toLowerCase().includes("revenue") && value > 999999) addWarning(warnings, field, "قيمة الأوردر غير منطقية ومحتاجة مراجعة");
  return Number.isFinite(value) ? value : 0;
};

const validateCalculatedTotals = (
  values: {
    morningOrders: number;
    morningRevenue: number;
    eveningOrders: number;
    eveningRevenue: number;
    reportTotalOrders: number;
    reportTotalRevenue: number;
  },
  warnings: OcrFieldWarnings
) => {
  const calculatedOrders = values.morningOrders + values.eveningOrders;
  const calculatedRevenue = values.morningRevenue + values.eveningRevenue;
  if (values.reportTotalOrders > 0 && calculatedOrders !== values.reportTotalOrders) {
    addWarning(warnings, "reportTotalOrders", "إجمالي الطلبات لا يساوي صباحي + مسائي ومحتاج مراجعة");
  }
  if (values.reportTotalRevenue > 0 && calculatedRevenue !== values.reportTotalRevenue) {
    addWarning(warnings, "reportTotalRevenue", "إجمالي القيمة لا يساوي صباحي + مسائي ومحتاج مراجعة");
  }
};

const normalizePageName = (value: string, warnings: OcrFieldWarnings) => {
  const cleaned = cleanText(value);
  const normalized = normalizeLookup(cleaned);
  if (!normalized) return cleaned;
  let best = { canonical: cleaned, score: 0 };
  for (const item of pageNames) {
    for (const alias of item.aliases) {
      const aliasScore = score(normalized, normalizeLookup(alias));
      if (aliasScore > best.score) best = { canonical: item.canonical, score: aliasScore };
    }
  }
  if (best.score < 0.68) addWarning(warnings, "name", "ثقة اسم الصفحة منخفضة");
  if (best.score >= 0.68 && best.canonical !== cleaned) addWarning(warnings, "name", `تم توحيد الاسم من "${cleaned}"`);
  return best.score >= 0.68 ? best.canonical : cleaned;
};

const onlyDigits = (value: string) =>
  value
    .replace(/[٠-٩]/g, (digit) => String("٠١٢٣٤٥٦٧٨٩".indexOf(digit)))
    .replace(/[۰-۹]/g, (digit) => String("۰۱۲۳۴۵۶۷۸۹".indexOf(digit)))
    .replace(/[^\d]/g, "");

const cleanText = (value: string) => value.replace(/[|()[\]{}]/g, " ").replace(/\s+/g, " ").trim();
const normalizeLookup = (value: string) =>
  cleanText(value)
    .replace(/[إأآ]/g, "ا")
    .replace(/[ة]/g, "ه")
    .replace(/[ى]/g, "ي")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .toLowerCase();

const score = (left: string, right: string) => {
  if (left.includes(right) || right.includes(left)) return 0.95;
  const distance = levenshtein(left, right);
  return 1 - distance / Math.max(left.length, right.length, 1);
};

const levenshtein = (left: string, right: string) => {
  const row = Array.from({ length: right.length + 1 }, (_, index) => index);
  for (let i = 1; i <= left.length; i += 1) {
    let previous = row[0];
    row[0] = i;
    for (let j = 1; j <= right.length; j += 1) {
      const saved = row[j];
      row[j] = Math.min(row[j] + 1, row[j - 1] + 1, previous + (left[i - 1] === right[j - 1] ? 0 : 1));
      previous = saved;
    }
  }
  return row[right.length];
};

const isSubtotalName = (name: string) => /اجمالي|إجمالي/.test(name);
const isHeaderOrTotal = (name: string) => /الصفحة|الصفحات|السيليز|السيلز|كود|اجمالي اليوم|إجمالي اليوم/.test(name);
const average = (values: number[]) => Math.round(values.reduce((total, value) => total + value, 0) / Math.max(values.length, 1));
const addWarning = (warnings: OcrFieldWarnings, field: string, message: string) => {
  warnings[field] = [...(warnings[field] ?? []), message];
};

const sharpenCanvas = (canvas: HTMLCanvasElement) => {
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) return;
  const imageData = context.getImageData(0, 0, canvas.width, canvas.height);
  context.putImageData(imageData, 0, 0);
};

const deskewCanvas = (canvas: HTMLCanvasElement) => canvas;

const canvasToBlob = (canvas: HTMLCanvasElement) =>
  new Promise<Blob>((resolve) => canvas.toBlob((blob) => resolve(blob ?? new Blob()), "image/png", 1));

const loadImage = (file: File) =>
  new Promise<HTMLImageElement>((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      URL.revokeObjectURL(url);
      resolve(image);
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("تعذر تجهيز الصورة للقراءة"));
    };
    image.src = url;
  });
