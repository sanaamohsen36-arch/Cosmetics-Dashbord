import type {
  AdsPlatform,
  HomeAdsRawFile,
  HomeAdsRow,
  HomeAppData,
  HomeSalesBySalesperson,
  HomeSalesByPage,
  HomeSalesRawFile,
  ShiftType
} from "../../types";
import { supabase } from "./client";
import { createId } from "./storage";

// Phase 2/3 (Home workspace) - fully separate load/save/delete layer from
// Cosmetics' storage.ts, matching its conventions (local-fallback support,
// Section 15-style file versioning: replace supersedes instead of deleting)
// but touching only the home_* tables. Never imported by Cosmetics code,
// never shares a table with it.
export { createId };

const HOME_STORAGE_KEY = "daily-report-dashboard-home-v1";

export const emptyHomeData = (): HomeAppData => ({ rawFiles: [], salespeople: [], pages: [], adsRawFiles: [], metaAds: [], tiktokAds: [] });

export const buildHomeUploadKey = (reportDate: string, shiftType: ShiftType) => `home|${reportDate}|${shiftType}`;

// Same is_current filtering as the Supabase branch below - superseded files
// are kept in storage (inspectable) but must never resurface as if they
// were still active, in local-fallback mode same as with Supabase.
const loadLocalHomeData = (): HomeAppData => {
  try {
    const raw = localStorage.getItem(HOME_STORAGE_KEY);
    if (!raw) return emptyHomeData();
    const parsed: HomeAppData = { ...emptyHomeData(), ...JSON.parse(raw) };
    const currentFileIds = new Set(parsed.rawFiles.filter((file) => file.isCurrent).map((file) => file.id));
    const currentAdsFileIds = new Set(parsed.adsRawFiles.filter((file) => file.isCurrent).map((file) => file.id));
    return {
      rawFiles: parsed.rawFiles.filter((file) => file.isCurrent),
      salespeople: parsed.salespeople.filter((row) => currentFileIds.has(row.sourceFileId)),
      pages: parsed.pages.filter((row) => currentFileIds.has(row.sourceFileId)),
      adsRawFiles: parsed.adsRawFiles.filter((file) => file.isCurrent),
      metaAds: parsed.metaAds.filter((row) => currentAdsFileIds.has(row.sourceFileId)),
      tiktokAds: parsed.tiktokAds.filter((row) => currentAdsFileIds.has(row.sourceFileId))
    };
  } catch {
    return emptyHomeData();
  }
};

const saveLocalHomeData = (data: HomeAppData) => {
  localStorage.setItem(HOME_STORAGE_KEY, JSON.stringify(data));
};

const fromHomeRawFileRow = (row: any): HomeSalesRawFile => ({
  id: row.id,
  workspace: "home",
  reportDate: row.report_date,
  shiftType: row.shift_type,
  uploadKey: row.upload_key,
  fileName: row.file_name,
  uploadedAt: row.uploaded_at,
  createdAt: row.created_at,
  version: row.version,
  isCurrent: row.is_current !== false,
  supersededAt: row.superseded_at,
  supersededBy: row.superseded_by
});

const toHomeRawFileRow = (file: HomeSalesRawFile) => ({
  id: file.id,
  workspace: "home",
  report_date: file.reportDate,
  shift_type: file.shiftType,
  upload_key: file.uploadKey,
  file_name: file.fileName,
  file_url: file.fileName,
  uploaded_at: file.uploadedAt,
  created_at: file.createdAt,
  version: file.version,
  is_current: file.isCurrent,
  superseded_at: file.supersededAt ?? null,
  superseded_by: file.supersededBy ?? null
});

const fromHomeSalespersonRow = (row: any): HomeSalesBySalesperson => ({
  id: row.id,
  workspace: "home",
  reportDate: row.report_date,
  shiftType: row.shift_type,
  salespersonCode: row.salesperson_code || "",
  salespersonName: row.salesperson_name || "",
  teamType: row.team_type || "",
  orders: Number(row.orders) || 0,
  revenue: Number(row.revenue) || 0,
  notes: row.notes || "",
  sourceFileId: row.source_file_id,
  createdAt: row.created_at
});

const toHomeSalespersonRow = (row: HomeSalesBySalesperson) => ({
  id: row.id,
  workspace: "home",
  report_date: row.reportDate,
  shift_type: row.shiftType,
  salesperson_code: row.salespersonCode,
  salesperson_name: row.salespersonName,
  team_type: row.teamType,
  orders: row.orders,
  revenue: row.revenue,
  notes: row.notes,
  source_file_id: row.sourceFileId,
  created_at: row.createdAt
});

const fromHomePageRow = (row: any): HomeSalesByPage => ({
  id: row.id,
  workspace: "home",
  reportDate: row.report_date,
  shiftType: row.shift_type,
  pageName: row.page_name || "",
  orders: Number(row.orders) || 0,
  revenue: Number(row.revenue) || 0,
  notes: row.notes || "",
  sourceFileId: row.source_file_id,
  createdAt: row.created_at
});

const toHomePageRow = (row: HomeSalesByPage) => ({
  id: row.id,
  workspace: "home",
  report_date: row.reportDate,
  shift_type: row.shiftType,
  page_name: row.pageName,
  orders: row.orders,
  revenue: row.revenue,
  notes: row.notes,
  source_file_id: row.sourceFileId,
  created_at: row.createdAt
});

const fromHomeAdsRawFileRow = (row: any): HomeAdsRawFile => ({
  id: row.id,
  workspace: "home",
  fileName: row.file_name,
  filePath: row.file_url,
  uploadedAt: row.uploaded_at,
  reportDate: row.report_date,
  adsPlatform: row.ads_platform,
  pageName: row.page_name || "",
  parsingStatus: row.parsing_status,
  createdAt: row.created_at,
  version: Number(row.version) || 1,
  isCurrent: row.is_current !== false,
  supersededAt: row.superseded_at,
  supersededBy: row.superseded_by
});

const toHomeAdsRawFileRow = (file: HomeAdsRawFile) => ({
  id: file.id,
  workspace: "home",
  file_name: file.fileName,
  file_url: file.filePath,
  uploaded_at: file.uploadedAt,
  report_date: file.reportDate,
  ads_platform: file.adsPlatform,
  page_name: file.pageName,
  parsing_status: file.parsingStatus,
  created_at: file.createdAt,
  version: file.version,
  is_current: file.isCurrent,
  superseded_at: file.supersededAt ?? null,
  superseded_by: file.supersededBy ?? null
});

const fromHomeAdsRow = (row: any, adsPlatform: AdsPlatform): HomeAdsRow => ({
  id: row.id,
  workspace: "home",
  reportDate: row.report_date,
  adsPlatform,
  pageName: row.page_name || "",
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

const toHomeMetaAdsRow = (row: HomeAdsRow) => ({
  id: row.id,
  workspace: "home",
  report_date: row.reportDate,
  page_name: row.pageName,
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

const toHomeTiktokAdsRow = (row: HomeAdsRow) => ({
  id: row.id,
  workspace: "home",
  report_date: row.reportDate,
  page_name: row.pageName,
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

export const loadHomeData = async (): Promise<HomeAppData> => {
  if (!supabase) return loadLocalHomeData();

  const [
    { data: rawFiles, error: rawError },
    { data: salespeople, error: spError },
    { data: pages, error: pgError },
    { data: adsRawFiles, error: adsRawError },
    { data: metaAds, error: metaError },
    { data: tiktokAds, error: tiktokError }
  ] = await Promise.all([
    supabase.from("home_sales_raw_files").select("*"),
    supabase.from("home_sales_by_salesperson").select("*"),
    supabase.from("home_sales_by_page").select("*"),
    supabase.from("home_ads_raw_files").select("*"),
    supabase.from("home_meta_ads").select("*"),
    supabase.from("home_tiktok_ads").select("*")
  ]);
  if (rawError) throw rawError;
  if (spError) throw spError;
  if (pgError) throw pgError;
  if (adsRawError) throw adsRawError;
  if (metaError) throw metaError;
  if (tiktokError) throw tiktokError;

  // Section 15-style versioning: only current-file rows are loaded, same as
  // Cosmetics - a superseded file's rows drop out automatically once its
  // is_current flips false, no separate row-level flag needed.
  const currentFileIds = new Set((rawFiles ?? []).filter((row: any) => row.is_current !== false).map((row: any) => row.id));
  const currentAdsFileIds = new Set((adsRawFiles ?? []).filter((row: any) => row.is_current !== false).map((row: any) => row.id));

  return {
    rawFiles: (rawFiles ?? []).filter((row: any) => row.is_current !== false).map(fromHomeRawFileRow),
    salespeople: (salespeople ?? []).filter((row: any) => currentFileIds.has(row.source_file_id)).map(fromHomeSalespersonRow),
    pages: (pages ?? []).filter((row: any) => currentFileIds.has(row.source_file_id)).map(fromHomePageRow),
    adsRawFiles: (adsRawFiles ?? []).filter((row: any) => row.is_current !== false).map(fromHomeAdsRawFileRow),
    metaAds: (metaAds ?? []).filter((row: any) => currentAdsFileIds.has(row.source_file_id)).map((row: any) => fromHomeAdsRow(row, "Meta")),
    tiktokAds: (tiktokAds ?? []).filter((row: any) => currentAdsFileIds.has(row.source_file_id)).map((row: any) => fromHomeAdsRow(row, "TikTok"))
  };
};

export const subscribeToHomeDataChanges = (onChange: () => void) => {
  if (!supabase) return () => undefined;

  const activeSupabase = supabase;
  const channelName = `home-dashboard-db-changes-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const channel = activeSupabase
    .channel(channelName)
    .on("postgres_changes", { event: "*", schema: "public", table: "home_sales_raw_files" }, onChange)
    .on("postgres_changes", { event: "*", schema: "public", table: "home_sales_by_salesperson" }, onChange)
    .on("postgres_changes", { event: "*", schema: "public", table: "home_sales_by_page" }, onChange)
    .on("postgres_changes", { event: "*", schema: "public", table: "home_ads_raw_files" }, onChange)
    .on("postgres_changes", { event: "*", schema: "public", table: "home_meta_ads" }, onChange)
    .on("postgres_changes", { event: "*", schema: "public", table: "home_tiktok_ads" }, onChange)
    .subscribe();

  return () => {
    void activeSupabase.removeChannel(channel);
  };
};

export type HomeUploadMode = "merge" | "replace";

// One current slot per (report_date, shift_type) - Morning and Evening are
// independent; replacing one never touches the other's rows or file.
export const saveHomeSalesUpload = async (
  current: HomeAppData,
  rawFile: HomeSalesRawFile,
  salespeople: HomeSalesBySalesperson[],
  pages: HomeSalesByPage[],
  mode: HomeUploadMode
): Promise<HomeAppData> => {
  const matchesSlot = (file: HomeSalesRawFile) => file.reportDate === rawFile.reportDate && file.shiftType === rawFile.shiftType;
  const previousFile = current.rawFiles.find((file) => matchesSlot(file) && file.isCurrent);

  const versionedFile: HomeSalesRawFile = {
    ...rawFile,
    version: mode === "replace" && previousFile ? previousFile.version + 1 : 1,
    isCurrent: true
  };

  const withoutCurrent =
    mode === "replace"
      ? {
          rawFiles: current.rawFiles.map((file) =>
            matchesSlot(file) && file.isCurrent
              ? { ...file, isCurrent: false, supersededAt: rawFile.createdAt, supersededBy: versionedFile.id }
              : file
          ),
          salespeople: current.salespeople.filter((row) => !(row.reportDate === rawFile.reportDate && row.shiftType === rawFile.shiftType)),
          pages: current.pages.filter((row) => !(row.reportDate === rawFile.reportDate && row.shiftType === rawFile.shiftType))
        }
      : current;

  const next: HomeAppData = {
    ...current,
    rawFiles: [...withoutCurrent.rawFiles, versionedFile],
    salespeople: [...withoutCurrent.salespeople, ...salespeople],
    pages: [...withoutCurrent.pages, ...pages]
  };

  if (!supabase) {
    saveLocalHomeData(next);
    return next;
  }

  if (mode === "replace" && previousFile) {
    const { error } = await supabase
      .from("home_sales_raw_files")
      .update({ is_current: false, superseded_at: rawFile.createdAt, superseded_by: versionedFile.id })
      .eq("id", previousFile.id);
    if (error) throw error;
  }

  const { error: fileError } = await supabase.from("home_sales_raw_files").insert(toHomeRawFileRow(versionedFile));
  if (fileError) throw fileError;
  if (salespeople.length) {
    const { error } = await supabase.from("home_sales_by_salesperson").insert(salespeople.map(toHomeSalespersonRow));
    if (error) throw error;
  }
  if (pages.length) {
    const { error } = await supabase.from("home_sales_by_page").insert(pages.map(toHomePageRow));
    if (error) throw error;
  }
  return next;
};

// Deletes one shift's upload and only its own rows - the other shift and
// every Cosmetics table are untouched (this module never references them).
export const deleteHomeRawFile = async (current: HomeAppData, rawFileId: string): Promise<HomeAppData> => {
  const next: HomeAppData = {
    ...current,
    rawFiles: current.rawFiles.filter((file) => file.id !== rawFileId),
    salespeople: current.salespeople.filter((row) => row.sourceFileId !== rawFileId),
    pages: current.pages.filter((row) => row.sourceFileId !== rawFileId)
  };

  if (!supabase) {
    saveLocalHomeData(next);
    return next;
  }

  const { error: spError } = await supabase.from("home_sales_by_salesperson").delete().eq("source_file_id", rawFileId);
  if (spError) throw spError;
  const { error: pgError } = await supabase.from("home_sales_by_page").delete().eq("source_file_id", rawFileId);
  if (pgError) throw pgError;
  const { error: fileError } = await supabase.from("home_sales_raw_files").delete().eq("id", rawFileId);
  if (fileError) throw fileError;

  return next;
};

// Phase 3 (Home Ads Upload) - mirrors Cosmetics' saveAdsUpload exactly
// (always "merge": multiple files can coexist for the same date/platform/
// page, never silently overwritten), keyed by (reportDate, adsPlatform,
// pageName) instead of Brand. Never touches Cosmetics' ads tables.
export const saveHomeAdsUpload = async (
  current: HomeAppData,
  rawFile: HomeAdsRawFile,
  rows: HomeAdsRow[],
  platform: AdsPlatform,
  mode: HomeUploadMode
): Promise<HomeAppData> => {
  const tableKey = platform === "Meta" ? "metaAds" : "tiktokAds";
  const matchesSlot = (file: HomeAdsRawFile) =>
    file.reportDate === rawFile.reportDate && file.adsPlatform === platform && file.pageName === rawFile.pageName;
  const previousFile = current.adsRawFiles.find((file) => matchesSlot(file) && file.isCurrent);

  const versionedFile: HomeAdsRawFile = {
    ...rawFile,
    version: mode === "replace" && previousFile ? previousFile.version + 1 : 1,
    isCurrent: true
  };

  const withoutCurrent =
    mode === "replace"
      ? {
          adsRawFiles: current.adsRawFiles.map((file) =>
            matchesSlot(file) && file.isCurrent
              ? { ...file, isCurrent: false, supersededAt: rawFile.createdAt, supersededBy: versionedFile.id }
              : file
          ),
          [tableKey]: current[tableKey].filter(
            (row) => !(row.reportDate === rawFile.reportDate && row.pageName === rawFile.pageName)
          )
        }
      : { adsRawFiles: current.adsRawFiles, [tableKey]: current[tableKey] };

  const next: HomeAppData = {
    ...current,
    adsRawFiles: [...withoutCurrent.adsRawFiles, versionedFile],
    [tableKey]: [...withoutCurrent[tableKey], ...rows]
  };

  if (!supabase) {
    saveLocalHomeData(next);
    return next;
  }

  if (mode === "replace" && previousFile) {
    const { error } = await supabase
      .from("home_ads_raw_files")
      .update({ is_current: false, superseded_at: rawFile.createdAt, superseded_by: versionedFile.id })
      .eq("id", previousFile.id);
    if (error) throw error;
  }

  const { error: fileError } = await supabase.from("home_ads_raw_files").insert(toHomeAdsRawFileRow(versionedFile));
  if (fileError) throw fileError;
  if (rows.length) {
    if (platform === "Meta") {
      const { error } = await supabase.from("home_meta_ads").insert(rows.map(toHomeMetaAdsRow));
      if (error) throw error;
    } else {
      const { error } = await supabase.from("home_tiktok_ads").insert(rows.map(toHomeTiktokAdsRow));
      if (error) throw error;
    }
  }
  return next;
};

// Deletes one Ads file and only its own rows - never affects the other
// platform/date/page slot, Home Sales data, or any Cosmetics table.
export const deleteHomeAdsRawFile = async (current: HomeAppData, rawFileId: string): Promise<HomeAppData> => {
  const next: HomeAppData = {
    ...current,
    adsRawFiles: current.adsRawFiles.filter((file) => file.id !== rawFileId),
    metaAds: current.metaAds.filter((row) => row.sourceFileId !== rawFileId),
    tiktokAds: current.tiktokAds.filter((row) => row.sourceFileId !== rawFileId)
  };

  if (!supabase) {
    saveLocalHomeData(next);
    return next;
  }

  const { error: metaError } = await supabase.from("home_meta_ads").delete().eq("source_file_id", rawFileId);
  if (metaError) throw metaError;
  const { error: tiktokError } = await supabase.from("home_tiktok_ads").delete().eq("source_file_id", rawFileId);
  if (tiktokError) throw tiktokError;
  const { error: fileError } = await supabase.from("home_ads_raw_files").delete().eq("id", rawFileId);
  if (fileError) throw fileError;

  return next;
};
