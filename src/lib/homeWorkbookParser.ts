import * as XLSX from "xlsx";
import type { ShiftType } from "../types";

// Dedicated parser for the canonical Home_Sales_Upload_Template.xlsx - kept
// fully separate from lib/workbookParsers.ts (Cosmetics' parser), which is
// never touched by Phase 2.
//
// Real template shape (Upload_Info!B5/B6 blank until filled in):
//   Upload_Info: Field/Value pairs - Workspace, Report_Date, Shift_Type,
//     Upload_Key (a formula: =B4&"|"&TEXT(B5,"yyyy-mm-dd")&"|"&B6).
//   Salespeople_Input: header row 3 - Report_Date, Shift_Type,
//     Salesperson_Code, Salesperson_Name, Team_Type, Orders, Revenue, Notes.
//     Report_Date/Shift_Type per row are formulas mirroring Upload_Info -
//     still validated per row per spec, in case a row is hand-overridden.
//   Pages_Input: header row 3 - Report_Date, Shift_Type, Page_Name, Orders,
//     Revenue, Notes.
//   Summary: pure Excel-formula totals for the human filling the sheet -
//     never parsed; this module computes its own totals independently.

const REQUIRED_SHEETS = ["Upload_Info", "Salespeople_Input", "Pages_Input", "Summary"];
const SALESPEOPLE_HEADERS = ["Report_Date", "Shift_Type", "Salesperson_Code", "Salesperson_Name", "Team_Type", "Orders", "Revenue", "Notes"];
const PAGES_HEADERS = ["Report_Date", "Shift_Type", "Page_Name", "Orders", "Revenue", "Notes"];

export interface HomeParsedSalespersonRow {
  salespersonCode: string;
  salespersonName: string;
  teamType: string;
  orders: number;
  revenue: number;
  notes: string;
}

export interface HomeParsedPageRow {
  pageName: string;
  orders: number;
  revenue: number;
  notes: string;
}

export interface HomeParsedWorkbook {
  workspace: string;
  reportDate: string;
  shiftType: ShiftType | "";
  uploadKeyInFile: string;
  computedUploadKey: string;
  salespeople: HomeParsedSalespersonRow[];
  pages: HomeParsedPageRow[];
  totals: { salespeopleOrders: number; pagesOrders: number; salespeopleRevenue: number; pagesRevenue: number };
  errors: string[];
}

const cellText = (value: unknown): string => String(value ?? "").trim();
const hasValue = (value: unknown): boolean => cellText(value) !== "";

// Excel's 1900-epoch: a blank date cell driving a formula (e.g. row
// Report_Date mirroring an unset Upload_Info!Report_Date) resolves to serial
// 0, which SheetJS's cellDates surfaces as a ~1899 Date - never a real date.
const excelDateToISO = (value: unknown): string => {
  if (!value) return "";
  if (value instanceof Date) {
    if (value.getUTCFullYear() < 1901) return "";
    return value.toISOString().slice(0, 10);
  }
  const text = cellText(value);
  if (/^\d{4}-\d{2}-\d{2}/.test(text)) return text.slice(0, 10);
  return "";
};

const findHeaderRow = (rows: unknown[][], expectedHeaders: string[]): number => {
  for (let index = 0; index < rows.length; index += 1) {
    const row = (rows[index] ?? []).map((cell) => cellText(cell));
    if (expectedHeaders.every((header, column) => row[column] === header)) return index;
  }
  return -1;
};

const toNonNegativeNumber = (value: unknown, errors: string[], label: string): number | null => {
  if (!hasValue(value)) return null;
  const numeric = Number(String(value).replace(/,/g, "").trim());
  if (Number.isNaN(numeric)) {
    errors.push(`${label} has a non-numeric value: "${value}".`);
    return null;
  }
  if (numeric < 0) {
    errors.push(`${label} has a negative value: ${numeric}.`);
    return null;
  }
  return numeric;
};

const sheetRows = (workbook: XLSX.WorkBook, sheetName: string): unknown[][] =>
  XLSX.utils.sheet_to_json<unknown[]>(workbook.Sheets[sheetName], { header: 1, defval: null }) as unknown[][];

export const parseHomeSalesWorkbook = async (
  file: File,
  selectedReportDate: string,
  selectedShiftType: ShiftType
): Promise<HomeParsedWorkbook> => {
  const errors: string[] = [];
  const empty: HomeParsedWorkbook = {
    workspace: "",
    reportDate: "",
    shiftType: "",
    uploadKeyInFile: "",
    computedUploadKey: "",
    salespeople: [],
    pages: [],
    totals: { salespeopleOrders: 0, pagesOrders: 0, salespeopleRevenue: 0, pagesRevenue: 0 },
    errors
  };

  let workbook: XLSX.WorkBook;
  try {
    workbook = XLSX.read(await file.arrayBuffer(), { type: "array", cellDates: true });
  } catch {
    errors.push("Could not read this file as an Excel workbook.");
    return empty;
  }

  for (const sheetName of REQUIRED_SHEETS) {
    if (!workbook.SheetNames.includes(sheetName)) errors.push(`Missing required sheet: ${sheetName}.`);
  }
  if (errors.length) return empty;

  // Upload_Info: Field/Value pairs - looked up by field name, not position.
  const uploadInfoRows = sheetRows(workbook, "Upload_Info");
  const fieldValue = (fieldName: string): unknown => uploadInfoRows.find((row) => cellText(row[0]) === fieldName)?.[1];

  const workspace = cellText(fieldValue("Workspace")).toLowerCase();
  const reportDate = excelDateToISO(fieldValue("Report_Date"));
  const shiftTypeRaw = cellText(fieldValue("Shift_Type"));
  const shiftType: ShiftType | "" = shiftTypeRaw === "Morning" || shiftTypeRaw === "Evening" ? shiftTypeRaw : "";
  const uploadKeyInFile = cellText(fieldValue("Upload_Key"));
  const computedUploadKey = `${workspace}|${reportDate}|${shiftType}`;

  if (workspace !== "home") errors.push(`Workspace must be "home" (file has "${workspace || "empty"}").`);
  if (!reportDate) errors.push("Report_Date is missing in the file's Upload_Info sheet.");
  else if (reportDate !== selectedReportDate) errors.push(`File Report_Date (${reportDate}) does not match the selected Report Date (${selectedReportDate}).`);
  if (!shiftType) errors.push(`Shift_Type must be Morning or Evening (file has "${shiftTypeRaw || "empty"}").`);
  else if (shiftType !== selectedShiftType) errors.push(`File Shift_Type (${shiftType}) does not match the selected Shift (${selectedShiftType}).`);
  if (workspace === "home" && reportDate && shiftType && uploadKeyInFile !== computedUploadKey) {
    errors.push(`Upload_Key does not match Workspace/Report_Date/Shift_Type (file has "${uploadKeyInFile}", expected "${computedUploadKey}").`);
  }

  // Salespeople_Input
  const salespeopleRows = sheetRows(workbook, "Salespeople_Input");
  const salespeopleHeaderIndex = findHeaderRow(salespeopleRows, SALESPEOPLE_HEADERS);
  const salespeople: HomeParsedSalespersonRow[] = [];
  if (salespeopleHeaderIndex === -1) {
    errors.push("Salespeople_Input headers were not recognized.");
  } else {
    for (const row of salespeopleRows.slice(salespeopleHeaderIndex + 1)) {
      const [rowDate, rowShift, code, name, team, orders, revenue, notes] = row ?? [];
      if (!hasValue(code) && !hasValue(name) && !hasValue(orders) && !hasValue(revenue)) continue;

      const rowDateIso = excelDateToISO(rowDate);
      const rowShiftText = cellText(rowShift);
      if (rowDateIso && rowDateIso !== selectedReportDate) {
        errors.push(`Salespeople_Input row date (${rowDateIso}) does not match the selected Report Date (${selectedReportDate}).`);
        continue;
      }
      if (rowShiftText && rowShiftText !== selectedShiftType) {
        errors.push(`Salespeople_Input row shift (${rowShiftText}) does not match the selected Shift (${selectedShiftType}).`);
        continue;
      }
      const ordersNum = toNonNegativeNumber(orders, errors, "Salespeople_Input Orders");
      const revenueNum = toNonNegativeNumber(revenue, errors, "Salespeople_Input Revenue");
      if (ordersNum === null || revenueNum === null) continue;

      salespeople.push({
        salespersonCode: cellText(code),
        salespersonName: cellText(name),
        teamType: cellText(team),
        orders: ordersNum,
        revenue: revenueNum,
        notes: cellText(notes)
      });
    }
  }

  // Pages_Input
  const pagesRows = sheetRows(workbook, "Pages_Input");
  const pagesHeaderIndex = findHeaderRow(pagesRows, PAGES_HEADERS);
  const pages: HomeParsedPageRow[] = [];
  if (pagesHeaderIndex === -1) {
    errors.push("Pages_Input headers were not recognized.");
  } else {
    for (const row of pagesRows.slice(pagesHeaderIndex + 1)) {
      const [rowDate, rowShift, pageName, orders, revenue, notes] = row ?? [];
      if (!hasValue(pageName) && !hasValue(orders) && !hasValue(revenue)) continue;

      const rowDateIso = excelDateToISO(rowDate);
      const rowShiftText = cellText(rowShift);
      if (rowDateIso && rowDateIso !== selectedReportDate) {
        errors.push(`Pages_Input row date (${rowDateIso}) does not match the selected Report Date (${selectedReportDate}).`);
        continue;
      }
      if (rowShiftText && rowShiftText !== selectedShiftType) {
        errors.push(`Pages_Input row shift (${rowShiftText}) does not match the selected Shift (${selectedShiftType}).`);
        continue;
      }
      const ordersNum = toNonNegativeNumber(orders, errors, "Pages_Input Orders");
      const revenueNum = toNonNegativeNumber(revenue, errors, "Pages_Input Revenue");
      if (ordersNum === null || revenueNum === null) continue;

      pages.push({ pageName: cellText(pageName), orders: ordersNum, revenue: revenueNum, notes: cellText(notes) });
    }
  }

  if (!salespeople.length) errors.push("No valid salesperson rows found.");
  if (!pages.length) errors.push("No valid page rows found.");

  const totals = {
    salespeopleOrders: salespeople.reduce((sum, row) => sum + row.orders, 0),
    pagesOrders: pages.reduce((sum, row) => sum + row.orders, 0),
    salespeopleRevenue: salespeople.reduce((sum, row) => sum + row.revenue, 0),
    pagesRevenue: pages.reduce((sum, row) => sum + row.revenue, 0)
  };
  if (salespeople.length && pages.length) {
    if (totals.salespeopleOrders !== totals.pagesOrders) {
      errors.push(`Salespeople Orders total (${totals.salespeopleOrders}) does not equal Pages Orders total (${totals.pagesOrders}).`);
    }
    if (totals.salespeopleRevenue !== totals.pagesRevenue) {
      errors.push(`Salespeople Revenue total (${totals.salespeopleRevenue}) does not equal Pages Revenue total (${totals.pagesRevenue}).`);
    }
  }

  return { workspace, reportDate, shiftType, uploadKeyInFile, computedUploadKey, salespeople, pages, totals, errors };
};
