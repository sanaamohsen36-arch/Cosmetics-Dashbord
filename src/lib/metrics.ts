import type { AdsRow, AppData, DateRange, Kpis, SalesByPlatform, SalesBySalesperson } from "../types";

export const inRange = (date: string, range: DateRange) => date >= range.from && date <= range.to;

const sum = <T,>(rows: T[], picker: (row: T) => number) => rows.reduce((total, row) => total + picker(row), 0);
const safeRatio = (top: number, bottom: number) => (bottom ? top / bottom : null);
const safePercent = (top: number, bottom: number) => (bottom ? (top / bottom) * 100 : null);
const normalizePlatformName = (name: string) =>
  name
    .replace(/[إأآ]/g, "ا")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();

export const isSubtotalPlatformName = (name: string) => {
  const normalized = normalizePlatformName(name);
  return normalized === "اجمالي السوشيال" || normalized === "اجمالي المتابعة" || normalized === "اجمالي اليوم" || normalized.includes("اجمالي");
};

export const getAllAdsRows = (data: AppData) => [...data.metaAds, ...data.tiktokAds];

export const filterPeople = (data: AppData, range: DateRange) =>
  data.salesBySalesperson.filter((row) => inRange(row.reportDate, range));

export const filterPlatforms = (data: AppData, range: DateRange) =>
  data.salesByPlatform.filter((row) => inRange(row.reportDate, range) && row.rowType !== "subtotal" && row.rowType !== "grand_total" && !isSubtotalPlatformName(row.platformName));

export const filterAds = (data: AppData, range: DateRange) => getAllAdsRows(data).filter((row) => inRange(row.reportDate, range));

export const calculateKpis = (data: AppData, range: DateRange): Kpis => {
  const people = filterPeople(data, range);
  const platforms = filterPlatforms(data, range);
  const ads = filterAds(data, range);

  const totalSalesRevenue = sum(people, (row) => row.totalRevenue);
  const totalOrders = sum(people, (row) => row.totalOrders);
  const morningOrders = sum(people, (row) => row.morningOrders);
  const eveningOrders = sum(people, (row) => row.eveningOrders);
  const morningRevenue = sum(people, (row) => row.morningRevenue);
  const eveningRevenue = sum(people, (row) => row.eveningRevenue);
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
    const key = `${row.salespersonCode}-${row.salespersonName}`;
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
    const key = row.platformName;
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
