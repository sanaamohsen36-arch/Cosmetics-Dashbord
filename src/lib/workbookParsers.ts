import * as XLSX from "xlsx";
import type { AdsPlatform, AdsRow, SalesByPlatform, SalesBySalesperson, SalesGroupType, SalesRowType } from "../types";
import { createId } from "./storage";
import { requestOcrExtraction } from "./ocr/client";

type ParsedSalesWorkbook = {
  people: SalesBySalesperson[];
  platforms: SalesByPlatform[];
  errors: string[];
  debug: WorkbookDebug[];
};

type WorkbookDebug = {
  sheetName: string;
  headers: Array<{ columnIndex: number; value: string }>;
  sampleRows: unknown[][];
};

type HeaderMap = Record<string, number>;

const salesAliases = {
  date: ["report_date", "date", "day", "التاريخ", "تاريخ التقرير"],
  salespersonName: ["salesperson_name", "salesperson", "sales", "السيلز", "اسم السيلز", "مندوب", "اسم المندوب"],
  salespersonCode: ["salesperson_code", "code", "كود", "كود السيلز", "كود المندوب"],
  shift: ["shift", "الشيفت", "الفترة", "وردية"],
  orders: ["orders_count", "orders", "عدد الاوردرات", "عدد الأوردرات", "اوردرات", "الأوردرات"],
  value: ["orders_value", "value", "revenue", "قيمة الاوردرات", "قيمة الأوردرات", "القيمة", "قيمة"],
  category: ["category", "section", "القسم", "قسم"],
  pageName: ["page_platform_name", "page_name", "platform_name", "page", "platform", "الصفحة", "صفحة", "البلاتفورم"]
};

const adAliases = {
  reportDate: ["report_date", "date", "day", "التاريخ", "reporting starts", "reporting starts at", "reporting ends"],
  campaignName: ["campaign_name", "campaign name", "campaign", "الحملة", "اسم الحملة"],
  adsetName: ["adset_name", "ad set name", "ad group name", "adgroup_name", "ad group", "adset", "المجموعة الإعلانية"],
  adName: ["ad_name", "ad name", "ad", "الإعلان", "اسم الإعلان"],
  spend: ["amount spent (egp)", "amount spent", "spend", "cost", "مصروف", "الصرف", "التكلفة"],
  impressions: ["impressions", "مرات الظهور", "ظهور"],
  reach: ["reach", "الوصول"],
  clicks: ["clicks", "link clicks", "النقرات", "نقرات"],
  ctr: ["ctr", "ctr (all)", "click-through rate"],
  cpc: ["cpc", "cost per click"],
  cpm: ["cpm", "cost per 1,000 impressions"],
  leads: ["leads", "lead", "نتائج leads"],
  results: ["results", "النتائج"],
  resultType: ["result indicator", "result type", "results indicator", "مؤشر النتيجة"],
  messagesCount: ["messaging conversations started", "messages", "message conversations", "عدد الرسائل", "رسائل"],
  commentsCount: ["post comments", "comments", "عدد التعليقات", "تعليقات", "كومنتات"],
  purchases: ["purchases", "purchase", "orders", "conversions", "عمليات الشراء", "الطلبات"],
  purchaseValue: ["purchase value", "conversion value", "revenue", "القيمة", "قيمة الشراء"],
  costPerConversion: ["cost per conversion", "cost/conversion"]
};

// Shared by the Excel/CSV path and the OCR path: both ultimately produce a plain
// row-major grid of cell text, so column detection, shift/subtotal classification,
// and numeric validation only need to live once.
const processGridIntoMaps = (
  rows: unknown[][],
  gridLabel: string,
  fallbackDate: string,
  sourceFileId: string,
  now: string,
  peopleMap: Map<string, SalesBySalesperson>,
  platformMap: Map<string, SalesByPlatform>,
  errors: string[],
  debug: WorkbookDebug[]
) => {
  const headerRowIndex = rows.findIndex((row) => row.some((cell) => normalizeHeader(cell).length > 0));
  if (headerRowIndex < 0) return;

  const headers = rows[headerRowIndex].map((cell) => String(cell ?? "").trim());
  debug.push({
    sheetName: gridLabel,
    headers: headers.map((value, columnIndex) => ({ columnIndex, value })).filter((item) => item.value && !isUnnamed(item.value)),
    sampleRows: rows.slice(headerRowIndex + 1, headerRowIndex + 7)
  });
  console.info("Sales grid inspected", debug[debug.length - 1]);

  const normalizedHeaders = headers.map(normalizeHeader);
  const peopleColumns = detectPeopleColumns(normalizedHeaders);
  const pageColumns = detectPageColumns(normalizedHeaders, peopleColumns?.endIndex ?? -1);
  const sheetType = detectSheetType(gridLabel, normalizedHeaders);

  for (let rowIndex = headerRowIndex + 1; rowIndex < rows.length; rowIndex += 1) {
    const row = rows[rowIndex];
    const excelRow = rowIndex + 1;
    if (isEmptyRow(row)) continue;

    try {
      if (peopleColumns && sheetType !== "pages") {
        readPeopleRow(row, excelRow, peopleColumns, fallbackDate, sourceFileId, now, peopleMap);
      }
      if (pageColumns && sheetType !== "people") {
        readPlatformRow(row, excelRow, pageColumns, fallbackDate, sourceFileId, now, platformMap);
      }
    } catch (error) {
      errors.push(error instanceof Error ? error.message : String(error));
    }
  }
};

export const parseSalesWorkbook = async (
  file: File,
  fallbackDate: string,
  sourceFileId: string
): Promise<ParsedSalesWorkbook> => {
  const workbook = XLSX.read(await file.arrayBuffer(), { type: "array", cellDates: true });
  const now = new Date().toISOString();
  const peopleMap = new Map<string, SalesBySalesperson>();
  const platformMap = new Map<string, SalesByPlatform>();
  const errors: string[] = [];
  const debug: WorkbookDebug[] = [];

  for (const sheetName of workbook.SheetNames) {
    const sheet = workbook.Sheets[sheetName];
    const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: null, raw: false });
    processGridIntoMaps(rows, sheetName, fallbackDate, sourceFileId, now, peopleMap, platformMap, errors, debug);
  }

  return {
    people: [...peopleMap.values()].sort((a, b) => b.totalRevenue - a.totalRevenue),
    platforms: [...platformMap.values()].sort((a, b) => b.totalRevenue - a.totalRevenue),
    errors,
    debug
  };
};

// Entry point for any non-spreadsheet source (OCR, future manual paste, etc.) that
// has already been reduced to a row-major grid of cell text. Runs the exact same
// column detection and validation as the Excel/CSV path.
export const parseSalesGrid = (
  rows: unknown[][],
  fallbackDate: string,
  sourceFileId: string,
  gridLabel = "ocr"
): ParsedSalesWorkbook => {
  const now = new Date().toISOString();
  const peopleMap = new Map<string, SalesBySalesperson>();
  const platformMap = new Map<string, SalesByPlatform>();
  const errors: string[] = [];
  const debug: WorkbookDebug[] = [];

  processGridIntoMaps(rows, gridLabel, fallbackDate, sourceFileId, now, peopleMap, platformMap, errors, debug);

  return {
    people: [...peopleMap.values()].sort((a, b) => b.totalRevenue - a.totalRevenue),
    platforms: [...platformMap.values()].sort((a, b) => b.totalRevenue - a.totalRevenue),
    errors,
    debug
  };
};

export const parseSalesImage = async (
  file: File,
  fallbackDate: string,
  sourceFileId: string
): Promise<ParsedSalesWorkbook> => {
  const extraction = await requestOcrExtraction(file, fallbackDate);
  if (extraction.warnings.length) {
    console.warn("Sales OCR warnings", extraction.providerId, extraction.warnings);
  }
  return parseSalesGrid(extraction.rows, fallbackDate, sourceFileId, `ocr:${extraction.providerId}`);
};

export const parseAdsWorkbook = async (
  file: File,
  platform: AdsPlatform,
  fallbackDate: string,
  sourceFileId: string
): Promise<{ rows: AdsRow[]; errors: string[]; debug: WorkbookDebug[] }> => {
  const workbook = XLSX.read(await file.arrayBuffer(), { type: "array", cellDates: true });
  const now = new Date().toISOString();
  const output: AdsRow[] = [];
  const errors: string[] = [];
  const debug: WorkbookDebug[] = [];

  for (const sheetName of workbook.SheetNames.slice(0, 1)) {
    const sheet = workbook.Sheets[sheetName];
    const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: null, raw: false });
    const headerRowIndex = rows.findIndex((row) => row.some((cell) => normalizeHeader(cell).length > 0));
    if (headerRowIndex < 0) continue;

    const headers = rows[headerRowIndex].map((cell) => String(cell ?? "").trim());
    const map = buildHeaderMap(headers);
    debug.push({
      sheetName,
      headers: headers.map((value, columnIndex) => ({ columnIndex, value })).filter((item) => item.value && !isUnnamed(item.value)),
      sampleRows: rows.slice(headerRowIndex + 1, headerRowIndex + 7)
    });
    console.info(`${platform} workbook inspected`, debug[debug.length - 1]);

    for (let rowIndex = headerRowIndex + 1; rowIndex < rows.length; rowIndex += 1) {
      const row = rows[rowIndex];
      const excelRow = rowIndex + 1;
      if (isEmptyRow(row)) continue;
      try {
        const campaignName = readText(row, map, adAliases.campaignName);
        const adName = readText(row, map, adAliases.adName);
        const spend = readOptionalNumber(row, map, adAliases.spend);
        const impressions = readOptionalNumber(row, map, adAliases.impressions);
        const clicks = readOptionalNumber(row, map, adAliases.clicks);
        if (!campaignName && !adName && spend === 0 && impressions === 0 && clicks === 0) continue;

        const resultType = readText(row, map, adAliases.resultType).toLowerCase();
        const resultCount = readOptionalNumber(row, map, adAliases.results);
        const costPerResult = readOptionalNumber(row, map, adAliases.costPerConversion);
        output.push({
          id: createId(),
          reportDate: normalizeExcelDate(readText(row, map, adAliases.reportDate)) || fallbackDate,
          adsPlatform: platform,
          salesPlatformName: "عام",
          adAccountName: "غير محدد",
          campaignName: campaignName || "بدون اسم",
          adsetName: readText(row, map, adAliases.adsetName),
          adName,
          spend,
          impressions,
          reach: readOptionalNumber(row, map, adAliases.reach),
          clicks,
          ctr: readOptionalNumber(row, map, adAliases.ctr),
          cpc: readOptionalNumber(row, map, adAliases.cpc),
          cpm: readOptionalNumber(row, map, adAliases.cpm),
          leads: readOptionalNumber(row, map, adAliases.leads),
          resultsCount: resultCount,
          costPerResult,
          messagesCount: readOptionalNumber(row, map, adAliases.messagesCount) || (isMessageResult(resultType) ? resultCount : 0),
          commentsCount: readOptionalNumber(row, map, adAliases.commentsCount) || (isCommentResult(resultType) ? resultCount : 0),
          purchases: readOptionalNumber(row, map, adAliases.purchases),
          purchaseValue: readOptionalNumber(row, map, adAliases.purchaseValue) || (platform === "TikTok" ? readOptionalNumber(row, map, adAliases.purchaseValue) : 0),
          sourceFileId,
          createdAt: now
        });
      } catch (error) {
        errors.push(`صف ${excelRow}: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
  }

  return { rows: output, errors, debug };
};

const detectPeopleColumns = (headers: string[]) => {
  const name = findHeader(headers, salesAliases.salespersonName);
  const shift = findHeader(headers, salesAliases.shift);
  if (name < 0 || shift < 0) return null;
  const code = findHeader(headers, salesAliases.salespersonCode);
  const nextPageStart = findHeader(headers, salesAliases.category, shift + 1);
  const endIndex = nextPageStart > shift ? nextPageStart : headers.length;
  const orders = findHeader(headers, salesAliases.orders, shift + 1, endIndex);
  const value = findHeader(headers, salesAliases.value, shift + 1, endIndex);
  if (orders < 0 || value < 0) return null;
  return { name, code, shift, orders, value, date: findHeader(headers, salesAliases.date), endIndex };
};

const detectPageColumns = (headers: string[], afterIndex: number) => {
  const category = findHeader(headers, salesAliases.category, Math.max(0, afterIndex));
  const page = findHeader(headers, salesAliases.pageName, Math.max(0, afterIndex));
  if (page < 0) return null;
  const shift = findHeader(headers, salesAliases.shift, page + 1);
  const orders = findHeader(headers, salesAliases.orders, page + 1);
  const value = findHeader(headers, salesAliases.value, page + 1);
  if (orders < 0 || value < 0) return null;
  return { category, page, shift, orders, value, date: findHeader(headers, salesAliases.date) };
};

const readPeopleRow = (
  row: unknown[],
  excelRow: number,
  columns: NonNullable<ReturnType<typeof detectPeopleColumns>>,
  fallbackDate: string,
  sourceFileId: string,
  createdAt: string,
  map: Map<string, SalesBySalesperson>
) => {
  const name = String(row[columns.name] ?? "").trim();
  const shift = String(row[columns.shift] ?? "").trim();
  if (!name && !shift && !hasValue(row[columns.orders]) && !hasValue(row[columns.value])) return;
  if (!name) throw new Error(`صف ${excelRow}: اسم السيلز فارغ.`);
  if (!shift) throw new Error(`صف ${excelRow}: الشيفت فارغ.`);

  const code = columns.code >= 0 ? String(row[columns.code] ?? "").trim() : "";
  const key = `${code || normalizeText(name)}`;
  const existing =
    map.get(key) ??
    {
      id: createId(),
      reportDate: normalizeExcelDate(row[columns.date]) || fallbackDate,
      salespersonName: name,
      salespersonCode: code,
      morningOrders: 0,
      morningRevenue: 0,
      eveningOrders: 0,
      eveningRevenue: 0,
      totalOrders: 0,
      totalRevenue: 0,
      sourceFileId,
      createdAt
    };
  const orders = readRequiredNumber(row[columns.orders], `صف ${excelRow}: عدد أوردرات السيلز`);
  const value = readRequiredNumber(row[columns.value], `صف ${excelRow}: قيمة أوردرات السيلز`);
  if (isEveningShift(shift)) {
    existing.eveningOrders += orders;
    existing.eveningRevenue += value;
  } else {
    existing.morningOrders += orders;
    existing.morningRevenue += value;
  }
  existing.totalOrders = existing.morningOrders + existing.eveningOrders;
  existing.totalRevenue = existing.morningRevenue + existing.eveningRevenue;
  map.set(key, existing);
};

const readPlatformRow = (
  row: unknown[],
  excelRow: number,
  columns: NonNullable<ReturnType<typeof detectPageColumns>>,
  fallbackDate: string,
  sourceFileId: string,
  createdAt: string,
  map: Map<string, SalesByPlatform>
) => {
  const name = String(row[columns.page] ?? "").trim();
  const category = columns.category >= 0 ? String(row[columns.category] ?? "").trim() : "";
  if (!name && !category && !hasValue(row[columns.orders]) && !hasValue(row[columns.value])) return;
  if (!name) throw new Error(`صف ${excelRow}: اسم الصفحة فارغ.`);

  const key = normalizeText(name);
  const rowType = classifySalesRowType(name);
  const groupType = classifySalesGroup(name, category);
  const existing =
    map.get(key) ??
    {
      id: createId(),
      reportDate: normalizeExcelDate(row[columns.date]) || fallbackDate,
      platformCategory: category,
      groupType,
      rowType,
      platformName: name,
      morningOrders: 0,
      morningRevenue: 0,
      eveningOrders: 0,
      eveningRevenue: 0,
      totalOrders: 0,
      totalRevenue: 0,
      sourceFileId,
      createdAt
    };
  const orders = readRequiredNumber(row[columns.orders], `صف ${excelRow}: عدد أوردرات الصفحة`);
  const value = readRequiredNumber(row[columns.value], `صف ${excelRow}: قيمة الصفحة`);
  const shift = columns.shift >= 0 ? String(row[columns.shift] ?? "") : "";
  if (rowType !== "normal" || !shift) {
    existing.morningOrders += orders;
    existing.morningRevenue += value;
  } else if (isEveningShift(shift)) {
    existing.eveningOrders += orders;
    existing.eveningRevenue += value;
  } else {
    existing.morningOrders += orders;
    existing.morningRevenue += value;
  }
  existing.totalOrders = existing.morningOrders + existing.eveningOrders;
  existing.totalRevenue = existing.morningRevenue + existing.eveningRevenue;
  map.set(key, existing);
};

const detectSheetType = (sheetName: string, headers: string[]) => {
  const text = normalizeText(`${sheetName} ${headers.join(" ")}`);
  if (/pages_sales|page_platform|platform_name|الصفحة|البلاتفورم/.test(text) && !/السيلز|salesperson/.test(text)) return "pages";
  if (/salespeople_sales|salesperson|السيلز/.test(text) && !/الصفحة|platform/.test(text)) return "people";
  return "mixed";
};

const classifySalesRowType = (name: string): SalesRowType => {
  const normalized = normalizeText(name);
  if (/اجمالي اليوم|إجمالي اليوم|grand/.test(normalized)) return "grand_total";
  if (/اجمالي|إجمالي|total/.test(normalized)) return "subtotal";
  return "normal";
};

const classifySalesGroup = (name: string, category: string): SalesGroupType => {
  const text = normalizeText(`${category} ${name}`);
  if (/متابع|follow/.test(text)) return "follow_up";
  if (/سوشيال|social|ريجينكس|واتس|انست|facebook|instagram|tiktok/.test(text)) return "social";
  return "other";
};

const buildHeaderMap = (headers: string[]): HeaderMap => {
  const map: HeaderMap = {};
  headers.forEach((header, index) => {
    const key = normalizeHeader(header);
    if (key && !isUnnamed(key) && map[key] === undefined) map[key] = index;
  });
  return map;
};

const readText = (row: unknown[], map: HeaderMap, aliases: string[]) => {
  const index = findMappedHeader(map, aliases);
  return index >= 0 ? String(row[index] ?? "").trim() : "";
};

const readOptionalNumber = (row: unknown[], map: HeaderMap, aliases: string[]) => {
  const index = findMappedHeader(map, aliases);
  if (index < 0 || !hasValue(row[index])) return 0;
  return toNumber(row[index]);
};

const findMappedHeader = (map: HeaderMap, aliases: string[]) => {
  const keys = Object.keys(map);
  const normalizedAliases = aliases.map(normalizeHeader);
  const found =
    keys.find((key) => normalizedAliases.includes(key)) ??
    keys.find((key) => normalizedAliases.some((alias) => key.startsWith(alias))) ??
    keys.find((key) => normalizedAliases.some((alias) => key.includes(alias)));
  return found ? map[found] : -1;
};

const findHeader = (headers: string[], aliases: string[], startIndex = 0, endIndex = headers.length) => {
  const normalizedAliases = aliases.map(normalizeHeader);
  for (let index = Math.max(0, startIndex); index < Math.min(endIndex, headers.length); index += 1) {
    if (normalizedAliases.includes(headers[index])) return index;
  }
  return -1;
};

const readRequiredNumber = (value: unknown, label: string) => {
  if (!hasValue(value)) throw new Error(`${label} فارغ.`);
  return toNumber(value);
};

const toNumber = (value: unknown) => {
  const text = normalizeNumericText(String(value ?? ""));
  const numeric = text.replace(/,/g, "").replace(/[^\d.-]/g, "");
  if (!numeric || Number.isNaN(Number(numeric))) throw new Error(`قيمة غير رقمية (${String(value)}).`);
  return Number(numeric);
};

const normalizeNumericText = (value: string) =>
  value
    .replace(/[٠-٩]/g, (digit) => String("٠١٢٣٤٥٦٧٨٩".indexOf(digit)))
    .replace(/[۰-۹]/g, (digit) => String("۰۱۲۳۴۵۶۷۸۹".indexOf(digit)))
    .replace(/\s+/g, "");

const normalizeExcelDate = (value: unknown): string => {
  if (!value) return "";
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  const text = String(value).trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(text)) return text.slice(0, 10);
  const match = text.match(/(\d{1,2})[/-](\d{1,2})[/-](20\d{2})/);
  if (match) return `${match[3]}-${match[2].padStart(2, "0")}-${match[1].padStart(2, "0")}`;
  return "";
};

const normalizeHeader = (value: unknown) =>
  String(value ?? "")
    .replace(/[إأآ]/g, "ا")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();

const normalizeText = (value: string) => normalizeHeader(value);
const hasValue = (value: unknown) => String(value ?? "").trim() !== "";
const isEmptyRow = (row: unknown[]) => row.every((cell) => !hasValue(cell));
const isUnnamed = (value: string) => /^unnamed|^__empty|^null$|^undefined$/i.test(value.trim());
const isEveningShift = (value: string) => /مسائي|evening|night|pm/i.test(value);
const isMessageResult = (value: string) => /messag|conversation|محادث|رسائل|رسالة|whatsapp/i.test(value);
const isCommentResult = (value: string) => /comment|تعليق|كومنت/i.test(value);
