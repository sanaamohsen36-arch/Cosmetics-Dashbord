import * as XLSX from "xlsx";
import Tesseract from "tesseract.js";
import type { AdsPlatform, AdsRow, SalesByPlatform, SalesBySalesperson } from "../types";
import { createId } from "./storage";

const currentYear = new Date().getFullYear();

export interface OcrWord {
  text: string;
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

export interface SalesOcrResult {
  text: string;
  words: OcrWord[];
}

interface ParsedNumericCells {
  morningOrders: number;
  morningRevenue: number;
  eveningOrders: number;
  eveningRevenue: number;
  reportTotalOrders: number;
  reportTotalRevenue: number;
}

type NumericColumnMap = Record<keyof ParsedNumericCells, [number, number]>;

export const inferDateFromFileName = (fileName: string): string => {
  const normalized = fileName.replace(/[_.]/g, "-");
  const ymd = normalized.match(/(20\d{2})[-/ :](\d{1,2})[-/ :](\d{1,2})/);
  if (ymd) return toISODate(Number(ymd[1]), Number(ymd[2]), Number(ymd[3]));

  const dmy = normalized.match(/(\d{1,2})[-/ :](\d{1,2})[-/ :](20\d{2})/);
  if (dmy) return toISODate(Number(dmy[3]), Number(dmy[2]), Number(dmy[1]));

  const dayMonth = normalized.match(/(?:^|[^\d])(\d{1,2})[-/ :](\d{1,2})(?:[^\d]|$)/);
  if (dayMonth) return toISODate(currentYear, Number(dayMonth[2]), Number(dayMonth[1]));

  return new Date().toISOString().slice(0, 10);
};

const toISODate = (year: number, month: number, day: number) => {
  const safeMonth = Math.max(1, Math.min(12, month));
  const safeDay = Math.max(1, Math.min(31, day));
  return `${year}-${String(safeMonth).padStart(2, "0")}-${String(safeDay).padStart(2, "0")}`;
};

const toNumber = (value: unknown): number => {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  const text = String(value ?? "")
    .replace(/[٠-٩]/g, (digit) => String("٠١٢٣٤٥٦٧٨٩".indexOf(digit)))
    .replace(/[۰-۹]/g, (digit) => String("۰۱۲۳۴۵۶۷۸۹".indexOf(digit)))
    .replace(/[٬,]/g, "")
    .replace(/[^\d.-]/g, "");
  const number = Number(text);
  return Number.isFinite(number) ? number : 0;
};

const cleanText = (value: string) =>
  value
    .replace(/[|()[\]{}]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

export const runArabicOcr = async (file: File, onProgress: (message: string, progress: number) => void) => {
  const result = await Tesseract.recognize(file, "ara+eng", {
    logger: (event) => {
      if (event.status) onProgress(event.status, Math.round((event.progress || 0) * 100));
    }
  });
  const data = result.data as unknown as { text?: string; words?: Array<{ text?: string; bbox?: { x0: number; y0: number; x1: number; y1: number } }> };
  return {
    text: data.text ?? "",
    words: (data.words ?? [])
      .filter((word) => word.text?.trim() && word.bbox)
      .map((word) => ({
        text: cleanText(word.text ?? ""),
        x0: word.bbox?.x0 ?? 0,
        y0: word.bbox?.y0 ?? 0,
        x1: word.bbox?.x1 ?? 0,
        y1: word.bbox?.y1 ?? 0
      }))
  };
};

export const parseSalesOcrText = (
  ocr: SalesOcrResult,
  reportDate: string,
  sourceFileId: string
): { people: SalesBySalesperson[]; platforms: SalesByPlatform[] } => {
  const now = new Date().toISOString();
  const words = ocr.words.filter((word) => word.text);
  const bounds = getWordBounds(words);
  const people = parseSalespersonGrid(words, bounds, reportDate, sourceFileId, now);
  const platforms = parsePlatformGrid(words, bounds, reportDate, sourceFileId, now);

  return { people, platforms };
};

const getWordBounds = (words: OcrWord[]) => ({
  width: Math.max(...words.map((word) => word.x1), 1),
  height: Math.max(...words.map((word) => word.y1), 1)
});

const parseSalespersonGrid = (
  words: OcrWord[],
  bounds: { width: number; height: number },
  reportDate: string,
  sourceFileId: string,
  createdAt: string
): SalesBySalesperson[] => {
  const columns = {
    reportTotalRevenue: [0.478, 0.535],
    reportTotalOrders: [0.535, 0.585],
    eveningRevenue: [0.585, 0.638],
    eveningOrders: [0.638, 0.689],
    morningRevenue: [0.689, 0.748],
    morningOrders: [0.748, 0.81],
    name: [0.81, 0.935],
    code: [0.935, 0.982]
  } satisfies Record<string, [number, number]>;
  const rows = groupGridRows(words, bounds, { xMin: 0.478, xMax: 0.982, yMin: 0.13, yMax: 0.945 });

  return rows
    .map((rowWords) => {
      const salespersonName = cellText(rowWords, bounds.width, columns.name);
      const salespersonCode = String(cellNumber(rowWords, bounds.width, columns.code) || "");
      const parsedCells = parseNumericCells(rowWords, bounds.width, columns);
      const { morningOrders, morningRevenue, eveningOrders, eveningRevenue } = parsedCells;
      const totalOrders = morningOrders + eveningOrders;
      const totalRevenue = morningRevenue + eveningRevenue;

      validateReportTotals("salesperson", salespersonName, parsedCells, totalOrders, totalRevenue);

      return {
        id: createId(),
        reportDate,
        salespersonName,
        salespersonCode,
        morningOrders,
        morningRevenue,
        eveningOrders,
        eveningRevenue,
        totalOrders,
        totalRevenue,
        sourceFileId,
        createdAt
      };
    })
    .filter((row) => isValidSalespersonRow(row.salespersonName, row.salespersonCode, row.totalOrders, row.totalRevenue));
};

const parsePlatformGrid = (
  words: OcrWord[],
  bounds: { width: number; height: number },
  reportDate: string,
  sourceFileId: string,
  createdAt: string
): SalesByPlatform[] => {
  const columns = {
    reportTotalRevenue: [0.0, 0.071],
    reportTotalOrders: [0.071, 0.142],
    eveningRevenue: [0.142, 0.195],
    eveningOrders: [0.195, 0.247],
    morningRevenue: [0.247, 0.31],
    morningOrders: [0.31, 0.372],
    name: [0.372, 0.477]
  } satisfies Record<string, [number, number]>;
  const rows = groupGridRows(words, bounds, { xMin: 0.0, xMax: 0.477, yMin: 0.18, yMax: 0.50 });

  return rows
    .map((rowWords) => {
      const platformName = cellText(rowWords, bounds.width, columns.name);
      const parsedCells = parseNumericCells(rowWords, bounds.width, columns);
      const { morningOrders, morningRevenue, eveningOrders, eveningRevenue } = parsedCells;
      const totalOrders = morningOrders + eveningOrders;
      const totalRevenue = morningRevenue + eveningRevenue;

      validateReportTotals("platform", platformName, parsedCells, totalOrders, totalRevenue);

      return {
        id: createId(),
        reportDate,
        platformName,
        morningOrders,
        morningRevenue,
        eveningOrders,
        eveningRevenue,
        totalOrders,
        totalRevenue,
        sourceFileId,
        createdAt
      };
    })
    .filter((row) => isValidPlatformRow(row.platformName, row.totalOrders, row.totalRevenue));
};

const groupGridRows = (
  words: OcrWord[],
  bounds: { width: number; height: number },
  area: { xMin: number; xMax: number; yMin: number; yMax: number }
) => {
  const rowWords = words
    .filter((word) => {
      const cx = centerX(word) / bounds.width;
      const cy = centerY(word) / bounds.height;
      return cx >= area.xMin && cx <= area.xMax && cy >= area.yMin && cy <= area.yMax;
    })
    .sort((a, b) => centerY(a) - centerY(b));

  const tolerance = bounds.height * 0.026;
  const rows: OcrWord[][] = [];
  for (const word of rowWords) {
    const existing = rows.find((row) => Math.abs(avgY(row) - centerY(word)) <= tolerance);
    if (existing) {
      existing.push(word);
    } else {
      rows.push([word]);
    }
  }

  return rows
    .map((row) => row.sort((a, b) => centerX(b) - centerX(a)))
    .filter((row) => row.length >= 2);
};

const cellWords = (rowWords: OcrWord[], width: number, range: [number, number]) =>
  rowWords.filter((word) => {
    const cx = centerX(word) / width;
    return cx >= range[0] && cx < range[1];
  });

const cellText = (rowWords: OcrWord[], width: number, range: [number, number]) =>
  cellWords(rowWords, width, range)
    .sort((a, b) => centerX(b) - centerX(a))
    .map((word) => word.text)
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();

const cellNumber = (rowWords: OcrWord[], width: number, range: [number, number]) => {
  const text = cellWords(rowWords, width, range)
    .sort((a, b) => centerX(a) - centerX(b))
    .map((word) => word.text)
    .join("");
  return toNumber(text);
};

const parseNumericCells = (
  rowWords: OcrWord[],
  width: number,
  columns: NumericColumnMap
): ParsedNumericCells => ({
  morningOrders: cellNumber(rowWords, width, columns.morningOrders),
  morningRevenue: cellNumber(rowWords, width, columns.morningRevenue),
  eveningOrders: cellNumber(rowWords, width, columns.eveningOrders),
  eveningRevenue: cellNumber(rowWords, width, columns.eveningRevenue),
  reportTotalOrders: cellNumber(rowWords, width, columns.reportTotalOrders),
  reportTotalRevenue: cellNumber(rowWords, width, columns.reportTotalRevenue)
});

const validateReportTotals = (
  table: "salesperson" | "platform",
  label: string,
  parsedCells: ParsedNumericCells,
  calculatedOrders: number,
  calculatedRevenue: number
) => {
  const hasReportOrderTotal = parsedCells.reportTotalOrders > 0;
  const hasReportRevenueTotal = parsedCells.reportTotalRevenue > 0;
  const orderMismatch = hasReportOrderTotal && parsedCells.reportTotalOrders !== calculatedOrders;
  const revenueMismatch = hasReportRevenueTotal && parsedCells.reportTotalRevenue !== calculatedRevenue;

  if (orderMismatch || revenueMismatch) {
    console.warn("OCR table total mismatch", {
      table,
      label,
      reportTotalOrders: parsedCells.reportTotalOrders,
      calculatedOrders,
      reportTotalRevenue: parsedCells.reportTotalRevenue,
      calculatedRevenue
    });
  }
};

const centerX = (word: OcrWord) => (word.x0 + word.x1) / 2;
const centerY = (word: OcrWord) => (word.y0 + word.y1) / 2;
const avgY = (words: OcrWord[]) => words.reduce((total, word) => total + centerY(word), 0) / Math.max(words.length, 1);
const isSalespersonHeaderText = (text: string) =>
  /السيليز|السيلز|المبيعات|كود|الأوردرات|الاوردرات|صباحي|مسائي|إجمالي مبيعات|اجمالي مبيعات/.test(text);
const isPlatformHeaderText = (text: string) =>
  /الصفحة|الصفحات|إجمالي اليوم|اجمالي اليوم|الأوردرات|الاوردرات|صباحي|مسائي/.test(text);
const isValidSalespersonRow = (name: string, code: string, totalOrders: number, totalRevenue: number) =>
  Boolean(name && code && !isSalespersonHeaderText(name) && (totalOrders > 0 || totalRevenue > 0));
const isValidPlatformRow = (name: string, totalOrders: number, totalRevenue: number) =>
  Boolean(name && !isPlatformHeaderText(name) && (totalOrders > 0 || totalRevenue > 0));

const aliases: Record<string, string[]> = {
  reportDate: ["date", "day", "التاريخ", "اليوم"],
  campaignName: ["campaign", "campaign name", "اسم الحملة", "Campaign name"],
  adsetName: ["ad set", "adset", "ad group", "adgroup", "اسم المجموعة", "Ad group name"],
  adName: ["ad name", "ad", "اسم الإعلان"],
  spend: ["amount spent", "spend", "cost", "مصروف", "التكلفة"],
  impressions: ["impressions", "الظهور"],
  reach: ["reach", "الوصول"],
  clicks: ["clicks", "link clicks", "النقرات"],
  ctr: ["ctr", "click-through rate"],
  cpc: ["cpc", "cost per click"],
  cpm: ["cpm"],
  leads: ["leads", "lead", "عملاء محتملون"],
  purchases: ["purchases", "orders", "conversions", "purchase", "طلبات"],
  purchaseValue: ["purchase conversion value", "purchase value", "revenue", "value", "قيمة"]
};

export const parseAdsWorkbook = async (
  file: File,
  platform: AdsPlatform,
  salesPlatformName: string,
  fallbackDate: string,
  sourceFileId: string
): Promise<AdsRow[]> => {
  const buffer = await file.arrayBuffer();
  const workbook = XLSX.read(buffer, { type: "array", cellDates: true });
  const sheetName = workbook.SheetNames[0];
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(workbook.Sheets[sheetName], { defval: "" });
  const now = new Date().toISOString();

  return rows
    .map((row) => {
      const read = (field: keyof typeof aliases) => readAliased(row, aliases[field]);
      const reportDate = normalizeExcelDate(read("reportDate")) || fallbackDate;
      return {
        id: createId(),
        reportDate,
        adsPlatform: platform,
        salesPlatformName,
        campaignName: String(read("campaignName") || "بدون اسم"),
        adsetName: String(read("adsetName") || ""),
        adName: String(read("adName") || ""),
        spend: toNumber(read("spend")),
        impressions: toNumber(read("impressions")),
        reach: toNumber(read("reach")),
        clicks: toNumber(read("clicks")),
        ctr: toNumber(read("ctr")),
        cpc: toNumber(read("cpc")),
        cpm: toNumber(read("cpm")),
        leads: toNumber(read("leads")),
        purchases: toNumber(read("purchases")),
        purchaseValue: toNumber(read("purchaseValue")),
        sourceFileId,
        createdAt: now
      };
    })
    .filter((row) => row.campaignName !== "بدون اسم" || row.spend || row.impressions || row.clicks);
};

const readAliased = (row: Record<string, unknown>, names: string[]) => {
  const keys = Object.keys(row);
  const found = keys.find((key) => names.some((alias) => key.toLowerCase().trim().includes(alias.toLowerCase())));
  return found ? row[found] : "";
};

const normalizeExcelDate = (value: unknown): string => {
  if (!value) return "";
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  const text = String(value);
  if (/^\d{4}-\d{2}-\d{2}/.test(text)) return text.slice(0, 10);
  const match = text.match(/(\d{1,2})[/-](\d{1,2})[/-](20\d{2})/);
  if (match) return `${match[3]}-${match[2].padStart(2, "0")}-${match[1].padStart(2, "0")}`;
  return "";
};

export const createSampleSales = (reportDate: string, sourceFileId: string) => {
  const now = new Date().toISOString();
  const samples: Record<string, { people: (string | number)[][]; platforms: (string | number)[][] }> = {
    "2026-06-21": {
      people: [
        ["مريم حمدى", "86", 2, 2300, 0, 0],
        ["فرح احمد", "26", 4, 4211, 0, 0],
        ["دينا منصور", "73", 4, 5443, 0, 0],
        ["مريم رجب", "95", 3, 2850, 0, 0],
        ["هاجر ايمن", "117", 2, 1861, 0, 0],
        ["ساره حسن", "31", 4, 6066, 0, 0],
        ["امنيه محمد", "111", 4, 4130, 0, 0],
        ["الاء يحيي", "14", 4, 7600, 0, 0],
        ["اميره محمود", "46", 8, 14172, 0, 0],
        ["شهد عيد", "35", 4, 6386, 0, 0],
        ["رشا سمير", "131", 8, 13918, 0, 0],
        ["حنان", "130", 3, 6850, 0, 0],
        ["نغم عماد", "108", 6, 10599, 0, 0],
        ["نورا احمد", "45", 6, 8941, 0, 0],
        ["شهد امير", "166", 4, 6450, 0, 0],
        ["محمد رمضان", "109", 0, 0, 6, 7022],
        ["يوسف مجي", "148", 0, 0, 6, 8316],
        ["عبد الرحمن راضي", "7", 0, 0, 8, 8388],
        ["اسراء حكيم", "32", 0, 0, 2, 1761],
        ["أية عاطف", "100", 0, 0, 4, 6316],
        ["عبد الرحمن خالد", "199", 0, 0, 7, 6644],
        ["سعيد خالد", "99", 0, 0, 7, 5461],
        ["اميرة حسن", "89", 0, 0, 7, 7050]
      ],
      platforms: [
        ["ريجينكس eg", 6, 6150, 7, 8688],
        ["واتس اب ريجينكس", 4, 6066, 5, 4011],
        ["ريجينكس", 9, 10515, 12, 17093],
        ["إجمالي السوشيال", 19, 22731, 24, 29792],
        ["تليفون إعلان", 6, 8140, 8, 7144],
        ["تيم المتابعة", 12, 19741, 7, 7050],
        ["المتابعة", 29, 51165, 8, 6972]
      ]
    },
    "2026-06-22": {
      people: [
        ["شروق فوزي", "149", 12, 12180, 0, 0],
        ["فرح احمد", "26", 11, 9685, 0, 0],
        ["دينا منصور", "73", 10, 10126, 0, 0],
        ["مريم رجب", "95", 6, 8145, 0, 0],
        ["محمد رمضان", "109", 0, 0, 15, 15901],
        ["يوسف مجي", "148", 0, 0, 15, 13062]
      ],
      platforms: [
        ["ريجينكس eg", 14, 14625, 15, 12496],
        ["واتس اب ريجينكس", 13, 18888, 8, 9350],
        ["ريجينكس", 33, 31931, 37, 35781],
        ["إجمالي السوشيال", 60, 65444, 60, 57627],
        ["تليفون إعلان", 22, 32990, 20, 24720],
        ["تيم المتابعة", 14, 10549, 0, 0],
        ["المتابعة", 43, 51311, 10, 7950]
      ]
    }
  };
  const sample = samples[reportDate] ?? samples["2026-06-21"];
  const peopleSeed = sample.people;
  const platformSeed = sample.platforms;

  return {
    people: peopleSeed.map(([salespersonName, salespersonCode, morningOrders, morningRevenue, eveningOrders, eveningRevenue]) => ({
      id: createId(),
      reportDate,
      salespersonName: String(salespersonName),
      salespersonCode: String(salespersonCode),
      morningOrders: Number(morningOrders),
      morningRevenue: Number(morningRevenue),
      eveningOrders: Number(eveningOrders),
      eveningRevenue: Number(eveningRevenue),
      totalOrders: Number(morningOrders) + Number(eveningOrders),
      totalRevenue: Number(morningRevenue) + Number(eveningRevenue),
      sourceFileId,
      createdAt: now
    })),
    platforms: platformSeed.map(([platformName, morningOrders, morningRevenue, eveningOrders, eveningRevenue]) => ({
      id: createId(),
      reportDate,
      platformName: String(platformName),
      morningOrders: Number(morningOrders),
      morningRevenue: Number(morningRevenue),
      eveningOrders: Number(eveningOrders),
      eveningRevenue: Number(eveningRevenue),
      totalOrders: Number(morningOrders) + Number(eveningOrders),
      totalRevenue: Number(morningRevenue) + Number(eveningRevenue),
      sourceFileId,
      createdAt: now
    }))
  };
};