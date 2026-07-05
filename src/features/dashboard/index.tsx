"use client";

import { useMemo, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from "recharts";
import type { AppData, DateRange } from "../../types";
import {
  aggregateAdsByPlatform,
  aggregatePeople,
  aggregatePlatforms,
  calculateKpis,
  dailyTrend,
  filterAds,
  filterPeople,
  filterPlatforms
} from "../../lib/metrics";
import { chartTooltipStyle, integer, money, percent, ratio } from "../../lib/format";
import { ChartPanel, KpiCard, SimpleTable } from "../../lib/ui";
import { adsPlatformOptions } from "../../lib/constants";

export function DashboardPage({ data, range }: { data: AppData; range: DateRange }) {
  const [salesperson, setSalesperson] = useState("all");
  const [platform, setPlatform] = useState("all");
  const [brand, setBrand] = useState("all");
  const [adsPlatform, setAdsPlatform] = useState("all");
  const scopedData = useMemo(() => scopeData(data, range, salesperson, platform, brand, adsPlatform), [data, range, salesperson, platform, brand, adsPlatform]);
  const kpis = useMemo(() => calculateKpis(scopedData, range), [scopedData, range]);
  const resultCount = useMemo(() => filterAds(scopedData, range).reduce((sum, row) => sum + (Number(row.resultsCount) || Number(row.leads) || Number(row.purchases) || 0), 0), [scopedData, range]);
  const costPerResult = resultCount ? kpis.totalAdsSpend / resultCount : null;
  const trend = useMemo(() => dailyTrend(filterPeople(scopedData, range), filterAds(scopedData, range)), [scopedData, range]);
  const people = useMemo(() => aggregatePeople(filterPeople(scopedData, range)), [scopedData, range]);
  const platforms = useMemo(() => aggregatePlatforms(filterPlatforms(scopedData, range)), [scopedData, range]);
  const adsPlatformChart = useMemo(() => aggregateAdsByPlatform(filterAds(scopedData, range)), [scopedData, range]);

  return (
    <div className="dashboard-stack">
      <section className="panel">
        <div className="date-controls">
          <label>
            Salesperson
            <select value={salesperson} onChange={(event) => setSalesperson(event.target.value)}>
              <option value="all">All</option>
              {[...new Set(data.salesBySalesperson.map((row) => row.salespersonName).filter(Boolean))].map((name) => <option key={name}>{name}</option>)}
            </select>
          </label>
          <label>
            Page / Platform
            <select value={platform} onChange={(event) => setPlatform(event.target.value)}>
              <option value="all">All</option>
              {[...new Set(data.salesByPlatform.map((row) => row.platformName).filter(Boolean))].map((name) => <option key={name}>{name}</option>)}
            </select>
          </label>
          <label>
            Ads platform
            <select value={adsPlatform} onChange={(event) => setAdsPlatform(event.target.value)}>
              <option value="all">All</option>
              {[...new Set([...adsPlatformOptions, ...data.adsRawFiles.map((file) => file.adAccountName || "").filter(Boolean)])].map((name) => <option key={name}>{name}</option>)}
            </select>
          </label>
          <label>
            Brand
            {/* Settings -> Manage Brands (data.brands) is the single source of
                truth - never inferred from uploaded files/pages/salespeople. */}
            <select value={brand} onChange={(event) => setBrand(event.target.value)}>
              <option value="all">All</option>
              {data.brands.filter((item) => item.active).map((item) => <option key={item.id}>{item.name}</option>)}
            </select>
          </label>
        </div>
      </section>
      <section className="kpi-grid">
        <KpiCard label="Total Sales Revenue" value={money(kpis.totalSalesRevenue)} />
        <KpiCard label="Total Orders" value={integer(kpis.totalOrders)} />
        <KpiCard label="Morning Orders" value={integer(kpis.morningOrders)} />
        <KpiCard label="Evening Orders" value={integer(kpis.eveningOrders)} />
        <KpiCard label="Morning Revenue" value={money(kpis.morningRevenue)} />
        <KpiCard label="Evening Revenue" value={money(kpis.eveningRevenue)} />
        <KpiCard label="Total Ads Spend" value={money(kpis.totalAdsSpend)} />
        <KpiCard label="Meta Spend" value={money(kpis.metaSpend)} />
        <KpiCard label="TikTok Spend" value={money(kpis.tiktokSpend)} />
        <KpiCard label="ROAS" value={ratio(kpis.roas)} />
        <KpiCard label="ROI" value={percent(kpis.roi)} />
        <KpiCard label="Spend Ratio" value={percent(kpis.spendToSalesRatio)} />
        <KpiCard label="CPA" value={money(kpis.cpa)} />
        <KpiCard label="Messages" value={integer(kpis.messagesCount)} />
        <KpiCard label="Comments" value={integer(kpis.commentsCount)} />
        <KpiCard label="Cost per result" value={money(costPerResult)} />
        <KpiCard label="Average Order Value" value={money(kpis.averageOrderValue)} />
      </section>
      <section className="content-grid">
        <ChartPanel title="Sales + Orders Trend">
          <ResponsiveContainer width="100%" height={280}>
            <LineChart data={trend}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1f2a3b" />
              <XAxis dataKey="date" stroke="#94a3b8" />
              <YAxis stroke="#94a3b8" />
              <Tooltip contentStyle={chartTooltipStyle} />
              <Line type="monotone" dataKey="revenue" stroke="#38bdf8" strokeWidth={3} />
              <Line type="monotone" dataKey="orders" stroke="#34d399" strokeWidth={3} />
            </LineChart>
          </ResponsiveContainer>
        </ChartPanel>
        <ChartPanel title="Ads Spend + ROAS">
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={trend}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1f2a3b" />
              <XAxis dataKey="date" stroke="#94a3b8" />
              <YAxis stroke="#94a3b8" />
              <Tooltip contentStyle={chartTooltipStyle} />
              <Bar dataKey="spend" fill="#0ea5e9" radius={[8, 8, 0, 0]} />
              <Bar dataKey="roas" fill="#34d399" radius={[8, 8, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartPanel>
        <ChartPanel title="Spend by platform">
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={adsPlatformChart}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1f2a3b" />
              <XAxis dataKey="platform" stroke="#94a3b8" />
              <YAxis stroke="#94a3b8" />
              <Tooltip contentStyle={chartTooltipStyle} />
              <Bar dataKey="spend" fill="#0ea5e9" radius={[8, 8, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartPanel>
        <ChartPanel title="Sales by platform">
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={platforms.slice(0, 8)}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1f2a3b" />
              <XAxis dataKey="platformName" stroke="#94a3b8" />
              <YAxis stroke="#94a3b8" />
              <Tooltip contentStyle={chartTooltipStyle} />
              <Bar dataKey="totalRevenue" fill="#34d399" radius={[8, 8, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartPanel>
        <ChartPanel title="Salesperson ranking">
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={people.slice(0, 8)}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1f2a3b" />
              <XAxis dataKey="salespersonName" stroke="#94a3b8" />
              <YAxis stroke="#94a3b8" />
              <Tooltip contentStyle={chartTooltipStyle} />
              <Bar dataKey="totalRevenue" fill="#38bdf8" radius={[8, 8, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartPanel>
        <SimpleTable title="Top Salespeople" headers={["Rank", "Name", "Orders", "Revenue"]}>
          {people.slice(0, 10).map((row, index) => (
            <tr key={row.id}>
              <td>{index + 1}</td>
              <td>{row.salespersonName}</td>
              <td>{integer(row.totalOrders)}</td>
              <td>{money(row.totalRevenue)}</td>
            </tr>
          ))}
        </SimpleTable>
        <SimpleTable title="Top Pages / Platforms" headers={["Page", "Orders", "Revenue", "AOV"]}>
          {platforms.slice(0, 10).map((row) => (
            <tr key={row.id}>
              <td>{row.platformName}</td>
              <td>{integer(row.totalOrders)}</td>
              <td>{money(row.totalRevenue)}</td>
              <td>{money(row.totalOrders ? row.totalRevenue / row.totalOrders : null)}</td>
            </tr>
          ))}
        </SimpleTable>
      </section>
    </div>
  );
}

// Brand filters both Sales and Ads from the same selected value - Sales rows
// carry their own stored brandName (one upload = one brand, section 19),
// never inferred from salesperson/page/platform.
const scopeData = (data: AppData, range: DateRange, salesperson: string, platform: string, brand: string, adsPlatform: string): AppData => ({
  ...data,
  salesBySalesperson: data.salesBySalesperson.filter((row) => row.reportDate >= range.from && row.reportDate <= range.to && (salesperson === "all" || row.salespersonName === salesperson) && (brand === "all" || row.brandName === brand)),
  salesByPlatform: data.salesByPlatform.filter((row) => row.reportDate >= range.from && row.reportDate <= range.to && (platform === "all" || row.platformName === platform) && (brand === "all" || row.brandName === brand)),
  metaAds: data.metaAds.filter((row) => row.reportDate >= range.from && row.reportDate <= range.to && (brand === "all" || row.salesPlatformName === brand) && (adsPlatform === "all" || row.adAccountName === adsPlatform)),
  tiktokAds: data.tiktokAds.filter((row) => row.reportDate >= range.from && row.reportDate <= range.to && (brand === "all" || row.salesPlatformName === brand) && (adsPlatform === "all" || row.adAccountName === adsPlatform))
});
