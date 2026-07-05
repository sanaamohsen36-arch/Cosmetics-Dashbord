export const numberFormat = new Intl.NumberFormat("ar-EG");
export const money = (value: number | null) => (value === null ? "N/A" : `${numberFormat.format(Math.round(value))} ج`);
export const integer = (value: number | null) => (value === null ? "N/A" : numberFormat.format(Math.round(value)));
export const ratio = (value: number | null) => (value === null ? "N/A" : value.toFixed(2));
export const percent = (value: number | null) => (value === null ? "N/A" : `${value.toFixed(1)}%`);
export const chartTooltipStyle = { background: "#0b1422", border: "1px solid #253246", borderRadius: 8, color: "#e5edf5" };
