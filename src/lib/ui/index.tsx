import { useState } from "react";
import type { ReactNode } from "react";
import type { DateRange } from "../../types";
import { formatMonthLabel, monthDays } from "../date";

export function DateFilters({
  range,
  mode,
  onRangeChange,
  onModeChange
}: {
  range: DateRange;
  mode: "day" | "week" | "month";
  onRangeChange: (range: DateRange) => void;
  onModeChange: (mode: "day" | "week" | "month") => void;
}) {
  return (
    <div className="date-controls">
      <label>
        من
        <input type="date" value={range.from} onChange={(event) => onRangeChange({ ...range, from: event.target.value })} />
      </label>
      <label>
        إلى
        <input type="date" value={range.to} onChange={(event) => onRangeChange({ ...range, to: event.target.value })} />
      </label>
      {(["day", "week", "month"] as const).map((item) => (
        <button key={item} className={mode === item ? "primary" : ""} onClick={() => onModeChange(item)}>
          {item === "day" ? "يوم" : item === "week" ? "أسبوع" : "شهر"}
        </button>
      ))}
    </div>
  );
}

export function CalendarMonth({
  selectedDate,
  uploadedDates,
  onSelect
}: {
  selectedDate: string;
  uploadedDates: Set<string>;
  onSelect: (date: string) => void;
}) {
  const days = monthDays(selectedDate);
  return (
    <div className="folder-calendar">
      {days.map((date) => {
        const uploaded = uploadedDates.has(date);
        return (
          <button
            key={date}
            className={`folder-day ${selectedDate === date ? "selected" : ""} ${uploaded ? "uploaded" : "missing"}`}
            onClick={() => onSelect(date)}
          >
            <strong>{new Date(`${date}T00:00:00`).getDate()}</strong>
            <span>{date}</span>
            <small>{uploaded ? "Uploaded" : "Empty"}</small>
          </button>
        );
      })}
    </div>
  );
}

// Month-first navigation: folder cards for each month of a browsable year
// (with prev/next year controls), so a day calendar is always reached by
// picking its month first instead of only ever showing whatever month
// `today` happens to fall in with no way to move to another one.
export function MonthFolderList({
  selectedMonth,
  onSelect,
  isMonthUploaded
}: {
  selectedMonth: string;
  onSelect: (monthKey: string) => void;
  isMonthUploaded: (monthKey: string) => boolean;
}) {
  const [visibleYear, setVisibleYear] = useState(Number(selectedMonth.slice(0, 4)));
  const months = Array.from({ length: 12 }, (_, index) => `${visibleYear}-${String(index + 1).padStart(2, "0")}`);

  return (
    <div className="month-folder-list">
      <div className="month-folder-toolbar">
        <button className="ghost" onClick={() => setVisibleYear((year) => year - 1)}>‹</button>
        <strong>{visibleYear}</strong>
        <button className="ghost" onClick={() => setVisibleYear((year) => year + 1)}>›</button>
      </div>
      <div className="month-folder-grid">
        {months.map((month) => (
          <button
            key={month}
            className={`month-folder ${month === selectedMonth ? "selected" : ""} ${isMonthUploaded(month) ? "has-data" : ""}`}
            onClick={() => onSelect(month)}
          >
            {formatMonthLabel(month)}
          </button>
        ))}
      </div>
    </div>
  );
}

export function ErrorList({ errors }: { errors: string[] }) {
  return (
    <div className="notice error-note">
      <strong>Parsing errors</strong>
      {errors.map((error) => <span key={error}>{error}</span>)}
    </div>
  );
}

export function KpiCard({ label, value }: { label: string; value: string }) {
  return (
    <article className="kpi-card">
      <span>{label}</span>
      <strong>{value}</strong>
    </article>
  );
}

export function ChartPanel({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="panel chart-panel">
      <h2>{title}</h2>
      {children}
    </section>
  );
}

export function SimpleTable({ title, headers, children }: { title: string; headers: string[]; children: ReactNode }) {
  return (
    <section className="panel table-panel">
      <h2>{title}</h2>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>{headers.map((header) => <th key={header}>{header}</th>)}</tr>
          </thead>
          <tbody>{children}</tbody>
        </table>
      </div>
    </section>
  );
}

export function Badge({ text }: { text: string }) {
  return <span className="badge">{text}</span>;
}
