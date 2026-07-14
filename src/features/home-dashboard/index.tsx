"use client";

import { useMemo, useState } from "react";
import { Bar, BarChart, CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { DateRange, HomeAppData, ShiftType } from "../../types";
import {
  aggregateHomePages,
  aggregateHomeSalespeople,
  aggregateHomeTeams,
  calculateHomeKpis,
  filterHomePages,
  filterHomeSalespeople,
  homeDailyTrend,
  homeTotalsByPeriod
} from "../../lib/homeMetrics";
import { chartTooltipStyle, integer, money } from "../../lib/format";
import { ChartPanel, KpiCard, SimpleTable } from "../../lib/ui";

// Phase 2 (Home workspace). Same visual style/components as Cosmetics'
// Dashboard, over Home's own shift-based data - no Brand dimension exists.
export function HomeDashboardPage({ data, range }: { data: HomeAppData; range: DateRange }) {
  const [shift, setShift] = useState<"all" | ShiftType>("all");
  const [page, setPage] = useState("all");
  const [salesperson, setSalesperson] = useState("all");
  const [teamType, setTeamType] = useState("all");

  const filters = { range, shift, page, salesperson, teamType };
  const salespeople = useMemo(() => filterHomeSalespeople(data, filters), [data, range, shift, page, salesperson, teamType]);
  const pages = useMemo(() => filterHomePages(data, filters), [data, range, shift, page, salesperson, teamType]);
  const kpis = useMemo(() => calculateHomeKpis(salespeople, pages), [salespeople, pages]);
  const trend = useMemo(() => homeDailyTrend(salespeople), [salespeople]);
  const salespeopleRanking = useMemo(() => aggregateHomeSalespeople(salespeople), [salespeople]);
  const pagesRanking = useMemo(() => aggregateHomePages(pages), [pages]);
  const teamsRanking = useMemo(() => aggregateHomeTeams(salespeople), [salespeople]);
  const dailyTotals = useMemo(() => homeTotalsByPeriod(salespeople, (date) => date), [salespeople]);
  const monthlyTotals = useMemo(() => homeTotalsByPeriod(salespeople, (date) => date.slice(0, 7)), [salespeople]);
  const yearlyTotals = useMemo(() => homeTotalsByPeriod(salespeople, (date) => date.slice(0, 4)), [salespeople]);

  const shiftComparison = [
    { name: "Morning", revenue: kpis.morningRevenue, orders: kpis.morningOrders },
    { name: "Evening", revenue: kpis.eveningRevenue, orders: kpis.eveningOrders }
  ];

  const allPageNames = [...new Set(data.pages.map((row) => row.pageName))].sort();
  const allSalespersonNames = [...new Set(data.salespeople.map((row) => row.salespersonName).filter(Boolean))].sort();
  const allTeamTypes = [...new Set(data.salespeople.map((row) => row.teamType).filter(Boolean))].sort();

  return (
    <div className="dashboard-stack">
      <section className="panel">
        <div className="date-controls">
          <label>
            Shift
            <select value={shift} onChange={(event) => setShift(event.target.value as "all" | ShiftType)}>
              <option value="all">All</option>
              <option value="Morning">Morning</option>
              <option value="Evening">Evening</option>
            </select>
          </label>
          <label>
            Page
            <select value={page} onChange={(event) => setPage(event.target.value)}>
              <option value="all">All</option>
              {allPageNames.map((name) => <option key={name}>{name}</option>)}
            </select>
          </label>
          <label>
            Salesperson
            <select value={salesperson} onChange={(event) => setSalesperson(event.target.value)}>
              <option value="all">All</option>
              {allSalespersonNames.map((name) => <option key={name}>{name}</option>)}
            </select>
          </label>
          <label>
            Team Type
            <select value={teamType} onChange={(event) => setTeamType(event.target.value)}>
              <option value="all">All</option>
              {allTeamTypes.map((name) => <option key={name}>{name}</option>)}
            </select>
          </label>
        </div>
      </section>
      <section className="kpi-grid">
        <KpiCard label="Total Revenue" value={money(kpis.totalRevenue)} />
        <KpiCard label="Total Orders" value={integer(kpis.totalOrders)} />
        <KpiCard label="Morning Revenue" value={money(kpis.morningRevenue)} />
        <KpiCard label="Morning Orders" value={integer(kpis.morningOrders)} />
        <KpiCard label="Evening Revenue" value={money(kpis.eveningRevenue)} />
        <KpiCard label="Evening Orders" value={integer(kpis.eveningOrders)} />
        <KpiCard label="Average Order Value" value={money(kpis.averageOrderValue)} />
        <KpiCard label="Number of Salespeople" value={integer(kpis.salespeopleCount)} />
        <KpiCard label="Number of Pages" value={integer(kpis.pagesCount)} />
      </section>
      <section className="content-grid">
        <ChartPanel title="Revenue + Orders Trend">
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
        <ChartPanel title="Morning vs Evening">
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={shiftComparison}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1f2a3b" />
              <XAxis dataKey="name" stroke="#94a3b8" />
              <YAxis stroke="#94a3b8" />
              <Tooltip contentStyle={chartTooltipStyle} />
              <Bar dataKey="revenue" fill="#0ea5e9" radius={[8, 8, 0, 0]} />
              <Bar dataKey="orders" fill="#34d399" radius={[8, 8, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartPanel>
        <ChartPanel title="Salesperson ranking">
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={salespeopleRanking.slice(0, 8)}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1f2a3b" />
              <XAxis dataKey="name" stroke="#94a3b8" />
              <YAxis stroke="#94a3b8" />
              <Tooltip contentStyle={chartTooltipStyle} />
              <Bar dataKey="revenue" fill="#38bdf8" radius={[8, 8, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartPanel>
        <ChartPanel title="Page ranking">
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={pagesRanking.slice(0, 8)}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1f2a3b" />
              <XAxis dataKey="name" stroke="#94a3b8" />
              <YAxis stroke="#94a3b8" />
              <Tooltip contentStyle={chartTooltipStyle} />
              <Bar dataKey="revenue" fill="#34d399" radius={[8, 8, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartPanel>
        <ChartPanel title="Team Type performance">
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={teamsRanking}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1f2a3b" />
              <XAxis dataKey="name" stroke="#94a3b8" />
              <YAxis stroke="#94a3b8" />
              <Tooltip contentStyle={chartTooltipStyle} />
              <Bar dataKey="revenue" fill="#0ea5e9" radius={[8, 8, 0, 0]} />
              <Bar dataKey="orders" fill="#34d399" radius={[8, 8, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartPanel>
        <SimpleTable title="Top Salespeople" headers={["Rank", "Name", "Team", "Orders", "Revenue"]}>
          {salespeopleRanking.slice(0, 10).map((row, index) => (
            <tr key={row.id}>
              <td>{index + 1}</td>
              <td>{row.name}</td>
              <td>{row.teamType}</td>
              <td>{integer(row.orders)}</td>
              <td>{money(row.revenue)}</td>
            </tr>
          ))}
        </SimpleTable>
        <SimpleTable title="Top Pages" headers={["Page", "Orders", "Revenue", "AOV"]}>
          {pagesRanking.slice(0, 10).map((row) => (
            <tr key={row.id}>
              <td>{row.name}</td>
              <td>{integer(row.orders)}</td>
              <td>{money(row.revenue)}</td>
              <td>{money(row.orders ? row.revenue / row.orders : null)}</td>
            </tr>
          ))}
        </SimpleTable>
        <SimpleTable title="Daily Totals" headers={["Date", "Orders", "Revenue"]}>
          {dailyTotals.map((row) => (
            <tr key={row.period}>
              <td>{row.period}</td>
              <td>{integer(row.orders)}</td>
              <td>{money(row.revenue)}</td>
            </tr>
          ))}
        </SimpleTable>
        <SimpleTable title="Monthly Totals" headers={["Month", "Orders", "Revenue"]}>
          {monthlyTotals.map((row) => (
            <tr key={row.period}>
              <td>{row.period}</td>
              <td>{integer(row.orders)}</td>
              <td>{money(row.revenue)}</td>
            </tr>
          ))}
        </SimpleTable>
        <SimpleTable title="Yearly Totals" headers={["Year", "Orders", "Revenue"]}>
          {yearlyTotals.map((row) => (
            <tr key={row.period}>
              <td>{row.period}</td>
              <td>{integer(row.orders)}</td>
              <td>{money(row.revenue)}</td>
            </tr>
          ))}
        </SimpleTable>
      </section>
    </div>
  );
}
