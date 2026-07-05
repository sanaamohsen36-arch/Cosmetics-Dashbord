import * as XLSX from "xlsx";
import type { AdsPlatform, AdsRow, ColumnMapping, MappableField, SalesByPlatform, SalesBySalesperson, SalesGroupType, SalesRowType } from "../types";
import { createId } from "./supabase";
import { normalizeArabicText } from "./normalize";
import { findSavedMapping } from "./mapping-memory/columnMapping";
import { requestOcrExtraction } from "./ocr/client";

// Surfaced when a sheet's headers don't match a saved mapping or any known
// alias, so the UI can show the Mapping Wizard instead of failing outright.
// Carries the raw rows so the wizard-confirm handler can parse just this
// grid with the user's manual assignment, without re-reading the file.
export type PendingColumnMapping = {
  gridLabel: string;
  headers: string[];
  rows: unknown[][];
  headerRowIndex: number;
};

type ParsedSalesWorkbook = {
  people: SalesBySalesperson[];
  platforms: SalesByPlatform[];
  errors: string[];
  debug: WorkbookDebug[];
  pendingMapping?: PendingColumnMapping;
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
//
// Column recognition is three-tier, in priority order:
//   1. A previously-confirmed mapping for this exact header layout (learned
//      from the Mapping Wizard) - applied directly, no alias guessing.
//   2. Alias-based automatic detection (detectPeopleColumns/detectPageColumns).
//   3. Neither matched - hand the raw headers back as a "pending mapping" so
//      the UI can show the Mapping Wizard instead of silently returning
//      nothing or hard-failing.
const processGridIntoMaps = (
  rows: unknown[][],
  gridLabel: string,
  fallbackDate: string,
  sourceFileId: string,
  now: string,
  peopleMap: Map<string, SalesBySalesperson>,
  platformMap: Map<string, SalesByPlatform>,
  errors: string[],
  debug: WorkbookDebug[],
  savedMappings: ColumnMapping[],
  pendingMappings: PendingColumnMapping[]
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

  const savedMapping = findSavedMapping(savedMappings, headers);
  if (savedMapping) {
    applyManualMappingToMaps(rows, headerRowIndex, savedMapping.fields, fallbackDate, sourceFileId, now, peopleMap, platformMap, errors);
    return;
  }

  const normalizedHeaders = headers.map(normalizeHeader);
  const peopleColumns = detectPeopleColumns(normalizedHeaders);
  const pageColumns = detectPageColumns(normalizedHeaders, peopleColumns?.endIndex ?? -1);
  const sheetType = detectSheetType(gridLabel, normalizedHeaders);

  // Neither table was recognized in this sheet and there's no learned
  // mapping for it either - defer to the Mapping Wizard instead of silently
  // returning nothing (the previous behavior: empty result, zero errors, a
  // false "Preview ready" with no way to save).
  if (!peopleColumns && !pageColumns) {
    pendingMappings.push({ gridLabel, headers, rows, headerRowIndex });
    return;
  }

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

// Reads a single row using a manual (wizard-confirmed or learned) field ->
// column-index mapping, instead of the alias-detected column groups above.
const readManualMappedRow = (
  row: unknown[],
  mapping: Partial<Record<MappableField, number>>,
  fallbackDate: string,
  sourceFileId: string,
  createdAt: string,
  peopleMap: Map<string, SalesBySalesperson>,
  platformMap: Map<string, SalesByPlatform>
) => {
  const getText = (field: MappableField) => {
    const index = mapping[field];
    return index === undefined ? "" : String(row[index] ?? "").trim();
  };
  const getNum = (field: MappableField) => {
    const index = mapping[field];
    if (index === undefined || !hasValue(row[index])) return 0;
    // Lenient by design: a manually-mapped grid (OCR output especially) can
    // contain a stray non-numeric cell - e.g. a second table's own header
    // row transcribed as if it were data, when two tables share one column
    // layout. Treat it as 0 instead of rejecting the whole row; the
    // editable preview is exactly where the user reviews/corrects it,
    // rather than the row silently vanishing or the whole upload failing.
    try {
      return toNumber(row[index]);
    } catch {
      return 0;
    }
  };
  // If the file splits morning/evening into their own columns, use those
  // directly; otherwise treat a single Orders/Revenue pair as one unsplit
  // bucket (kept under "morning" by convention so totals still add up).
  const morningOrders = mapping.morningOrders !== undefined ? getNum("morningOrders") : getNum("orders");
  const morningRevenue = mapping.morningRevenue !== undefined ? getNum("morningRevenue") : getNum("revenue");
  const eveningOrders = mapping.eveningOrders !== undefined ? getNum("eveningOrders") : 0;
  const eveningRevenue = mapping.eveningRevenue !== undefined ? getNum("eveningRevenue") : 0;

  const name = getText("salespersonName");
  const code = getText("salespersonCode");
  // Some real reports transcribe into a single grid that stacks a
  // salespeople table and a totals/pages table sharing the same "name"
  // column position. When a code column is configured, a name without a
  // code is not a real salesperson row - it's a subtotal/grand-total/page
  // row - so treat it as page data instead rather than miscounting it as
  // a salesperson.
  const codeConfigured = mapping.salespersonCode !== undefined;
  const isPerson = Boolean(name) && (!codeConfigured || Boolean(code));

  if (isPerson) {
    const key = code || name;
    const existing =
      peopleMap.get(key) ??
      {
        id: createId(),
        reportDate: fallbackDate,
        brandName: "",
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
    existing.morningOrders += morningOrders;
    existing.morningRevenue += morningRevenue;
    existing.eveningOrders += eveningOrders;
    existing.eveningRevenue += eveningRevenue;
    existing.totalOrders = existing.morningOrders + existing.eveningOrders;
    existing.totalRevenue = existing.morningRevenue + existing.eveningRevenue;
    peopleMap.set(key, existing);
  }

  const pageName = mapping.pageName !== undefined ? getText("pageName") : !isPerson ? name : "";
  if (pageName) {
    const category = getText("platform");
    const existing =
      platformMap.get(pageName) ??
      {
        id: createId(),
        reportDate: fallbackDate,
        brandName: "",
        platformCategory: category,
        groupType: classifySalesGroup(pageName, category),
        rowType: classifySalesRowType(pageName),
        platformName: pageName,
        morningOrders: 0,
        morningRevenue: 0,
        eveningOrders: 0,
        eveningRevenue: 0,
        totalOrders: 0,
        totalRevenue: 0,
        sourceFileId,
        createdAt
      };
    existing.morningOrders += morningOrders;
    existing.morningRevenue += morningRevenue;
    existing.eveningOrders += eveningOrders;
    existing.eveningRevenue += eveningRevenue;
    existing.totalOrders = existing.morningOrders + existing.eveningOrders;
    existing.totalRevenue = existing.morningRevenue + existing.eveningRevenue;
    platformMap.set(pageName, existing);
  }
};

const applyManualMappingToMaps = (
  rows: unknown[][],
  headerRowIndex: number,
  mapping: Partial<Record<MappableField, number>>,
  fallbackDate: string,
  sourceFileId: string,
  createdAt: string,
  peopleMap: Map<string, SalesBySalesperson>,
  platformMap: Map<string, SalesByPlatform>,
  errors: string[]
) => {
  for (let rowIndex = headerRowIndex + 1; rowIndex < rows.length; rowIndex += 1) {
    const row = rows[rowIndex];
    if (isEmptyRow(row)) continue;
    try {
      readManualMappedRow(row, mapping, fallbackDate, sourceFileId, createdAt, peopleMap, platformMap);
    } catch (error) {
      errors.push(`صف ${rowIndex + 1}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
};

// Called by the UI once the user confirms the Mapping Wizard for a specific
// pending grid. Produces the same shape as the alias-detected path so the
// preview/save flow downstream doesn't need to know which path was used.
export const applyManualColumnMapping = (
  rows: unknown[][],
  headerRowIndex: number,
  mapping: Partial<Record<MappableField, number>>,
  fallbackDate: string,
  sourceFileId: string
): { people: SalesBySalesperson[]; platforms: SalesByPlatform[]; errors: string[] } => {
  const now = new Date().toISOString();
  const peopleMap = new Map<string, SalesBySalesperson>();
  const platformMap = new Map<string, SalesByPlatform>();
  const errors: string[] = [];
  applyManualMappingToMaps(rows, headerRowIndex, mapping, fallbackDate, sourceFileId, now, peopleMap, platformMap, errors);
  return {
    people: [...peopleMap.values()].sort((a, b) => b.totalRevenue - a.totalRevenue),
    platforms: [...platformMap.values()].sort((a, b) => b.totalRevenue - a.totalRevenue),
    errors
  };
};

export const parseSalesWorkbook = async (
  file: File,
  fallbackDate: string,
  sourceFileId: string,
  savedMappings: ColumnMapping[] = []
): Promise<ParsedSalesWorkbook> => {
  const workbook = XLSX.read(await file.arrayBuffer(), { type: "array", cellDates: true });
  const now = new Date().toISOString();
  const peopleMap = new Map<string, SalesBySalesperson>();
  const platformMap = new Map<string, SalesByPlatform>();
  const errors: string[] = [];
  const debug: WorkbookDebug[] = [];
  const pendingMappings: PendingColumnMapping[] = [];

  for (const sheetName of workbook.SheetNames) {
    const sheet = workbook.Sheets[sheetName];
    const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: null, raw: false });
    processGridIntoMaps(rows, sheetName, fallbackDate, sourceFileId, now, peopleMap, platformMap, errors, debug, savedMappings, pendingMappings);
  }

  return {
    people: [...peopleMap.values()].sort((a, b) => b.totalRevenue - a.totalRevenue),
    platforms: [...platformMap.values()].sort((a, b) => b.totalRevenue - a.totalRevenue),
    errors,
    debug,
    pendingMapping: pendingMappings[0]
  };
};

// Entry point for any non-spreadsheet source (OCR, future manual paste, etc.) that
// has already been reduced to a row-major grid of cell text. Runs the exact same
// column detection and validation as the Excel/CSV path.
export const parseSalesGrid = (
  rows: unknown[][],
  fallbackDate: string,
  sourceFileId: string,
  gridLabel = "ocr",
  savedMappings: ColumnMapping[] = []
): ParsedSalesWorkbook => parseSalesGrids([{ label: gridLabel, rows }], fallbackDate, sourceFileId, savedMappings);

// Multi-grid entry point: each grid is processed independently (own header
// row, own column detection/mapping), then merged - the same pattern
// parseSalesWorkbook already uses across multiple Excel sheets. Needed
// because OCR can return more than one visually distinct table per image
// (e.g. a salespeople table and a separate pages/platforms table), and
// those tables commonly have different column layouts - flattening them
// into one grid under one header row causes column misalignment.
export const parseSalesGrids = (
  grids: Array<{ label: string; rows: unknown[][] }>,
  fallbackDate: string,
  sourceFileId: string,
  savedMappings: ColumnMapping[] = []
): ParsedSalesWorkbook => {
  const now = new Date().toISOString();
  const peopleMap = new Map<string, SalesBySalesperson>();
  const platformMap = new Map<string, SalesByPlatform>();
  const errors: string[] = [];
  const debug: WorkbookDebug[] = [];
  const pendingMappings: PendingColumnMapping[] = [];

  for (const grid of grids) {
    processGridIntoMaps(grid.rows, grid.label, fallbackDate, sourceFileId, now, peopleMap, platformMap, errors, debug, savedMappings, pendingMappings);
  }

  return {
    people: [...peopleMap.values()].sort((a, b) => b.totalRevenue - a.totalRevenue),
    platforms: [...platformMap.values()].sort((a, b) => b.totalRevenue - a.totalRevenue),
    errors,
    debug,
    pendingMapping: pendingMappings[0]
  };
};

export const parseSalesImage = async (
  file: File,
  fallbackDate: string,
  sourceFileId: string,
  savedMappings: ColumnMapping[] = []
): Promise<ParsedSalesWorkbook> => {
  const extraction = await requestOcrExtraction(file, fallbackDate);
  if (extraction.warnings.length) {
    console.warn("Sales OCR warnings", extraction.providerId, extraction.warnings);
  }
  const grids = extraction.tables.map((rows, index) => ({ label: `ocr:${extraction.providerId}:${index + 1}`, rows }));
  return parseSalesGrids(grids, fallbackDate, sourceFileId, savedMappings);
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
      brandName: "",
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
      brandName: "",
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
  // text has already been through normalizeText(), which folds ة -> ه, so the
  // literals below must match the post-normalization spelling ("الصفحه").
  const text = normalizeText(`${sheetName} ${headers.join(" ")}`);
  if (/pages_sales|page_platform|platform_name|الصفحه|البلاتفورم/.test(text) && !/السيلز|salesperson/.test(text)) return "pages";
  if (/salespeople_sales|salesperson|السيلز/.test(text) && !/الصفحه|platform/.test(text)) return "people";
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

const normalizeHeader = (value: unknown) => normalizeArabicText(value);

const normalizeText = (value: string) => normalizeArabicText(value);
const hasValue = (value: unknown) => String(value ?? "").trim() !== "";
const isEmptyRow = (row: unknown[]) => row.every((cell) => !hasValue(cell));
const isUnnamed = (value: string) => /^unnamed|^__empty|^null$|^undefined$/i.test(value.trim());
const isEveningShift = (value: string) => /مسائي|evening|night|pm/i.test(value);
const isMessageResult = (value: string) => /messag|conversation|محادث|رسائل|رسالة|whatsapp/i.test(value);
const isCommentResult = (value: string) => /comment|تعليق|كومنت/i.test(value);
