import * as XLSX from "xlsx";
import Tesseract from "tesseract.js";
import type { AdsPlatform, AdsRow, SalesByPlatform, SalesBySalesperson } from "../types";
import { createId } from "./storage";

const currentYear = new Date().getFullYear();

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
  return result.data.text;
};

export const parseSalesOcrText = (
  text: string,
  reportDate: string,
  sourceFileId: string
): { people: SalesBySalesperson[]; platforms: SalesByPlatform[] } => {
  const now = new Date().toISOString();
  const lines = text
    .split(/\n+/)
    .map(cleanText)
    .filter(Boolean);

  const people: SalesBySalesperson[] = [];
  const platforms: SalesByPlatform[] = [];

  for (const line of lines) {
    const numbers = [...line.matchAll(/\d+(?:[.,]\d+)?/g)].map((item) => toNumber(item[0]));
    const words = line
      .replace(/\d+(?:[.,]\d+)?/g, " ")
      .replace(/[A-Za-z]/g, " ")
      .replace(/\s+/g, " ")
      .trim();

    if (!words || numbers.length < 2) continue;
    if (/اجمالي|إجمالي|اليوم|السيليز|المبيعات|الصفحات|قيمة|عدد/.test(words)) continue;

    if (numbers.length >= 6 && words.length > 2) {
      const [code, morningOrders, morningRevenue, eveningOrders, eveningRevenue] = normalizePersonNumbers(numbers);
      people.push({
        id: createId(),
        reportDate,
        salespersonName: words,
        salespersonCode: String(code || ""),
        morningOrders,
        morningRevenue,
        eveningOrders,
        eveningRevenue,
        totalOrders: morningOrders + eveningOrders,
        totalRevenue: morningRevenue + eveningRevenue,
        sourceFileId,
        createdAt: now
      });
      continue;
    }

    if (numbers.length >= 4 && words.length > 2) {
      const [morningOrders, morningRevenue, eveningOrders, eveningRevenue] = normalizePlatformNumbers(numbers);
      platforms.push({
        id: createId(),
        reportDate,
        platformName: words,
        morningOrders,
        morningRevenue,
        eveningOrders,
        eveningRevenue,
        totalOrders: morningOrders + eveningOrders,
        totalRevenue: morningRevenue + eveningRevenue,
        sourceFileId,
        createdAt: now
      });
    }
  }

  return { people, platforms };
};

const normalizePersonNumbers = (numbers: number[]) => {
  const code = numbers.find((number) => number > 0 && number < 1000) ?? 0;
  const orderCandidates = numbers.filter((number) => number >= 0 && number < 1000);
  const revenueCandidates = numbers.filter((number) => number >= 1000);
  const morningOrders = orderCandidates[1] ?? orderCandidates[0] ?? 0;
  const eveningOrders = orderCandidates[2] ?? 0;
  const morningRevenue = revenueCandidates[0] ?? 0;
  const eveningRevenue = revenueCandidates[1] ?? 0;
  return [code, morningOrders, morningRevenue, eveningOrders, eveningRevenue];
};

const normalizePlatformNumbers = (numbers: number[]) => {
  const orderCandidates = numbers.filter((number) => number >= 0 && number < 1000);
  const revenueCandidates = numbers.filter((number) => number >= 1000);
  return [
    orderCandidates[0] ?? 0,
    revenueCandidates[0] ?? 0,
    orderCandidates[1] ?? 0,
    revenueCandidates[1] ?? 0
  ];
};

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
