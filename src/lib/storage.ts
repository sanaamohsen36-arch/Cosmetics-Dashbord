import type {
  AdsPlatform,
  AdsRawFile,
  AdsRow,
  AppData,
  OcrPageCorrection,
  OcrSalespersonCorrection,
  PlatformMaster,
  PlatformSetting,
  SalesByPlatform,
  SalesBySalesperson,
  SalespersonMaster,
  SalesRawFile,
  UploadMode
} from "../types";
import { isSubtotalPlatformName } from "./metrics";
import { isSupabaseConfigured, supabase } from "./supabase";

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
  }))
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
    platforms
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
    selectOptionalAll("platforms")
  ]);

  return {
    salesRawFiles: salesRawFiles.map(fromSalesRawFile),
    salesBySalesperson: salesBySalesperson.map(fromSalesperson),
    salesByPlatform: salesByPlatform.map(fromPlatformSales),
    adsRawFiles: adsRawFiles.map(fromAdsRawFile),
    metaAds: metaAds.map((row) => fromAdsRow(row, "Meta")),
    tiktokAds: tiktokAds.map((row) => fromAdsRow(row, "TikTok")),
    platformSettings: mergeDefaultPlatforms(platformSettings.map(fromPlatformSetting)),
    ocrPageCorrections: ocrPageCorrections.map(fromOcrPageCorrection),
    ocrSalespersonCorrections: ocrSalespersonCorrections.map(fromOcrSalespersonCorrection),
    salespeople: salespeople.map(fromSalespersonMaster),
    platforms: mergeDefaultPlatformMasters(platforms.map(fromPlatformMaster))
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
  await refreshDailySummary(data);
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
      platforms: mergeDefaultPlatformMasters(parsed.platforms ?? [])
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

export const saveSalesUpload = async (
  current: AppData,
  rawFile: SalesRawFile,
  people: SalesBySalesperson[],
  platforms: SalesByPlatform[],
  mode: UploadMode
): Promise<AppData> => {
  if (mode === "cancel") return current;
  const withoutDate =
    mode === "replace"
      ? {
          ...current,
          salesRawFiles: current.salesRawFiles.filter((file) => file.reportDate !== rawFile.reportDate),
          salesBySalesperson: current.salesBySalesperson.filter((row) => row.reportDate !== rawFile.reportDate),
          salesByPlatform: current.salesByPlatform.filter((row) => row.reportDate !== rawFile.reportDate)
        }
      : current;

  const next = {
    ...withoutDate,
    salesRawFiles: [...withoutDate.salesRawFiles, rawFile],
    salesBySalesperson: [...withoutDate.salesBySalesperson, ...people],
    salesByPlatform: [...withoutDate.salesByPlatform, ...platforms]
  };

  if (!supabase) {
    saveLocalData(next);
    return next;
  }

  if (mode === "replace") {
    await deleteWhere("sales_raw_files", (query) => query.eq("report_date", rawFile.reportDate));
    await deleteWhere("sales_by_salesperson", (query) => query.eq("report_date", rawFile.reportDate));
    await deleteWhere("sales_by_platform", (query) => query.eq("report_date", rawFile.reportDate));
  }
  await insertRows("sales_raw_files", [toSalesRawFileRow(rawFile)]);
  await insertRows("sales_by_salesperson", people.map(toSalespersonRow));
  await insertRows("sales_by_platform", platforms.map(toPlatformSalesRow));
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
  const withoutDate =
    mode === "replace"
      ? {
          ...current,
          adsRawFiles: current.adsRawFiles.filter(
            (file) =>
              !(
                file.reportDate === rawFile.reportDate &&
                file.adsPlatform === platform &&
                file.salesPlatformName === rawFile.salesPlatformName &&
                (file.adAccountName || "غير محدد") === (rawFile.adAccountName || "غير محدد")
              )
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
    ...withoutDate,
    adsRawFiles: [...withoutDate.adsRawFiles, rawFile],
    [tableKey]: [...withoutDate[tableKey], ...rows]
  };

  if (!supabase) {
    saveLocalData(next);
    return next;
  }

  if (mode === "replace") {
    await deleteWhere("ads_raw_files", (query) =>
      query
        .eq("report_date", rawFile.reportDate)
        .eq("ads_platform", platform)
        .eq("sales_platform_name", rawFile.salesPlatformName)
        .eq("ad_account_name", rawFile.adAccountName || "غير محدد")
    );

    if (platform === "Meta") {
      await deleteWhere("meta_ads", (query) =>
        query
          .eq("report_date", rawFile.reportDate)
          .eq("sales_platform_name", rawFile.salesPlatformName)
          .eq("ad_account_name", rawFile.adAccountName || "غير محدد")
      );
    } else {
      await deleteWhere("tiktok_ads", (query) =>
        query
          .eq("report_date", rawFile.reportDate)
          .eq("sales_platform_name", rawFile.salesPlatformName)
          .eq("ad_account_name", rawFile.adAccountName || "غير محدد")
      );
    }
  }

  await insertRows("ads_raw_files", [toAdsRawFileRow(rawFile)]);

  if (platform === "Meta") {
    await insertRows("meta_ads", rows.map(toMetaAdsRow));
  } else {
    await insertRows("tiktok_ads", rows.map(toTikTokAdsRow));
  }

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
  ocrStatus: row.ocr_status,
  createdAt: row.created_at
});

const toSalesRawFileRow = (row: SalesRawFile) => ({
  id: row.id,
  file_name: row.fileName,
  file_url: row.filePath,
  uploaded_at: row.uploadedAt,
  report_date: row.reportDate,
  ocr_status: row.ocrStatus,
  created_at: row.createdAt
});

const fromSalesperson = (row: any): SalesBySalesperson => ({
  id: row.id,
  reportDate: row.report_date,
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
  createdAt: row.created_at
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
  created_at: row.createdAt
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
