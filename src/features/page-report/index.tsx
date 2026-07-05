"use client";

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
import type { AdsRow, AppData, DateRange } from "../../types";
import { aggregateAdsByDate, aggregateAdsByPlatform, aggregatePlatforms, dailyTrend, filterAds, filterPeople, filterPlatforms } from "../../lib/metrics";
import { chartTooltipStyle, integer, money, percent, ratio } from "../../lib/format";
import { makePeriodRange } from "../../lib/date";
import { ChartPanel, DateFilters, KpiCard, SimpleTable } from "../../lib/ui";

export function PageReportPage({ data, range, setRange }: { data: AppData; range: DateRange; setRange: (range: DateRange) => void }) {
  const platforms = aggregatePlatforms(filterPlatforms(data, range));
  const adsRows = filterAds(data, range);
  const adsByPlatform = aggregateAdsByPlatform(adsRows);
  const salesTotal = platforms.reduce((sum, row) => sum + row.totalRevenue, 0);
  const ordersTotal = platforms.reduce((sum, row) => sum + row.totalOrders, 0);
  const trend = dailyTrend(filterPeople(data, range), adsRows);

  return (
    <div className="dashboard-stack">
      <DateFilters range={range} mode="day" onRangeChange={setRange} onModeChange={(mode) => setRange(makePeriodRange(range.from, mode))} />
      <section className="kpi-grid small">
        <KpiCard label="Page Sales" value={money(salesTotal)} />
        <KpiCard label="Page Orders" value={integer(ordersTotal)} />
        <KpiCard label="Ads Spend" value={money(adsRows.reduce((sum, row) => sum + row.spend, 0))} />
        <KpiCard label="Best Page" value={platforms[0]?.platformName || "لا يوجد"} />
      </section>
      <section className="content-grid">
        <ChartPanel title="Page sales trend">
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
        <ChartPanel title="Ads spend by platform">
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={adsByPlatform}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1f2a3b" />
              <XAxis dataKey="platform" stroke="#94a3b8" />
              <YAxis stroke="#94a3b8" />
              <Tooltip contentStyle={chartTooltipStyle} />
              <Bar dataKey="spend" fill="#0ea5e9" radius={[8, 8, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartPanel>
      </section>
      <SimpleTable title="Page performance" headers={["Page", "Orders", "Revenue", "Order Share", "Revenue Share", "AOV", "Related Spend", "ROAS", "CPA", "Spend Ratio"]}>
        {platforms.map((row) => {
          const relatedSpend = adsRows
            .filter((ad) => ad.salesPlatformName === row.platformName || ad.adAccountName === row.platformName)
            .reduce((sum, ad) => sum + ad.spend, 0);
          return (
            <tr key={row.id}>
              <td>{row.platformName}</td>
              <td>{integer(row.totalOrders)}</td>
              <td>{money(row.totalRevenue)}</td>
              <td>{percent(ordersTotal ? (row.totalOrders / ordersTotal) * 100 : 0)}</td>
              <td>{percent(salesTotal ? (row.totalRevenue / salesTotal) * 100 : 0)}</td>
              <td>{money(row.totalOrders ? row.totalRevenue / row.totalOrders : null)}</td>
              <td>{money(relatedSpend)}</td>
              <td>{ratio(relatedSpend ? row.totalRevenue / relatedSpend : null)}</td>
              <td>{money(row.totalOrders && relatedSpend ? relatedSpend / row.totalOrders : null)}</td>
              <td>{percent(row.totalRevenue ? (relatedSpend / row.totalRevenue) * 100 : null)}</td>
            </tr>
          );
        })}
      </SimpleTable>
      <SimpleTable title="Ads platform comparison" headers={["Platform", "Spend", "Messages", "Comments", "Results", "Cost / Result"]}>
        {adsByPlatform.map((row) => (
          <tr key={row.platform}>
            <td>{row.platform}</td>
            <td>{money(row.spend)}</td>
            <td>{integer(row.messages)}</td>
            <td>{integer(row.comments)}</td>
            <td>{integer(row.results)}</td>
            <td>{money(row.results ? row.spend / row.results : null)}</td>
          </tr>
        ))}
      </SimpleTable>
    </div>
  );
}

// Not currently reachable from any nav item - carried over as-is from the
// pre-restructure "Reports" page (docs/ARCHITECTURE.md section 8 flags this
// as an unresolved product decision: fold into Page Report above, or expose
// as its own view). Preserved, not deleted, and not wired in without that
// decision being made explicitly.
export function AdsReportsPage({ data, range, setRange, hideFilters = false }: { data: AppData; range: DateRange; setRange: (range: DateRange) => void; hideFilters?: boolean }) {
  const meta = data.metaAds.filter((row) => row.reportDate >= range.from && row.reportDate <= range.to);
  const tiktok = data.tiktokAds.filter((row) => row.reportDate >= range.from && row.reportDate <= range.to);
  const combined = aggregateAdsByDate([...meta, ...tiktok]);
  const byBrand = aggregateAdsByBrand([...meta, ...tiktok]);
  const byPlatform = aggregateAdsByPlatform([...meta, ...tiktok]);

  return (
    <div className="dashboard-stack">
      {!hideFilters && <DateFilters range={range} mode="day" onRangeChange={setRange} onModeChange={(mode) => setRange(makePeriodRange(range.from, mode))} />}
      <SimpleTable title="Ads by brand" headers={["Brand", "Spend", "Messages", "Comments", "Results", "Cost / Result"]}>
        {byBrand.map((row) => (
          <tr key={row.brand}>
            <td>{row.brand}</td>
            <td>{money(row.spend)}</td>
            <td>{integer(row.messages)}</td>
            <td>{integer(row.comments)}</td>
            <td>{integer(row.results)}</td>
            <td>{money(row.results ? row.spend / row.results : null)}</td>
          </tr>
        ))}
      </SimpleTable>
      <SimpleTable title="Ads by platform" headers={["Platform", "Spend", "Messages", "Comments", "Results", "Cost / Result"]}>
        {byPlatform.map((row) => (
          <tr key={row.platform}>
            <td>{row.platform}</td>
            <td>{money(row.spend)}</td>
            <td>{integer(row.messages)}</td>
            <td>{integer(row.comments)}</td>
            <td>{integer(row.results)}</td>
            <td>{money(row.results ? row.spend / row.results : null)}</td>
          </tr>
        ))}
      </SimpleTable>
      <SimpleTable title="Meta Ads" headers={["Date", "Campaign", "Ad set", "Ad", "Spend", "Impressions", "Reach", "Clicks", "CTR", "CPC", "CPM", "Leads", "Purchases", "Purchase value"]}>
        {meta.map((row) => <AdsRowView key={row.id} row={row} meta />)}
      </SimpleTable>
      <SimpleTable title="TikTok Ads" headers={["Date", "Campaign", "Ad group", "Ad", "Spend", "Impressions", "Clicks", "CTR", "CPC", "CPM", "Conversions", "Cost / Conversion", "Revenue"]}>
        {tiktok.map((row) => <AdsRowView key={row.id} row={row} />)}
      </SimpleTable>
      <SimpleTable title="Combined Ads Summary" headers={["Date", "Meta spend", "TikTok spend", "Total spend", "Total sales", "Total orders", "ROAS", "ROI", "CPA"]}>
        {combined.map((row) => {
          const people = data.salesBySalesperson.filter((item) => item.reportDate === row.date);
          const sales = people.reduce((sum, item) => sum + item.totalRevenue, 0);
          const orders = people.reduce((sum, item) => sum + item.totalOrders, 0);
          return (
            <tr key={row.date}>
              <td>{row.date}</td>
              <td>{money(row.metaSpend)}</td>
              <td>{money(row.tiktokSpend)}</td>
              <td>{money(row.totalSpend)}</td>
              <td>{money(sales)}</td>
              <td>{integer(orders)}</td>
              <td>{ratio(row.totalSpend ? sales / row.totalSpend : null)}</td>
              <td>{percent(row.totalSpend ? ((sales - row.totalSpend) / row.totalSpend) * 100 : null)}</td>
              <td>{money(orders ? row.totalSpend / orders : null)}</td>
            </tr>
          );
        })}
      </SimpleTable>
    </div>
  );
}

function AdsRowView({ row, meta = false }: { row: AdsRow; meta?: boolean }) {
  return (
    <tr>
      <td>{row.reportDate}</td>
      <td>{row.campaignName}</td>
      <td>{row.adsetName}</td>
      <td>{row.adName}</td>
      <td>{money(row.spend)}</td>
      <td>{integer(row.impressions)}</td>
      {meta && <td>{integer(row.reach)}</td>}
      <td>{integer(row.clicks)}</td>
      <td>{ratio(row.ctr)}</td>
      <td>{money(row.cpc)}</td>
      <td>{money(row.cpm)}</td>
      <td>{integer(row.leads)}</td>
      <td>{integer(row.purchases)}</td>
      <td>{money(row.purchaseValue)}</td>
    </tr>
  );
}

const aggregateAdsByBrand = (rows: AdsRow[]) => {
  const map = new Map<string, { brand: string; spend: number; messages: number; comments: number; results: number }>();
  for (const row of rows) {
    const brand = row.salesPlatformName || "عام";
    const item = map.get(brand) ?? { brand, spend: 0, messages: 0, comments: 0, results: 0 };
    item.spend += row.spend;
    item.messages += Number(row.messagesCount) || 0;
    item.comments += Number(row.commentsCount) || 0;
    item.results += Number(row.resultsCount) || row.leads || row.purchases || 0;
    map.set(brand, item);
  }
  return [...map.values()].sort((a, b) => b.spend - a.spend);
};
