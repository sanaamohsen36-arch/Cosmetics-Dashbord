"use client";

import { useMemo, useState } from "react";
import type { DateRange, HomeAppData, ShiftType } from "../../types";
import { filterHomeSalespeople } from "../../lib/homeMetrics";
import { integer, money } from "../../lib/format";
import { makePeriodRange } from "../../lib/date";
import { DateFilters, SimpleTable } from "../../lib/ui";

export function HomeSalesReportPage({ data, range, setRange }: { data: HomeAppData; range: DateRange; setRange: (range: DateRange) => void }) {
  const [shift, setShift] = useState<"all" | ShiftType>("all");
  const [salesperson, setSalesperson] = useState("all");
  const [teamType, setTeamType] = useState("all");

  const rows = useMemo(
    () => filterHomeSalespeople(data, { range, shift, page: "all", salesperson, teamType }),
    [data, range, shift, salesperson, teamType]
  );
  const allSalespersonNames = [...new Set(data.salespeople.map((row) => row.salespersonName).filter(Boolean))].sort();
  const allTeamTypes = [...new Set(data.salespeople.map((row) => row.teamType).filter(Boolean))].sort();

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
      <SimpleTable title="Home Sales Report" headers={["Date", "Shift", "Code", "Salesperson", "Team", "Orders", "Revenue", "AOV"]}>
        {rows.map((row) => (
          <tr key={row.id}>
            <td>{row.reportDate}</td>
            <td>{row.shiftType}</td>
            <td>{row.salespersonCode}</td>
            <td>{row.salespersonName}</td>
            <td>{row.teamType}</td>
            <td>{integer(row.orders)}</td>
            <td>{money(row.revenue)}</td>
            <td>{money(row.orders ? row.revenue / row.orders : null)}</td>
          </tr>
        ))}
      </SimpleTable>
    </div>
  );
}
