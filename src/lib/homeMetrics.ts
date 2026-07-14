import type { DateRange, HomeAppData, HomeSalesBySalesperson, HomeSalesByPage, ShiftType } from "../types";

// Phase 2 (Home workspace) aggregation - parallel to lib/metrics.ts
// (Cosmetics, untouched) but over Home's own data shape (shift-based, no
// Brand). Every filter here recalculates every KPI/chart/table from the
// same filtered dataset, per spec.
export interface HomeFilters {
  range: DateRange;
  shift: "all" | ShiftType;
  page: string;
  salesperson: string;
  teamType: string;
}

export const filterHomeSalespeople = (data: HomeAppData, filters: HomeFilters): HomeSalesBySalesperson[] =>
  data.salespeople.filter(
    (row) =>
      row.reportDate >= filters.range.from &&
      row.reportDate <= filters.range.to &&
      (filters.shift === "all" || row.shiftType === filters.shift) &&
      (filters.salesperson === "all" || row.salespersonName === filters.salesperson) &&
      (filters.teamType === "all" || row.teamType === filters.teamType)
  );

export const filterHomePages = (data: HomeAppData, filters: HomeFilters): HomeSalesByPage[] =>
  data.pages.filter(
    (row) =>
      row.reportDate >= filters.range.from &&
      row.reportDate <= filters.range.to &&
      (filters.shift === "all" || row.shiftType === filters.shift) &&
      (filters.page === "all" || row.pageName === filters.page)
  );

export interface HomeKpis {
  totalRevenue: number;
  totalOrders: number;
  morningRevenue: number;
  morningOrders: number;
  eveningRevenue: number;
  eveningOrders: number;
  averageOrderValue: number | null;
  salespeopleCount: number;
  pagesCount: number;
}

// Headline totals are sourced from the salespeople rows (validated equal to
// the pages rows' totals at upload time) - pages are used for page-level
// breakdowns instead.
export const calculateHomeKpis = (salespeople: HomeSalesBySalesperson[], pages: HomeSalesByPage[]): HomeKpis => {
  const morning = salespeople.filter((row) => row.shiftType === "Morning");
  const evening = salespeople.filter((row) => row.shiftType === "Evening");
  const totalRevenue = salespeople.reduce((sum, row) => sum + row.revenue, 0);
  const totalOrders = salespeople.reduce((sum, row) => sum + row.orders, 0);
  return {
    totalRevenue,
    totalOrders,
    morningRevenue: morning.reduce((sum, row) => sum + row.revenue, 0),
    morningOrders: morning.reduce((sum, row) => sum + row.orders, 0),
    eveningRevenue: evening.reduce((sum, row) => sum + row.revenue, 0),
    eveningOrders: evening.reduce((sum, row) => sum + row.orders, 0),
    averageOrderValue: totalOrders ? totalRevenue / totalOrders : null,
    salespeopleCount: new Set(salespeople.map((row) => row.salespersonCode || row.salespersonName)).size,
    pagesCount: new Set(pages.map((row) => row.pageName)).size
  };
};

export interface HomeTrendPoint {
  date: string;
  revenue: number;
  orders: number;
  morningRevenue: number;
  eveningRevenue: number;
}

export const homeDailyTrend = (salespeople: HomeSalesBySalesperson[]): HomeTrendPoint[] => {
  const byDate = new Map<string, HomeTrendPoint>();
  for (const row of salespeople) {
    const entry = byDate.get(row.reportDate) ?? { date: row.reportDate, revenue: 0, orders: 0, morningRevenue: 0, eveningRevenue: 0 };
    entry.revenue += row.revenue;
    entry.orders += row.orders;
    if (row.shiftType === "Morning") entry.morningRevenue += row.revenue;
    else entry.eveningRevenue += row.revenue;
    byDate.set(row.reportDate, entry);
  }
  return [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date));
};

export interface HomeRankedRow {
  id: string;
  name: string;
  orders: number;
  revenue: number;
}

export const aggregateHomeSalespeople = (rows: HomeSalesBySalesperson[]): Array<HomeRankedRow & { teamType: string }> => {
  const byName = new Map<string, HomeRankedRow & { teamType: string }>();
  for (const row of rows) {
    const key = row.salespersonCode || row.salespersonName;
    const entry = byName.get(key) ?? { id: key, name: row.salespersonName || row.salespersonCode, teamType: row.teamType, orders: 0, revenue: 0 };
    entry.orders += row.orders;
    entry.revenue += row.revenue;
    byName.set(key, entry);
  }
  return [...byName.values()].sort((a, b) => b.revenue - a.revenue);
};

export const aggregateHomePages = (rows: HomeSalesByPage[]): HomeRankedRow[] => {
  const byName = new Map<string, HomeRankedRow>();
  for (const row of rows) {
    const entry = byName.get(row.pageName) ?? { id: row.pageName, name: row.pageName, orders: 0, revenue: 0 };
    entry.orders += row.orders;
    entry.revenue += row.revenue;
    byName.set(row.pageName, entry);
  }
  return [...byName.values()].sort((a, b) => b.revenue - a.revenue);
};

export interface HomePeriodTotal {
  period: string;
  orders: number;
  revenue: number;
}

// Shared by Daily/Monthly/Yearly totals - periodKey slices the ISO date
// string (full date, "YYYY-MM", or "YYYY").
export const homeTotalsByPeriod = (rows: HomeSalesBySalesperson[], periodKey: (date: string) => string): HomePeriodTotal[] => {
  const byPeriod = new Map<string, HomePeriodTotal>();
  for (const row of rows) {
    const key = periodKey(row.reportDate);
    const entry = byPeriod.get(key) ?? { period: key, orders: 0, revenue: 0 };
    entry.orders += row.orders;
    entry.revenue += row.revenue;
    byPeriod.set(key, entry);
  }
  return [...byPeriod.values()].sort((a, b) => a.period.localeCompare(b.period));
};

export const aggregateHomeTeams = (rows: HomeSalesBySalesperson[]): HomeRankedRow[] => {
  const byTeam = new Map<string, HomeRankedRow>();
  for (const row of rows) {
    const key = row.teamType || "Unassigned";
    const entry = byTeam.get(key) ?? { id: key, name: key, orders: 0, revenue: 0 };
    entry.orders += row.orders;
    entry.revenue += row.revenue;
    byTeam.set(key, entry);
  }
  return [...byTeam.values()].sort((a, b) => b.revenue - a.revenue);
};
