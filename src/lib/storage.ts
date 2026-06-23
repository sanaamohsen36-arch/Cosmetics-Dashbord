import type {
  AdsPlatform,
  AdsRawFile,
  AdsRow,
  AppData,
  PlatformSetting,
  SalesByPlatform,
  SalesBySalesperson,
  SalesRawFile,
  UploadMode
} from "../types";
import { isSupabaseConfigured, supabase } from "./supabase";

const STORAGE_KEY = "daily-report-dashboard-v1";

const defaultPlatforms = [
  "ريجينكس",
  "ريجينكس eg",
  "واتس اب ريجينكس",
  "إجمالي السوشيال",
  "تليفون إعلان",
  "تيم المتابعة",
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
  }))
});

export const getStorageMode = () => (isSupabaseConfigured ? "Supabase" : "Local fallback");

const mergeDefaultPlatforms = (settings: PlatformSetting[] = []) => {
  const seen = new Set(settings.map((item) => item.platformName.trim().toLowerCase()));
  const missing = defaultPlatforms
    .filter((platformName) => !seen.has(platformName.trim().toLowerCase()))
    .map((platformName) => ({
      id: createId(),
      platformName,
      isActive: true,
      createdAt: new Date().toISOString()
    }));
  return [...settings, ...missing];
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
    platformSettings
  ] = await Promise.all([
    selectAll("sales_raw_files"),
    selectAll("sales_by_salesperson"),
    selectAll("sales_by_platform"),
    selectAll("ads_raw_files"),
    selectAll("meta_ads"),
    selectAll("tiktok_ads"),
    selectAll("platform_settings")
  ]);

  return {
    salesRawFiles: salesRawFiles.map(fromSalesRawFile),
    salesBySalesperson: salesBySalesperson.map(fromSalesperson),
    salesByPlatform: salesByPlatform.map(fromPlatformSales),
    adsRawFiles: adsRawFiles.map(fromAdsRawFile),
    metaAds: metaAds.map((row) => fromAdsRow(row, "Meta")),
    tiktokAds: tiktokAds.map((row) => fromAdsRow(row, "TikTok")),
    platformSettings: mergeDefaultPlatforms(platformSettings.map(fromPlatformSetting))
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
};

export const subscribeToDataChanges = (onChange: () => void) => {
  if (!supabase) return () => undefined;

  const activeSupabase = supabase;

  const channel = activeSupabase
    .channel("dashboard-db-changes")
    .on("postgres_changes", { event: "*", schema: "public", table: "sales_raw_files" }, onChange)
    .on("postgres_changes", { event: "*", schema: "public", table: "sales_by_salesperson" }, onChange)
    .on("postgres_changes", { event: "*", schema: "public", table: "sales_by_platform" }, onChange)
    .on("postgres_changes", { event: "*", schema: "public", table: "ads_raw_files" }, onChange)
    .on("postgres_changes", { event: "*", schema: "public", table: "meta_ads" }, onChange)
    .on("postgres_changes", { event: "*", schema: "public", table: "tiktok_ads" }, onChange)
    .on("postgres_changes", { event: "*", schema: "public", table: "platform_settings" }, onChange)
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
        salesPlatformName: file.salesPlatformName || "غير محدد"
      })),
      metaAds: (parsed.metaAds ?? []).map((row) => ({ ...row, salesPlatformName: row.salesPlatformName || "غير محدد" })),
      tiktokAds: (parsed.tiktokAds ?? []).map((row) => ({ ...row, salesPlatformName: row.salesPlatformName || "غير محدد" })),
      platformSettings: mergeDefaultPlatforms(
        parsed.platformSettings?.length ? parsed.platformSettings : emptyData().platformSettings
      )
    };
  } catch {
    return emptyData();
  }
};

const saveLocalData = (data: AppData) => {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  window.dispatchEvent(new CustomEvent("dashboard-data-updated"));
};
