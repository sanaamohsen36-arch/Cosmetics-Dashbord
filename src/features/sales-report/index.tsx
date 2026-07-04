"use client";

import type { AppData, DateRange } from "../../types";
import { aggregatePeople, aggregatePlatforms, filterPeople, filterPlatforms } from "../../lib/metrics";
import { integer, money, percent } from "../../lib/format";
import { makePeriodRange } from "../../lib/date";
import { DateFilters, SimpleTable } from "../../lib/ui";

export function SalesReportsPage({ data, range, setRange, hideFilters = false }: { data: AppData; range: DateRange; setRange: (range: DateRange) => void; hideFilters?: boolean }) {
  const people = aggregatePeople(filterPeople(data, range));
  const platforms = aggregatePlatforms(filterPlatforms(data, range));
  const totals = {
    orders: people.reduce((sum, row) => sum + row.totalOrders, 0),
    revenue: people.reduce((sum, row) => sum + row.totalRevenue, 0)
  };
  const dates = [...new Set(data.salesBySalesperson.map((row) => row.reportDate))].sort();

  return (
    <div className="dashboard-stack">
      {!hideFilters && <DateFilters range={range} mode="day" onRangeChange={setRange} onModeChange={(mode) => setRange(makePeriodRange(range.from, mode))} />}
      <SimpleTable title="Sales by Salesperson" headers={["Rank", "Salesperson", "Code", "Morning Orders", "Morning Revenue", "Evening Orders", "Evening Revenue", "Total Orders", "Total Revenue", "Order Share", "Revenue Share", "AOV"]}>
        {people.map((row, index) => (
          <tr key={row.id}>
            <td>{index + 1}</td>
            <td>{row.salespersonName}</td>
            <td>{row.salespersonCode}</td>
            <td>{integer(row.morningOrders)}</td>
            <td>{money(row.morningRevenue)}</td>
            <td>{integer(row.eveningOrders)}</td>
            <td>{money(row.eveningRevenue)}</td>
            <td>{integer(row.totalOrders)}</td>
            <td>{money(row.totalRevenue)}</td>
            <td>{percent(totals.orders ? (row.totalOrders / totals.orders) * 100 : 0)}</td>
            <td>{percent(totals.revenue ? (row.totalRevenue / totals.revenue) * 100 : 0)}</td>
            <td>{money(row.totalOrders ? row.totalRevenue / row.totalOrders : null)}</td>
          </tr>
        ))}
      </SimpleTable>
      <SimpleTable title="Sales by Page / Platform" headers={["Page", "Morning Orders", "Morning Revenue", "Evening Orders", "Evening Revenue", "Total Orders", "Total Revenue", "Order Share", "Revenue Share", "AOV"]}>
        {platforms.map((row) => (
          <tr key={row.id}>
            <td>{row.platformName}</td>
            <td>{integer(row.morningOrders)}</td>
            <td>{money(row.morningRevenue)}</td>
            <td>{integer(row.eveningOrders)}</td>
            <td>{money(row.eveningRevenue)}</td>
            <td>{integer(row.totalOrders)}</td>
            <td>{money(row.totalRevenue)}</td>
            <td>{percent(totals.orders ? (row.totalOrders / totals.orders) * 100 : 0)}</td>
            <td>{percent(totals.revenue ? (row.totalRevenue / totals.revenue) * 100 : 0)}</td>
            <td>{money(row.totalOrders ? row.totalRevenue / row.totalOrders : null)}</td>
          </tr>
        ))}
      </SimpleTable>
      <SimpleTable title="Daily Sales Summary" headers={["Date", "Orders", "Revenue"]}>
        {dates.map((date) => {
          const rows = data.salesBySalesperson.filter((row) => row.reportDate === date);
          return (
            <tr key={date}>
              <td>{date}</td>
              <td>{integer(rows.reduce((sum, row) => sum + row.totalOrders, 0))}</td>
              <td>{money(rows.reduce((sum, row) => sum + row.totalRevenue, 0))}</td>
            </tr>
          );
        })}
      </SimpleTable>
    </div>
  );
}
