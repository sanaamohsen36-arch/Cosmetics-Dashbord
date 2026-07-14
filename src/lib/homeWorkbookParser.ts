import * as XLSX from "xlsx";
import type { ShiftType } from "../types";

// Dedicated parser for the real Home_Sales_Upload_Template.xlsx - kept fully
// separate from lib/workbookParsers.ts (Cosmetics' parser), which Phase 2
// never touches.
//
// Real template shape (no Upload_Info sheet - Report Date and Shift Type
// come from the UI's date picker/selector, not from the file):
//   Salespeople_Input: header row 3 - Report_Date, Shift_Type,
//     Salesperson_Code, Salesperson_Name, Team_Type, Orders, Revenue, Notes.
//   Pages_Input: header row 3 - Report_Date, Shift_Type, Page_Name, Orders,
//     Revenue, Notes.
//   Summary: validation-only for the human filling the sheet - never parsed
//     (this module computes its own totals independently) and not required.

const REQUIRED_SHEETS = ["Salespeople_Input", "Pages_Input"];
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
  reportDate: string;
  shiftType: ShiftType;
  salespeople: HomeParsedSalespersonRow[];
  pages: HomeParsedPageRow[];
  totals: { salespeopleOrders: number; pagesOrders: number; salespeopleRevenue: number; pagesRevenue: number };
  errors: string[];
}

const cellText = (value: unknown): string => String(value ?? "").trim();
const hasValue = (value: unknown): boolean => cellText(value) !== "";

// SheetJS's cellDates conversion can land a few hours either side of
// midnight UTC (Excel's serial-date epoch handling), e.g. an intended
// 2026-07-12 cell coming through as "2026-07-11T20:59:51Z". Round to the
// nearest day instead of truncating, matching what Excel itself displays.
const excelDateToISO = (value: unknown): string => {
  if (!value) return "";
  if (value instanceof Date) {
    if (value.getUTCFullYear() < 1901) return "";
    const rounded = new Date(Math.round(value.getTime() / 86400000) * 86400000);
    return rounded.toISOString().slice(0, 10);
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
    reportDate: selectedReportDate,
    shiftType: selectedShiftType,
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

  return { reportDate: selectedReportDate, shiftType: selectedShiftType, salespeople, pages, totals, errors };
};
