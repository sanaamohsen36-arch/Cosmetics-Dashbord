import type { DateRange } from "../types";

// Local calendar date, not UTC. date.toISOString() always renders in UTC, so
// for any timezone ahead of UTC (e.g. Cairo, UTC+2) the first couple of hours
// after local midnight would otherwise report yesterday's date.
export const toDateInput = (date: Date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;

export const today = toDateInput(new Date());

export const monthDays = (dateText: string) => {
  const date = new Date(`${dateText}T00:00:00`);
  const year = date.getFullYear();
  const month = date.getMonth();
  const count = new Date(year, month + 1, 0).getDate();
  return Array.from({ length: count }, (_, index) => toDateInput(new Date(year, month, index + 1)));
};

// "YYYY-MM" key for grouping days into month folders.
export const monthKey = (dateText: string) => dateText.slice(0, 7);

export const firstDayOfMonth = (monthKeyText: string) => `${monthKeyText}-01`;

const monthLabelFormat = new Intl.DateTimeFormat("en-US", { month: "long", year: "numeric" });
export const formatMonthLabel = (monthKeyText: string) => monthLabelFormat.format(new Date(`${monthKeyText}-01T00:00:00`));

export const shiftMonthKey = (monthKeyText: string, delta: number) => {
  const [year, month] = monthKeyText.split("-").map(Number);
  const date = new Date(year, month - 1 + delta, 1);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
};

export const makePeriodRange = (dateText: string, mode: "day" | "week" | "month"): DateRange => {
  const date = new Date(`${dateText}T00:00:00`);
  if (mode === "day") return { from: dateText, to: dateText };
  if (mode === "week") {
    const from = new Date(date);
    from.setDate(date.getDate() - date.getDay());
    const to = new Date(from);
    to.setDate(from.getDate() + 6);
    return { from: toDateInput(from), to: toDateInput(to) };
  }
  const from = new Date(date.getFullYear(), date.getMonth(), 1);
  const to = new Date(date.getFullYear(), date.getMonth() + 1, 0);
  return { from: toDateInput(from), to: toDateInput(to) };
};
