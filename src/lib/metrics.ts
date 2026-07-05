import type { AdsRow, AppData, DateRange, Kpis, SalesByPlatform, SalesBySalesperson } from "../types";
import { normalizeArabicText } from "./normalize";

export const inRange = (date: string, range: DateRange) => date >= range.from && date <= range.to;

const sum = <T,>(rows: T[], picker: (row: T) => number) => rows.reduce((total, row) => total + picker(row), 0);
const safeRatio = (top: number, bottom: number) => (bottom ? top / bottom : null);
const safePercent = (top: number, bottom: number) => (bottom ? (top / bottom) * 100 : null);

export const isSubtotalPlatformName = (name: string) => {
  const normalized = normalizeArabicText(name);
  return normalized === "اجمالي السوشيال" || normalized === "اجمالي المتابعه" || normalized === "اجمالي اليوم" || normalized.includes("اجمالي");
};

export const getAllAdsRows = (data: AppData) => [...data.metaAds, ...data.tiktokAds];

export const filterPeople = (data: AppData, range: DateRange) =>
  data.salesBySalesperson.filter((row) => inRange(row.reportDate, range));

export const filterPlatforms = (data: AppData, range: DateRange) =>
  data.salesByPlatform.filter((row) => inRange(row.reportDate, range) && row.rowType !== "subtotal" && row.rowType !== "grand_total" && !isSubtotalPlatformName(row.platformName));

export const filterAds = (data: AppData, range: DateRange) => getAllAdsRows(data).filter((row) => inRange(row.reportDate, range));

// Salespeople and Pages are two independent tables (Salespeople_Input /
// Pages_Input) with no per-row link between a salesperson and a page - a
// salesperson row was never assigned a page, and a page row was never
// assigned a salesperson, in the source file itself. So the "totals" figures
// can only be sliced by ONE of the two axes at a time without fabricating a
// join that doesn't exist:
//   - no page/platform filter active -> source totals from salespeople (also
//     correctly sliceable by Salesperson).
//   - a specific page/platform is selected -> source totals from that page's
//     own stored total (also correctly sliceable by Brand, which both
//     tables carry per-row from the upload), since that's the only place a
//     per-page revenue figure actually exists.
export const calculateKpis = (data: AppData, range: DateRange, options?: { useSalesByPlatformForTotals?: boolean }): Kpis => {
  const people = filterPeople(data, range);
  const platforms = filterPlatforms(data, range);
  const ads = filterAds(data, range);
  const salesTotalsSource: Array<SalesBySalesperson | SalesByPlatform> = options?.useSalesByPlatformForTotals ? platforms : people;

  const totalSalesRevenue = sum(salesTotalsSource, (row) => row.totalRevenue);
  const totalOrders = sum(salesTotalsSource, (row) => row.totalOrders);
  const morningOrders = sum(salesTotalsSource, (row) => row.morningOrders);
  const eveningOrders = sum(salesTotalsSource, (row) => row.eveningOrders);
  const morningRevenue = sum(salesTotalsSource, (row) => row.morningRevenue);
  const eveningRevenue = sum(salesTotalsSource, (row) => row.eveningRevenue);
  const metaSpend = sum(ads.filter((row) => row.adsPlatform === "Meta"), (row) => row.spend);
  const tiktokSpend = sum(ads.filter((row) => row.adsPlatform === "TikTok"), (row) => row.spend);
  const totalAdsSpend = metaSpend + tiktokSpend;
  const messagesCount = sum(ads, (row) => Number(row.messagesCount) || 0);
  const commentsCount = sum(ads, (row) => Number(row.commentsCount) || 0);

  return {
    totalSalesRevenue,
    totalOrders,
    morningOrders,
    eveningOrders,
    morningRevenue,
    eveningRevenue,
    totalAdsSpend,
    metaSpend,
    tiktokSpend,
    messagesCount,
    commentsCount,
    messageConversionRate: messagesCount ? safePercent(totalOrders, messagesCount) : 0,
    roas: safeRatio(totalSalesRevenue, totalAdsSpend),
    roi: safePercent(totalSalesRevenue - totalAdsSpend, totalAdsSpend),
    cpa: safeRatio(totalAdsSpend, totalOrders),
    averageOrderValue: safeRatio(totalSalesRevenue, totalOrders),
    spendToSalesRatio: safePercent(totalAdsSpend, totalSalesRevenue),
    bestSalespersonByOrders: bestLabel(aggregatePeople(people), "totalOrders", "salespersonName"),
    bestSalespersonByRevenue: bestLabel(aggregatePeople(people), "totalRevenue", "salespersonName"),
    bestPlatformByOrders: bestLabel(aggregatePlatforms(platforms), "totalOrders", "platformName"),
    bestPlatformByRevenue: bestLabel(aggregatePlatforms(platforms), "totalRevenue", "platformName")
  };
};

export const aggregatePeople = (rows: SalesBySalesperson[]) => {
  const map = new Map<string, SalesBySalesperson>();
  for (const row of rows) {
    // Normalized so the same person typed with a stray space or a different
    // Arabic letter variant across different days' uploads merges into one
    // row instead of fragmenting the totals.
    const key = `${normalizeArabicText(row.salespersonCode)}-${normalizeArabicText(row.salespersonName)}`;
    const existing = map.get(key);
    if (!existing) {
      map.set(key, { ...row });
    } else {
      existing.morningOrders += row.morningOrders;
      existing.morningRevenue += row.morningRevenue;
      existing.eveningOrders += row.eveningOrders;
      existing.eveningRevenue += row.eveningRevenue;
      existing.totalOrders += row.totalOrders;
      existing.totalRevenue += row.totalRevenue;
    }
  }
  return [...map.values()].sort((a, b) => b.totalRevenue - a.totalRevenue);
};

export const aggregatePlatforms = (rows: SalesByPlatform[]) => {
  const map = new Map<string, SalesByPlatform>();
  for (const row of rows.filter((item) => item.rowType !== "subtotal" && item.rowType !== "grand_total" && !isSubtotalPlatformName(item.platformName))) {
    const key = normalizeArabicText(row.platformName);
    const existing = map.get(key);
    if (!existing) {
      map.set(key, { ...row });
    } else {
      existing.morningOrders += row.morningOrders;
      existing.morningRevenue += row.morningRevenue;
      existing.eveningOrders += row.eveningOrders;
      existing.eveningRevenue += row.eveningRevenue;
      existing.totalOrders += row.totalOrders;
      existing.totalRevenue += row.totalRevenue;
    }
  }
  return [...map.values()].sort((a, b) => b.totalRevenue - a.totalRevenue);
};

export const aggregateAdsByPlatform = (rows: AdsRow[]) => {
  const map = new Map<string, { platform: string; spend: number; messages: number; comments: number; results: number }>();
  for (const row of rows) {
    const platform = row.adAccountName || row.adsPlatform;
    const item = map.get(platform) ?? { platform, spend: 0, messages: 0, comments: 0, results: 0 };
    item.spend += row.spend;
    item.messages += Number(row.messagesCount) || 0;
    item.comments += Number(row.commentsCount) || 0;
    item.results += Number(row.resultsCount) || row.leads || row.purchases || 0;
    map.set(platform, item);
  }
  return [...map.values()].sort((a, b) => b.spend - a.spend);
};

export const aggregateAdsByDate = (ads: AdsRow[]) => {
  const map = new Map<string, { date: string; metaSpend: number; tiktokSpend: number; totalSpend: number }>();
  for (const row of ads) {
    const item = map.get(row.reportDate) ?? { date: row.reportDate, metaSpend: 0, tiktokSpend: 0, totalSpend: 0 };
    if (row.adsPlatform === "Meta") item.metaSpend += row.spend;
    if (row.adsPlatform === "TikTok") item.tiktokSpend += row.spend;
    item.totalSpend = item.metaSpend + item.tiktokSpend;
    map.set(row.reportDate, item);
  }
  return [...map.values()].sort((a, b) => a.date.localeCompare(b.date));
};

export const dailyTrend = (people: SalesBySalesperson[], ads: AdsRow[]) => {
  const map = new Map<string, { date: string; revenue: number; orders: number; spend: number; roas: number | null }>();
  for (const row of people) {
    const item = map.get(row.reportDate) ?? { date: row.reportDate, revenue: 0, orders: 0, spend: 0, roas: null };
    item.revenue += row.totalRevenue;
    item.orders += row.totalOrders;
    map.set(row.reportDate, item);
  }
  for (const row of ads) {
    const item = map.get(row.reportDate) ?? { date: row.reportDate, revenue: 0, orders: 0, spend: 0, roas: null };
    item.spend += row.spend;
    map.set(row.reportDate, item);
  }
  return [...map.values()]
    .map((item) => ({ ...item, roas: safeRatio(item.revenue, item.spend) }))
    .sort((a, b) => a.date.localeCompare(b.date));
};

const bestLabel = <T extends object>(rows: T[], metric: keyof T, label: keyof T) => {
  const best = [...rows].sort((a, b) => Number(b[metric]) - Number(a[metric]))[0];
  return best ? String(best[label]) : "لا يوجد";
};
