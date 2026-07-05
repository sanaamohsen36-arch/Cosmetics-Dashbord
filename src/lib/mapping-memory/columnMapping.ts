import type { ColumnMapping, MappableField } from "../../types";
import { normalizeArabicText } from "../normalize";

// Order the wizard presents fields in, and their display labels.
export const mappableFields: MappableField[] = [
  "salespersonName",
  "salespersonCode",
  "pageName",
  "platform",
  "orders",
  "revenue",
  "morningOrders",
  "morningRevenue",
  "eveningOrders",
  "eveningRevenue"
];

export const mappableFieldLabels: Record<MappableField, string> = {
  salespersonName: "Salesperson",
  salespersonCode: "Salesperson Code",
  pageName: "Page",
  platform: "Platform",
  orders: "Orders",
  revenue: "Revenue",
  morningOrders: "Morning Orders",
  morningRevenue: "Morning Revenue",
  eveningOrders: "Evening Orders",
  eveningRevenue: "Evening Revenue"
};

// A stable identifier for a header row's exact layout (order matters, since
// mappings are stored as column indices). Two files with the same columns
// in the same order produce the same signature regardless of minor
// whitespace/letter-form differences, thanks to normalizeArabicText.
export const computeHeaderSignature = (headers: string[]) => headers.map((header) => normalizeArabicText(header)).join("|");

export const findSavedMapping = (mappings: ColumnMapping[], headers: string[]): ColumnMapping | null => {
  const signature = computeHeaderSignature(headers);
  return mappings.find((mapping) => mapping.signature === signature) ?? null;
};
