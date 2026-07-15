import type {
  AdsPlatform,
  AdsRawFile,
  AdsRow,
  AppData,
  BrandMaster,
  ColumnMapping,
  MappableField,
  OcrPageCorrection,
  OcrSalespersonCorrection,
  PlatformMaster,
  PlatformSetting,
  SalesByPlatform,
  SalesBySalesperson,
  SalespersonMaster,
  SalesRawFile,
  UploadMode
} from "../../types";
import type { AppNotification, AuditLogEntry, BackupRun, Profile, SystemHealthStatus } from "../../types";
import { isSubtotalPlatformName } from "../metrics";
import { brandOptions } from "../constants";
import { isSupabaseConfigured, supabase } from "./client";
import { getCurrentProfile } from "../auth";
import { logAction } from "../audit";
import { reportHealth } from "../health";

// Best-effort audit/health wiring shared by every write path below. Never
// throws - a logging failure must not block the save/delete it describes.
// No-ops in local-fallback mode (getCurrentProfile returns null with no
// Supabase session) same as every other Supabase-only feature here.
const recordWrite = async (
  action: string,
  entityType: string,
  component: string,
  options?: { entityId?: string; previousValue?: unknown; newValue?: unknown }
) => {
  try {
    const profile = await getCurrentProfile();
    await logAction(profile?.id ?? null, profile?.role ?? null, action, entityType, options);
    await reportHealth(component, "ok");
  } catch (error) {
    await reportHealth(component, "down", error instanceof Error ? error.message : String(error)).catch(() => undefined);
  }
};

const STORAGE_KEY = "daily-report-dashboard-v1";

const defaultPlatforms = [
  "ريجينكس",
  "ريجينكس eg",
  "واتس اب ريجينكس",
  "واتساب ريجينكس",
  "واتساب نيو",
  "واتساب تيك توك",
  "Website CELIXI",
  "انستجرام",
  "Instagram",
  "تليفون إعلان",
  "TV Ad",
  "تيم المتابعة",
  "Follow-up Team",
  "Follow-up",
  "المتابعة"
];

export const createId = () => crypto.randomUUID?.() ?? `${Date.now()}-${Math.random()}`;

export const emptyData = (): AppData => ({
  salesRawFiles: [],
  salesBySalesperson: [],
  salesByPlatform: [],
  adsRawFiles: [],
  metaAds: [],
  tiktokAds: [],
  platformSettings: defaultPlatforms.map((platformName) => ({
    id: createId(),
    platformName,
    isActive: true,
    createdAt: new Date().toISOString()
  })),
  ocrPageCorrections: [],
  ocrSalespersonCorrections: [],
  salespeople: [],
  platforms: defaultPlatforms.map((name) => ({
    id: createId(),
    name,
    aliases: [name],
    active: true
  })),
  columnMappings: [],
  brands: brandOptions.map((name) => ({ id: createId(), name, active: true })),
  profiles: [],
  auditLog: [],
  backupRuns: [],
  systemHealth: [],
  notifications: []
});

export const getStorageMode = () => (isSupabaseConfigured ? "Supabase" : "Local fallback");

const mergeDefaultPlatforms = (settings: PlatformSetting[] = []) => {
  const filteredSettings = settings.filter((item) => !isSubtotalPlatformName(item.platformName));
  const seen = new Set(filteredSettings.map((item) => item.platformName.trim().toLowerCase()));
  const missing = defaultPlatforms
    .filter((platformName) => !seen.has(platformName.trim().toLowerCase()))
    .map((platformName) => ({
      id: createId(),
      platformName,
      isActive: true,
      createdAt: new Date().toISOString()
    }));
  return [...filteredSettings, ...missing];
};

const mergeDefaultPlatformMasters = (platforms: PlatformMaster[] = []) => {
  const seen = new Set(platforms.map((item) => item.name.trim().toLowerCase()));
  const missing = defaultPlatforms
    .filter((name) => !seen.has(name.trim().toLowerCase()))
    .map((name) => ({
      id: createId(),
      name,
      aliases: [name],
      active: true
    }));
  return [...platforms, ...missing];
};

const mergeDefaultBrands = (brands: BrandMaster[] = []) => {
  const seen = new Set(brands.map((item) => item.name.trim().toLowerCase()));
  const missing = brandOptions
    .filter((name) => !seen.has(name.trim().toLowerCase()))
    .map((name) => ({ id: createId(), name, active: true }));
  return [...brands, ...missing];
};

export const loadData = async (): Promise<AppData> => {
  if (!supabase) return loadLocalData();

  await ensureDefaultPlatforms();
  const [
    salesRawFiles,
    salesBySalesperson,
    salesByPlatform,
    adsRawFiles,
    metaAds,
    tiktokAds,
    platformSettings,
    ocrPageCorrections,
    ocrSalespersonCorrections,
    salespeople,
    platforms,
    brands,
    columnMappings,
    profiles,
    auditLog,
    backupRuns,
    systemHealth,
    notifications
  ] = await Promise.all([
    selectAll("sales_raw_files"),
    selectAll("sales_by_salesperson"),
    selectAll("sales_by_platform"),
    selectAll("ads_raw_files"),
    selectAll("meta_ads"),
    selectAll("tiktok_ads"),
    selectAll("platform_settings"),
    selectOptionalAll("ocr_page_corrections"),
    selectOptionalAll("ocr_salesperson_corrections"),
    selectOptionalAll("salespeople"),
    selectOptionalAll("platforms"),
    selectOptionalAll("brands"),
    selectOptionalAll("column_mappings"),
    selectOptionalAll("profiles"),
    selectOptionalAll("audit_log"),
    selectOptionalAll("backup_runs"),
    selectOptionalAll("system_health_status"),
    selectOptionalAll("notifications")
  ]);

  // Section 15: only current file versions and the rows tied to them are
  // loaded into the app's working data - superseded versions stay in the
  // database (inspectable, purge-only) but are never double-counted in
  // aggregation/reporting.
  const currentSalesFileIds = new Set(salesRawFiles.filter((row) => row.is_current !== false).map((row) => row.id));
  const currentAdsFileIds = new Set(adsRawFiles.filter((row) => row.is_current !== false).map((row) => row.id));

  return {
    salesRawFiles: salesRawFiles.filter((row) => row.is_current !== false).map(fromSalesRawFile),
    salesBySalesperson: salesBySalesperson.filter((row) => currentSalesFileIds.has(row.source_file_id)).map(fromSalesperson),
    salesByPlatform: salesByPlatform.filter((row) => currentSalesFileIds.has(row.source_file_id)).map(fromPlatformSales),
    adsRawFiles: adsRawFiles.filter((row) => row.is_current !== false).map(fromAdsRawFile),
    metaAds: metaAds.filter((row) => currentAdsFileIds.has(row.source_file_id)).map((row) => fromAdsRow(row, "Meta")),
    tiktokAds: tiktokAds.filter((row) => currentAdsFileIds.has(row.source_file_id)).map((row) => fromAdsRow(row, "TikTok")),
    platformSettings: mergeDefaultPlatforms(platformSettings.map(fromPlatformSetting)),
    ocrPageCorrections: ocrPageCorrections.map(fromOcrPageCorrection),
    ocrSalespersonCorrections: ocrSalespersonCorrections.map(fromOcrSalespersonCorrection),
    salespeople: salespeople.map(fromSalespersonMaster),
    platforms: mergeDefaultPlatformMasters(platforms.map(fromPlatformMaster)),
    brands: mergeDefaultBrands(brands.map(fromBrandMaster)),
    columnMappings: columnMappings.map(fromColumnMapping),
    profiles: profiles.map(fromProfileRow),
    auditLog: auditLog.map(fromAuditLogRow),
    backupRuns: backupRuns.map(fromBackupRunRow),
    systemHealth: systemHealth.map(fromSystemHealthRow),
    notifications: notifications.map(fromNotificationRow)
  };
};

export const saveData = async (data: AppData) => {
  if (!supabase) {
    saveLocalData(data);
    return;
  }

  await deleteAllTables();
  await insertRows("platform_settings", data.platformSettings.map(toPlatformSettingRow));
  await insertRows("sales_raw_files", data.salesRawFiles.map(toSalesRawFileRow));
  await insertRows("sales_by_salesperson", data.salesBySalesperson.map(toSalespersonRow));
  await insertRows("sales_by_platform", data.salesByPlatform.map(toPlatformSalesRow));
  await insertRows("ads_raw_files", data.adsRawFiles.map(toAdsRawFileRow));
  await insertRows("meta_ads", data.metaAds.map(toMetaAdsRow));
  await insertRows("tiktok_ads", data.tiktokAds.map(toTikTokAdsRow));
  await insertOptionalRows("ocr_page_corrections", data.ocrPageCorrections.map(toOcrPageCorrectionRow));
  await insertOptionalRows("ocr_salesperson_corrections", data.ocrSalespersonCorrections.map(toOcrSalespersonCorrectionRow));
  await insertOptionalRows("salespeople", data.salespeople.map(toSalespersonMasterRow));
  await insertOptionalRows("platforms", data.platforms.map(toPlatformMasterRow));
  await insertOptionalRows("brands", data.brands.map(toBrandMasterRow));
  await insertOptionalRows("column_mappings", data.columnMappings.map(toColumnMappingRow));
  await refreshDailySummary(data);
};

// Additive-only persistence for salesperson/platform names newly discovered while
// parsing an upload. Unlike saveData(), this never touches unrelated tables, so it
// is safe to call after a targeted upload/delete without risking other users' data.
export const saveMasterDataAdditions = async (
  newPlatformSettings: PlatformSetting[],
  newSalespeople: SalespersonMaster[],
  newPlatforms: PlatformMaster[],
  newBrands: BrandMaster[] = []
) => {
  if (!supabase) return;
  await insertRows("platform_settings", newPlatformSettings.map(toPlatformSettingRow));
  await insertOptionalRows("salespeople", newSalespeople.map(toSalespersonMasterRow));
  await insertOptionalRows("platforms", newPlatforms.map(toPlatformMasterRow));
  await insertOptionalRows("brands", newBrands.map(toBrandMasterRow));
};

// Mapping memory: remembers a user's manual correction of a parsed
// salesperson/page name so future uploads apply it automatically instead of
// asking the user to fix the same OCR/typo mistake every time. Repeated
// corrections of the same wrong value bump usage_count on the existing row
// instead of inserting a duplicate - additive/targeted only, no full-table
// writes.
export const recordSalespersonCorrection = async (
  data: AppData,
  wrongValue: string,
  correctValue: string,
  salespersonCode: string
): Promise<AppData> => {
  const existing = data.ocrSalespersonCorrections.find(
    (item) => item.wrongValue === wrongValue && item.salespersonCode === salespersonCode
  );
  const now = new Date().toISOString();

  if (existing) {
    const updated: OcrSalespersonCorrection = { ...existing, correctValue, usageCount: existing.usageCount + 1 };
    const next = {
      ...data,
      ocrSalespersonCorrections: data.ocrSalespersonCorrections.map((item) => (item.id === existing.id ? updated : item))
    };
    if (!supabase) {
      saveLocalData(next);
      return next;
    }
    const { error } = await supabase
      .from("ocr_salesperson_corrections")
      .update({ correct_value: updated.correctValue, usage_count: updated.usageCount })
      .eq("id", existing.id);
    if (error && !isMissingTableError(error)) throw error;
    return next;
  }

  const created: OcrSalespersonCorrection = {
    id: createId(),
    wrongValue,
    correctValue,
    salespersonCode,
    createdAt: now,
    usageCount: 1
  };
  const next = { ...data, ocrSalespersonCorrections: [...data.ocrSalespersonCorrections, created] };
  if (!supabase) {
    saveLocalData(next);
    return next;
  }
  await insertOptionalRows("ocr_salesperson_corrections", [toOcrSalespersonCorrectionRow(created)]);
  return next;
};

export const recordPageCorrection = async (data: AppData, wrongValue: string, correctValue: string): Promise<AppData> => {
  const existing = data.ocrPageCorrections.find((item) => item.wrongValue === wrongValue);
  const now = new Date().toISOString();

  if (existing) {
    const updated: OcrPageCorrection = { ...existing, correctValue, usageCount: existing.usageCount + 1 };
    const next = {
      ...data,
      ocrPageCorrections: data.ocrPageCorrections.map((item) => (item.id === existing.id ? updated : item))
    };
    if (!supabase) {
      saveLocalData(next);
      return next;
    }
    const { error } = await supabase
      .from("ocr_page_corrections")
      .update({ correct_value: updated.correctValue, usage_count: updated.usageCount })
      .eq("id", existing.id);
    if (error && !isMissingTableError(error)) throw error;
    return next;
  }

  const created: OcrPageCorrection = { id: createId(), wrongValue, correctValue, createdAt: now, usageCount: 1 };
  const next = { ...data, ocrPageCorrections: [...data.ocrPageCorrections, created] };
  if (!supabase) {
    saveLocalData(next);
    return next;
  }
  await insertOptionalRows("ocr_page_corrections", [toOcrPageCorrectionRow(created)]);
  return next;
};

// Column-mapping wizard memory: remembers a user-confirmed column layout
// (keyed by header signature) so the same file structure is recognized
// automatically next time instead of asking again. Additive/targeted only,
// same pattern as the OCR corrections above.
export const recordColumnMapping = async (
  data: AppData,
  signature: string,
  fields: Partial<Record<MappableField, number>>,
  sheetLabel: string
): Promise<AppData> => {
  const existing = data.columnMappings.find((item) => item.signature === signature);
  const now = new Date().toISOString();

  if (existing) {
    const updated: ColumnMapping = { ...existing, fields, usageCount: existing.usageCount + 1 };
    const next = {
      ...data,
      columnMappings: data.columnMappings.map((item) => (item.id === existing.id ? updated : item))
    };
    if (!supabase) {
      saveLocalData(next);
      return next;
    }
    const { error } = await supabase
      .from("column_mappings")
      .update({ mapping: updated.fields, usage_count: updated.usageCount })
      .eq("id", existing.id);
    if (error && !isMissingTableError(error)) throw error;
    return next;
  }

  const created: ColumnMapping = { id: createId(), signature, fields, sheetLabel, createdAt: now, usageCount: 1 };
  const next = { ...data, columnMappings: [...data.columnMappings, created] };
  if (!supabase) {
    saveLocalData(next);
    return next;
  }
  await insertOptionalRows("column_mappings", [toColumnMappingRow(created)]);
  return next;
};

export const subscribeToDataChanges = (onChange: () => void) => {
  if (!supabase) return () => undefined;

  const activeSupabase = supabase;

  const channelName = `dashboard-db-changes-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const channel = activeSupabase
    .channel(channelName)
    .on("postgres_changes", { event: "*", schema: "public", table: "sales_raw_files" }, onChange)
    .on("postgres_changes", { event: "*", schema: "public", table: "sales_by_salesperson" }, onChange)
    .on("postgres_changes", { event: "*", schema: "public", table: "sales_by_platform" }, onChange)
    .on("postgres_changes", { event: "*", schema: "public", table: "ads_raw_files" }, onChange)
    .on("postgres_changes", { event: "*", schema: "public", table: "meta_ads" }, onChange)
    .on("postgres_changes", { event: "*", schema: "public", table: "tiktok_ads" }, onChange)
    .on("postgres_changes", { event: "*", schema: "public", table: "platform_settings" }, onChange)
    .on("postgres_changes", { event: "*", schema: "public", table: "ocr_page_corrections" }, onChange)
    .on("postgres_changes", { event: "*", schema: "public", table: "ocr_salesperson_corrections" }, onChange)
    .on("postgres_changes", { event: "*", schema: "public", table: "salespeople" }, onChange)
    .on("postgres_changes", { event: "*", schema: "public", table: "platforms" }, onChange)
    .on("postgres_changes", { event: "*", schema: "public", table: "brands" }, onChange)
    .on("postgres_changes", { event: "*", schema: "public", table: "column_mappings" }, onChange)
    .subscribe();

  return () => {
    void activeSupabase.removeChannel(channel);
  };
};

const loadLocalData = (): AppData => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return emptyData();
    const parsed = JSON.parse(raw) as AppData;
    return {
      ...emptyData(),
      ...parsed,
      salesRawFiles: (parsed.salesRawFiles ?? []).map((file) => ({ ...file, brandName: file.brandName || "غير محدد" })),
      salesBySalesperson: (parsed.salesBySalesperson ?? []).map((row) => ({ ...row, brandName: row.brandName || "غير محدد" })),
      salesByPlatform: (parsed.salesByPlatform ?? []).map((row) => ({ ...row, brandName: row.brandName || "غير محدد" })),
      adsRawFiles: (parsed.adsRawFiles ?? []).map((file) => ({
        ...file,
        salesPlatformName: file.salesPlatformName || "غير محدد",
        adAccountName: file.adAccountName || "غير محدد"
      })),
      metaAds: (parsed.metaAds ?? []).map(withAdsDefaults),
      tiktokAds: (parsed.tiktokAds ?? []).map(withAdsDefaults),
      platformSettings: mergeDefaultPlatforms(
        parsed.platformSettings?.length ? parsed.platformSettings : emptyData().platformSettings
      ),
      ocrPageCorrections: parsed.ocrPageCorrections ?? [],
      ocrSalespersonCorrections: parsed.ocrSalespersonCorrections ?? [],
      salespeople: parsed.salespeople ?? [],
      platforms: mergeDefaultPlatformMasters(parsed.platforms ?? []),
      brands: mergeDefaultBrands(parsed.brands ?? []),
      columnMappings: parsed.columnMappings ?? [],
      profiles: parsed.profiles ?? [],
      auditLog: parsed.auditLog ?? [],
      backupRuns: parsed.backupRuns ?? [],
      systemHealth: parsed.systemHealth ?? [],
      notifications: parsed.notifications ?? []
    };
  } catch {
    return emptyData();
  }
};

const saveLocalData = (data: AppData) => {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  window.dispatchEvent(new CustomEvent("dashboard-data-updated"));
};

const withAdsDefaults = (row: AdsRow): AdsRow => ({
  ...row,
  salesPlatformName: row.salesPlatformName || "غير محدد",
  adAccountName: row.adAccountName || "غير محدد",
  messagesCount: Number(row.messagesCount) || 0,
  commentsCount: Number(row.commentsCount) || 0
});

const selectAll = async (table: string) => {
  if (!supabase) return [];
  const { data, error } = await supabase.from(table).select("*");
  if (error) throw error;
  return data ?? [];
};

const isMissingTableError = (error: unknown) =>
  Boolean(
    error &&
      typeof error === "object" &&
      "message" in error &&
      /does not exist|schema cache|Could not find the table/i.test(String((error as { message?: string }).message))
  );

const selectOptionalAll = async (table: string) => {
  if (!supabase) return [];
  const { data, error } = await supabase.from(table).select("*");
  if (error) {
    if (isMissingTableError(error)) return [];
    throw error;
  }
  return data ?? [];
};

const insertRows = async (table: string, rows: Record<string, unknown>[]) => {
  if (!supabase || rows.length === 0) return;
  const { error } = await supabase.from(table).insert(rows);
  if (error) throw error;
};

const insertOptionalRows = async (table: string, rows: Record<string, unknown>[]) => {
  if (!supabase || rows.length === 0) return;
  const { error } = await supabase.from(table).insert(rows);
  if (error && !isMissingTableError(error)) throw error;
};

const deleteWhere = async (table: string, filters: (query: any) => any) => {
  if (!supabase) return;
  const { error } = await filters(supabase.from(table).delete());
  if (error) throw error;
};

const deleteAll = async (table: string) => {
  if (!supabase) return;
  const { error } = await supabase.from(table).delete().not("id", "is", null);
  if (error) throw error;
};

const deleteOptionalAll = async (table: string) => {
  if (!supabase) return;
  const { error } = await supabase.from(table).delete().not("id", "is", null);
  if (error && !isMissingTableError(error)) throw error;
};

const deleteAllTables = async () => {
  await deleteAll("daily_summary");
  await deleteAll("meta_ads");
  await deleteAll("tiktok_ads");
  await deleteAll("ads_raw_files");
  await deleteAll("sales_by_platform");
  await deleteAll("sales_by_salesperson");
  await deleteAll("sales_raw_files");
  await deleteAll("platform_settings");
  await deleteOptionalAll("ocr_page_corrections");
  await deleteOptionalAll("ocr_salesperson_corrections");
  await deleteOptionalAll("salespeople");
  await deleteOptionalAll("platforms");
  await deleteOptionalAll("brands");
  await deleteOptionalAll("column_mappings");
};

const refreshDailySummary = async (data: AppData) => {
  if (!supabase) return;
  await deleteAll("daily_summary");
  const dates = new Set([
    ...data.salesBySalesperson.map((row) => row.reportDate),
    ...data.metaAds.map((row) => row.reportDate),
    ...data.tiktokAds.map((row) => row.reportDate)
  ]);
  const now = new Date().toISOString();
  const rows = [...dates].map((reportDate) => {
    const people = data.salesBySalesperson.filter((row) => row.reportDate === reportDate);
    const metaRows = data.metaAds.filter((row) => row.reportDate === reportDate);
    const tiktokRows = data.tiktokAds.filter((row) => row.reportDate === reportDate);
    const totalSalesRevenue = people.reduce((total, row) => total + row.totalRevenue, 0);
    const totalOrders = people.reduce((total, row) => total + row.totalOrders, 0);
    const metaSpend = metaRows.reduce((total, row) => total + row.spend, 0);
    const tiktokSpend = tiktokRows.reduce((total, row) => total + row.spend, 0);
    const totalAdsSpend = metaSpend + tiktokSpend;
    return {
      id: `summary-${reportDate}`,
      report_date: reportDate,
      total_sales_revenue: totalSalesRevenue,
      total_orders: totalOrders,
      total_ads_spend: totalAdsSpend,
      meta_spend: metaSpend,
      tiktok_spend: tiktokSpend,
      roas: totalAdsSpend ? totalSalesRevenue / totalAdsSpend : null,
      roi: totalAdsSpend ? ((totalSalesRevenue - totalAdsSpend) / totalAdsSpend) * 100 : null,
      cpa: totalOrders ? totalAdsSpend / totalOrders : null,
      average_order_value: totalOrders ? totalSalesRevenue / totalOrders : null,
      spend_to_sales_ratio: totalSalesRevenue ? (totalAdsSpend / totalSalesRevenue) * 100 : null,
      created_at: now,
      updated_at: now
    };
  });
  await insertRows("daily_summary", rows);
};

const ensureDefaultPlatforms = async () => {
  if (!supabase) return;
  const { data, error } = await supabase.from("platform_settings").select("*");
  if (error) throw error;
  const existing = mergeDefaultPlatforms((data ?? []).map(fromPlatformSetting));
  const missing = existing.filter((item) => !(data ?? []).some((row) => row.platform_name === item.platformName));
  await insertRows("platform_settings", missing.map(toPlatformSettingRow));
};

// Section 15 (File Versioning): "replace" no longer deletes anything. The
// previous current file (and its rows) stays in the database, marked
// superseded; the new upload is inserted as the next version. Aggregation
// (loadData below) only ever reads is_current rows, so superseded versions
// are never double-counted, but they remain inspectable.
export const saveSalesUpload = async (
  current: AppData,
  rawFile: SalesRawFile,
  people: SalesBySalesperson[],
  platforms: SalesByPlatform[],
  mode: UploadMode
): Promise<AppData> => {
  if (mode === "cancel") return current;
  // One Sales file per date, covering every Brand together - a day is one
  // versioned slot (Brand is no longer part of the key).
  const matchesSlot = (file: SalesRawFile) => file.reportDate === rawFile.reportDate;
  const previousFile = current.salesRawFiles.find((file) => matchesSlot(file) && file.isCurrent);
  const versionedFile: SalesRawFile = {
    ...rawFile,
    version: mode === "replace" && previousFile ? previousFile.version + 1 : 1,
    isCurrent: true
  };

  const withoutCurrent =
    mode === "replace"
      ? {
          ...current,
          salesRawFiles: current.salesRawFiles.map((file) =>
            matchesSlot(file) && file.isCurrent
              ? { ...file, isCurrent: false, supersededAt: rawFile.createdAt, supersededBy: versionedFile.id }
              : file
          ),
          salesBySalesperson: current.salesBySalesperson.filter((row) => row.reportDate !== rawFile.reportDate),
          salesByPlatform: current.salesByPlatform.filter((row) => row.reportDate !== rawFile.reportDate)
        }
      : current;

  const next = {
    ...withoutCurrent,
    salesRawFiles: [...withoutCurrent.salesRawFiles, versionedFile],
    salesBySalesperson: [...withoutCurrent.salesBySalesperson, ...people],
    salesByPlatform: [...withoutCurrent.salesByPlatform, ...platforms]
  };

  if (!supabase) {
    saveLocalData(next);
    return next;
  }

  if (mode === "replace" && previousFile) {
    await supersedeSalesRawFile(previousFile.id, versionedFile.id);
  }
  await insertRows("sales_raw_files", [toSalesRawFileRow(versionedFile)]);
  await insertRows("sales_by_salesperson", people.map(toSalespersonRow));
  await insertRows("sales_by_platform", platforms.map(toPlatformSalesRow));
  await recordWrite(mode, "sales_raw_file", "sales_upload", {
    entityId: versionedFile.id,
    previousValue: previousFile?.id,
    newValue: { fileName: versionedFile.fileName, reportDate: versionedFile.reportDate, version: versionedFile.version }
  });
  return next;
};

export const saveAdsUpload = async (
  current: AppData,
  rawFile: AdsRawFile,
  rows: AdsRow[],
  platform: AdsPlatform,
  mode: UploadMode
): Promise<AppData> => {
  if (mode === "cancel") return current;
  const tableKey = platform === "Meta" ? "metaAds" : "tiktokAds";
  const matchesSlot = (file: AdsRawFile) =>
    file.reportDate === rawFile.reportDate &&
    file.adsPlatform === platform &&
    file.salesPlatformName === rawFile.salesPlatformName &&
    (file.adAccountName || "غير محدد") === (rawFile.adAccountName || "غير محدد");
  const previousFile = current.adsRawFiles.find((file) => matchesSlot(file) && file.isCurrent);
  const versionedFile: AdsRawFile = {
    ...rawFile,
    version: mode === "replace" && previousFile ? previousFile.version + 1 : 1,
    isCurrent: true
  };

  const withoutCurrent =
    mode === "replace"
      ? {
          ...current,
          adsRawFiles: current.adsRawFiles.map((file) =>
            matchesSlot(file) && file.isCurrent
              ? { ...file, isCurrent: false, supersededAt: rawFile.createdAt, supersededBy: versionedFile.id }
              : file
          ),
          [tableKey]: current[tableKey].filter(
            (row) =>
              !(
                row.reportDate === rawFile.reportDate &&
                row.salesPlatformName === rawFile.salesPlatformName &&
                (row.adAccountName || "غير محدد") === (rawFile.adAccountName || "غير محدد")
              )
          )
        }
      : current;

  const next = {
    ...withoutCurrent,
    adsRawFiles: [...withoutCurrent.adsRawFiles, versionedFile],
    [tableKey]: [...withoutCurrent[tableKey], ...rows]
  };

  if (!supabase) {
    saveLocalData(next);
    return next;
  }

  if (mode === "replace" && previousFile) {
    await supersedeAdsRawFile(previousFile.id, versionedFile.id);
  }
  await insertRows("ads_raw_files", [toAdsRawFileRow(versionedFile)]);

  if (platform === "Meta") {
    await insertRows("meta_ads", rows.map(toMetaAdsRow));
  } else {
    await insertRows("tiktok_ads", rows.map(toTikTokAdsRow));
  }

  await recordWrite(mode, "ads_raw_file", "ads_upload", {
    entityId: versionedFile.id,
    previousValue: previousFile?.id,
    newValue: { fileName: versionedFile.fileName, reportDate: versionedFile.reportDate, version: versionedFile.version }
  });
  return next;
};

export const deleteDataForDate = async (current: AppData, reportDate: string): Promise<AppData> => {
  const next = removeDataForDate(current, reportDate);
  if (!supabase) {
    saveLocalData(next);
    return next;
  }

  await deleteWhere("meta_ads", (query) => query.eq("report_date", reportDate));
  await deleteWhere("tiktok_ads", (query) => query.eq("report_date", reportDate));
  await deleteWhere("ads_raw_files", (query) => query.eq("report_date", reportDate));
  await deleteWhere("sales_by_platform", (query) => query.eq("report_date", reportDate));
  await deleteWhere("sales_by_salesperson", (query) => query.eq("report_date", reportDate));
  await deleteWhere("sales_raw_files", (query) => query.eq("report_date", reportDate));
  await deleteWhere("daily_summary", (query) => query.eq("report_date", reportDate));
  await recordWrite("delete", "day", "sales_upload", { newValue: { reportDate } });
  return next;
};

export const deleteSalesForDate = async (current: AppData, reportDate: string): Promise<AppData> => {
  const next = {
    ...current,
    salesRawFiles: current.salesRawFiles.filter((file) => file.reportDate !== reportDate),
    salesBySalesperson: current.salesBySalesperson.filter((row) => row.reportDate !== reportDate),
    salesByPlatform: current.salesByPlatform.filter((row) => row.reportDate !== reportDate)
  };
  if (!supabase) {
    saveLocalData(next);
    return next;
  }
  await deleteWhere("sales_by_platform", (query) => query.eq("report_date", reportDate));
  await deleteWhere("sales_by_salesperson", (query) => query.eq("report_date", reportDate));
  await deleteWhere("sales_raw_files", (query) => query.eq("report_date", reportDate));
  await deleteWhere("daily_summary", (query) => query.eq("report_date", reportDate));
  await recordWrite("delete", "sales_raw_file", "sales_upload", { newValue: { reportDate } });
  return next;
};

export const deleteAdsForDate = async (current: AppData, reportDate: string, platform: AdsPlatform): Promise<AppData> => {
  const tableKey = platform === "Meta" ? "metaAds" : "tiktokAds";
  const next = {
    ...current,
    adsRawFiles: current.adsRawFiles.filter((file) => !(file.reportDate === reportDate && file.adsPlatform === platform)),
    [tableKey]: current[tableKey].filter((row) => row.reportDate !== reportDate)
  };
  if (!supabase) {
    saveLocalData(next);
    return next;
  }
  await deleteWhere("ads_raw_files", (query) => query.eq("report_date", reportDate).eq("ads_platform", platform));
  await deleteWhere(platform === "Meta" ? "meta_ads" : "tiktok_ads", (query) => query.eq("report_date", reportDate));
  await deleteWhere("daily_summary", (query) => query.eq("report_date", reportDate));
  await recordWrite("delete", "ads_raw_file", "ads_upload", { newValue: { reportDate, platform } });
  return next;
};

export const deleteRawFile = async (current: AppData, rawFileId: string): Promise<AppData> => {
  const salesFile = current.salesRawFiles.find((file) => file.id === rawFileId);
  const adsFile = current.adsRawFiles.find((file) => file.id === rawFileId);
  const next = {
    ...current,
    salesRawFiles: current.salesRawFiles.filter((file) => file.id !== rawFileId),
    salesBySalesperson: current.salesBySalesperson.filter((row) => row.sourceFileId !== rawFileId),
    salesByPlatform: current.salesByPlatform.filter((row) => row.sourceFileId !== rawFileId),
    adsRawFiles: current.adsRawFiles.filter((file) => file.id !== rawFileId),
    metaAds: current.metaAds.filter((row) => row.sourceFileId !== rawFileId),
    tiktokAds: current.tiktokAds.filter((row) => row.sourceFileId !== rawFileId)
  };
  if (!supabase) {
    saveLocalData(next);
    return next;
  }
  if (salesFile) {
    await deleteWhere("sales_raw_files", (query) => query.eq("id", rawFileId));
    await deleteWhere("sales_by_salesperson", (query) => query.eq("source_file_id", rawFileId));
    await deleteWhere("sales_by_platform", (query) => query.eq("source_file_id", rawFileId));
    await deleteWhere("daily_summary", (query) => query.eq("report_date", salesFile.reportDate));
  }
  if (adsFile) {
    await deleteWhere("ads_raw_files", (query) => query.eq("id", rawFileId));
    await deleteWhere(adsFile.adsPlatform === "Meta" ? "meta_ads" : "tiktok_ads", (query) => query.eq("source_file_id", rawFileId));
    await deleteWhere("daily_summary", (query) => query.eq("report_date", adsFile.reportDate));
  }
  const entityType = salesFile ? "sales_raw_file" : "ads_raw_file";
  const component = salesFile ? "sales_upload" : "ads_upload";
  await recordWrite("delete", entityType, component, {
    entityId: rawFileId,
    newValue: { fileName: (salesFile ?? adsFile)?.fileName }
  });
  return next;
};

const removeDataForDate = (current: AppData, reportDate: string): AppData => ({
  ...current,
  salesRawFiles: current.salesRawFiles.filter((file) => file.reportDate !== reportDate),
  salesBySalesperson: current.salesBySalesperson.filter((row) => row.reportDate !== reportDate),
  salesByPlatform: current.salesByPlatform.filter((row) => row.reportDate !== reportDate),
  adsRawFiles: current.adsRawFiles.filter((file) => file.reportDate !== reportDate),
  metaAds: current.metaAds.filter((row) => row.reportDate !== reportDate),
  tiktokAds: current.tiktokAds.filter((row) => row.reportDate !== reportDate)
});

const fromSalesRawFile = (row: any): SalesRawFile => ({
  id: row.id,
  fileName: row.file_name,
  filePath: row.file_url,
  uploadedAt: row.uploaded_at,
  reportDate: row.report_date,
  brandName: row.brand_name || "غير محدد",
  ocrStatus: row.ocr_status,
  createdAt: row.created_at,
  version: Number(row.version) || 1,
  isCurrent: row.is_current === undefined ? true : Boolean(row.is_current),
  supersededAt: row.superseded_at ?? null,
  supersededBy: row.superseded_by ?? null
});

const toSalesRawFileRow = (row: SalesRawFile) => ({
  id: row.id,
  file_name: row.fileName,
  file_url: row.filePath,
  uploaded_at: row.uploadedAt,
  report_date: row.reportDate,
  brand_name: row.brandName,
  ocr_status: row.ocrStatus,
  created_at: row.createdAt,
  version: row.version,
  is_current: row.isCurrent,
  superseded_at: row.supersededAt ?? null,
  superseded_by: row.supersededBy ?? null
});

const fromSalesperson = (row: any): SalesBySalesperson => ({
  id: row.id,
  reportDate: row.report_date,
  brandName: row.brand_name || "غير محدد",
  salespersonName: row.salesperson_name,
  salespersonCode: row.salesperson_code,
  morningOrders: Number(row.morning_orders) || 0,
  morningRevenue: Number(row.morning_revenue) || 0,
  eveningOrders: Number(row.evening_orders) || 0,
  eveningRevenue: Number(row.evening_revenue) || 0,
  totalOrders: Number(row.total_orders) || 0,
  totalRevenue: Number(row.total_revenue) || 0,
  sourceFileId: row.source_file_id,
  createdAt: row.created_at
});

const toSalespersonRow = (row: SalesBySalesperson) => ({
  id: row.id,
  report_date: row.reportDate,
  brand_name: row.brandName,
  salesperson_name: row.salespersonName,
  salesperson_code: row.salespersonCode,
  morning_orders: row.morningOrders,
  morning_revenue: row.morningRevenue,
  evening_orders: row.eveningOrders,
  evening_revenue: row.eveningRevenue,
  total_orders: row.totalOrders,
  total_revenue: row.totalRevenue,
  source_file_id: row.sourceFileId,
  created_at: row.createdAt
});

const fromPlatformSales = (row: any): SalesByPlatform => ({
  id: row.id,
  reportDate: row.report_date,
  brandName: row.brand_name || "غير محدد",
  platformName: row.platform_name,
  morningOrders: Number(row.morning_orders) || 0,
  morningRevenue: Number(row.morning_revenue) || 0,
  eveningOrders: Number(row.evening_orders) || 0,
  eveningRevenue: Number(row.evening_revenue) || 0,
  totalOrders: Number(row.total_orders) || 0,
  totalRevenue: Number(row.total_revenue) || 0,
  sourceFileId: row.source_file_id,
  createdAt: row.created_at
});

const toPlatformSalesRow = (row: SalesByPlatform) => ({
  id: row.id,
  report_date: row.reportDate,
  brand_name: row.brandName,
  platform_name: row.platformName,
  morning_orders: row.morningOrders,
  morning_revenue: row.morningRevenue,
  evening_orders: row.eveningOrders,
  evening_revenue: row.eveningRevenue,
  total_orders: row.totalOrders,
  total_revenue: row.totalRevenue,
  source_file_id: row.sourceFileId,
  created_at: row.createdAt
});

const fromAdsRawFile = (row: any): AdsRawFile => ({
  id: row.id,
  fileName: row.file_name,
  filePath: row.file_url,
  uploadedAt: row.uploaded_at,
  reportDate: row.report_date,
  adsPlatform: row.ads_platform,
  salesPlatformName: row.sales_platform_name || "غير محدد",
  adAccountName: row.ad_account_name || "غير محدد",
  parsingStatus: row.parsing_status,
  createdAt: row.created_at,
  version: Number(row.version) || 1,
  isCurrent: row.is_current === undefined ? true : Boolean(row.is_current),
  supersededAt: row.superseded_at ?? null,
  supersededBy: row.superseded_by ?? null
});

const toAdsRawFileRow = (row: AdsRawFile) => ({
  id: row.id,
  file_name: row.fileName,
  file_url: row.filePath,
  uploaded_at: row.uploadedAt,
  report_date: row.reportDate,
  ads_platform: row.adsPlatform,
  sales_platform_name: row.salesPlatformName,
  ad_account_name: row.adAccountName || "غير محدد",
  parsing_status: row.parsingStatus,
  created_at: row.createdAt,
  version: row.version,
  is_current: row.isCurrent,
  superseded_at: row.supersededAt ?? null,
  superseded_by: row.supersededBy ?? null
});

const fromAdsRow = (row: any, adsPlatform: AdsPlatform): AdsRow => ({
  id: row.id,
  reportDate: row.report_date,
  adsPlatform,
  salesPlatformName: row.sales_platform_name || "غير محدد",
  adAccountName: row.ad_account_name || "غير محدد",
  campaignName: row.campaign_name,
  adsetName: row.adset_name ?? row.adgroup_name ?? "",
  adName: row.ad_name,
  spend: Number(row.spend) || 0,
  impressions: Number(row.impressions) || 0,
  reach: Number(row.reach) || 0,
  clicks: Number(row.clicks) || 0,
  ctr: Number(row.ctr) || 0,
  cpc: Number(row.cpc) || 0,
  cpm: Number(row.cpm) || 0,
  leads: Number(row.leads ?? row.conversions) || 0,
  resultsCount: Number(row.leads ?? row.conversions) || 0,
  costPerResult: Number(row.cpc ?? row.cost_per_conversion) || 0,
  messagesCount: Number(row.messages_count) || 0,
  commentsCount: Number(row.comments_count) || 0,
  purchases: Number(row.purchases ?? row.conversions) || 0,
  purchaseValue: Number(row.purchase_value ?? row.revenue) || 0,
  sourceFileId: row.source_file_id,
  createdAt: row.created_at
});

const toMetaAdsRow = (row: AdsRow) => ({
  id: row.id,
  report_date: row.reportDate,
  sales_platform_name: row.salesPlatformName,
  ad_account_name: row.adAccountName || "غير محدد",
  campaign_name: row.campaignName,
  adset_name: row.adsetName,
  ad_name: row.adName,
  spend: row.spend,
  impressions: row.impressions,
  reach: row.reach,
  clicks: row.clicks,
  ctr: row.ctr,
  cpc: row.cpc,
  cpm: row.cpm,
  leads: row.leads,
  messages_count: row.messagesCount || 0,
  comments_count: row.commentsCount || 0,
  purchases: row.purchases,
  purchase_value: row.purchaseValue,
  source_file_id: row.sourceFileId,
  created_at: row.createdAt
});

const toTikTokAdsRow = (row: AdsRow) => ({
  id: row.id,
  report_date: row.reportDate,
  sales_platform_name: row.salesPlatformName,
  ad_account_name: row.adAccountName || "غير محدد",
  campaign_name: row.campaignName,
  adgroup_name: row.adsetName,
  ad_name: row.adName,
  spend: row.spend,
  impressions: row.impressions,
  clicks: row.clicks,
  ctr: row.ctr,
  cpc: row.cpc,
  cpm: row.cpm,
  messages_count: row.messagesCount || 0,
  comments_count: row.commentsCount || 0,
  conversions: row.purchases,
  cost_per_conversion: row.purchases ? row.spend / row.purchases : 0,
  revenue: row.purchaseValue,
  source_file_id: row.sourceFileId,
  created_at: row.createdAt
});

const fromPlatformSetting = (row: any): PlatformSetting => ({
  id: row.id,
  platformName: row.platform_name,
  isActive: Boolean(row.is_active),
  createdAt: row.created_at
});

const toPlatformSettingRow = (row: PlatformSetting) => ({
  id: row.id,
  platform_name: row.platformName,
  is_active: row.isActive,
  created_at: row.createdAt
});

const fromOcrPageCorrection = (row: any): OcrPageCorrection => ({
  id: row.id,
  wrongValue: row.wrong_value,
  correctValue: row.correct_value,
  createdAt: row.created_at,
  usageCount: Number(row.usage_count) || 0
});

const toOcrPageCorrectionRow = (row: OcrPageCorrection) => ({
  id: row.id,
  wrong_value: row.wrongValue,
  correct_value: row.correctValue,
  created_at: row.createdAt,
  usage_count: row.usageCount
});

const fromOcrSalespersonCorrection = (row: any): OcrSalespersonCorrection => ({
  id: row.id,
  wrongValue: row.wrong_value,
  correctValue: row.correct_value,
  salespersonCode: row.salesperson_code || "",
  createdAt: row.created_at,
  usageCount: Number(row.usage_count) || 0
});

const toOcrSalespersonCorrectionRow = (row: OcrSalespersonCorrection) => ({
  id: row.id,
  wrong_value: row.wrongValue,
  correct_value: row.correctValue,
  salesperson_code: row.salespersonCode,
  created_at: row.createdAt,
  usage_count: row.usageCount
});

const fromSalespersonMaster = (row: any): SalespersonMaster => ({
  id: row.id,
  code: row.code || "",
  name: row.name || "",
  active: Boolean(row.active)
});

const toSalespersonMasterRow = (row: SalespersonMaster) => ({
  id: row.id,
  code: row.code,
  name: row.name,
  active: row.active
});

const fromPlatformMaster = (row: any): PlatformMaster => ({
  id: row.id,
  name: row.name || "",
  aliases: Array.isArray(row.aliases) ? row.aliases : [],
  active: Boolean(row.active)
});

const toPlatformMasterRow = (row: PlatformMaster) => ({
  id: row.id,
  name: row.name,
  aliases: row.aliases,
  active: row.active
});

const fromBrandMaster = (row: any): BrandMaster => ({
  id: row.id,
  name: row.name || "",
  active: Boolean(row.active)
});

const toBrandMasterRow = (row: BrandMaster) => ({
  id: row.id,
  name: row.name,
  active: row.active
});

const fromColumnMapping = (row: any): ColumnMapping => ({
  id: row.id,
  signature: row.signature,
  fields: row.mapping ?? {},
  sheetLabel: row.sheet_label || "",
  createdAt: row.created_at,
  usageCount: Number(row.usage_count) || 0
});

const toColumnMappingRow = (row: ColumnMapping) => ({
  id: row.id,
  signature: row.signature,
  mapping: row.fields,
  sheet_label: row.sheetLabel,
  created_at: row.createdAt,
  usage_count: row.usageCount
});

// Section 16 (Backup & Restore). Every table this app writes to, by raw
// snake_case row shape - a faithful backup doesn't need the camelCase
// domain conversion, and restoring should write back exactly what was read.
const BACKUP_TABLES = [
  "sales_raw_files",
  "sales_by_salesperson",
  "sales_by_platform",
  "ads_raw_files",
  "meta_ads",
  "tiktok_ads",
  "platform_settings",
  "ocr_page_corrections",
  "ocr_salesperson_corrections",
  "salespeople",
  "platforms",
  "brands",
  "column_mappings",
  "profiles",
  "audit_log"
];

export const exportAllTablesForBackup = async (): Promise<Record<string, unknown[]>> => {
  const entries = await Promise.all(BACKUP_TABLES.map(async (table) => [table, await selectOptionalAll(table)] as const));
  return Object.fromEntries(entries);
};

// The one sanctioned exception to "no full-table wipes" (section 12) -
// reachable only through the dedicated restore route, never as a side
// effect of a normal save. Truncates and reinserts only the tables present
// in the snapshot.
export const restoreTablesFromBackup = async (snapshot: Record<string, unknown[]>): Promise<void> => {
  if (!supabase) throw new Error("Supabase is not configured.");
  for (const [table, rows] of Object.entries(snapshot)) {
    await deleteOptionalAll(table);
    if (rows.length) await insertOptionalRows(table, rows as Record<string, unknown>[]);
  }
};

// Section 15 (File Versioning). "Replace" marks the current file superseded
// instead of deleting it, then inserts a new version - old versions stay in
// the database, inspectable, until an explicit purge.
export const supersedeSalesRawFile = async (existingFileId: string, newFileId: string): Promise<void> => {
  if (!supabase) return;
  const { error } = await supabase
    .from("sales_raw_files")
    .update({ is_current: false, superseded_at: new Date().toISOString(), superseded_by: newFileId })
    .eq("id", existingFileId);
  if (error && !isMissingTableError(error)) throw error;
};

export const supersedeAdsRawFile = async (existingFileId: string, newFileId: string): Promise<void> => {
  if (!supabase) return;
  const { error } = await supabase
    .from("ads_raw_files")
    .update({ is_current: false, superseded_at: new Date().toISOString(), superseded_by: newFileId })
    .eq("id", existingFileId);
  if (error && !isMissingTableError(error)) throw error;
};

const fromProfileRow = (row: any): Profile => ({
  id: row.id,
  displayName: row.display_name || "",
  email: row.email || "",
  role: row.role,
  workspace: row.workspace || "cosmetics",
  roles: Array.isArray(row.roles) ? row.roles : [],
  workspaces: Array.isArray(row.workspaces) && row.workspaces.length ? row.workspaces : [row.workspace || "cosmetics"],
  active: Boolean(row.active),
  createdAt: row.created_at
});

const fromAuditLogRow = (row: any): AuditLogEntry => ({
  id: row.id,
  userId: row.user_id,
  userRole: row.user_role,
  action: row.action,
  entityType: row.entity_type,
  entityId: row.entity_id,
  previousValue: row.previous_value,
  newValue: row.new_value,
  metadata: row.metadata,
  createdAt: row.created_at
});

const fromBackupRunRow = (row: any): BackupRun => ({
  id: row.id,
  startedAt: row.started_at,
  completedAt: row.completed_at,
  status: row.status,
  destination: row.destination,
  locationRef: row.location_ref,
  tableRowCounts: row.table_row_counts,
  fileCount: Number(row.file_count) || 0,
  triggeredBy: row.triggered_by,
  errorMessage: row.error_message
});

const fromSystemHealthRow = (row: any): SystemHealthStatus => ({
  component: row.component,
  status: row.status,
  lastSuccessAt: row.last_success_at,
  lastFailureAt: row.last_failure_at,
  lastErrorMessage: row.last_error_message,
  updatedAt: row.updated_at
});

const fromNotificationRow = (row: any): AppNotification => ({
  id: row.id,
  severity: row.severity,
  category: row.category,
  title: row.title,
  message: row.message,
  relatedEntityType: row.related_entity_type,
  relatedEntityId: row.related_entity_id,
  isRead: Boolean(row.is_read),
  readAt: row.read_at,
  readBy: row.read_by,
  createdAt: row.created_at
});
