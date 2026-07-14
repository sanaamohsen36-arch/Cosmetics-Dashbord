"use client";

import { useMemo, useState } from "react";
import type { DateRange, HomeAppData, ShiftType } from "../../types";
import { filterHomePages } from "../../lib/homeMetrics";
import { integer, money } from "../../lib/format";
import { makePeriodRange } from "../../lib/date";
import { DateFilters, SimpleTable } from "../../lib/ui";

export function HomePageReportPage({ data, range, setRange }: { data: HomeAppData; range: DateRange; setRange: (range: DateRange) => void }) {
  const [shift, setShift] = useState<"all" | ShiftType>("all");
  const [page, setPage] = useState("all");

  const rows = useMemo(
    () => filterHomePages(data, { range, shift, page, salesperson: "all", teamType: "all" }),
    [data, range, shift, page]
  );
  const allPageNames = [...new Set(data.pages.map((row) => row.pageName))].sort();

  return (
    <div className="dashboard-stack">
      <section className="panel">
        <DateFilters range={range} mode="day" onRangeChange={setRange} onModeChange={(mode) => setRange(makePeriodRange(range.from, mode))} />
        <div className="form-row">
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
        </div>
      </section>
      <SimpleTable title="Home Page Report" headers={["Date", "Shift", "Page", "Orders", "Revenue", "AOV"]}>
        {rows.map((row) => (
          <tr key={row.id}>
            <td>{row.reportDate}</td>
            <td>{row.shiftType}</td>
            <td>{row.pageName}</td>
            <td>{integer(row.orders)}</td>
            <td>{money(row.revenue)}</td>
            <td>{money(row.orders ? row.revenue / row.orders : null)}</td>
          </tr>
        ))}
      </SimpleTable>
    </div>
  );
}
