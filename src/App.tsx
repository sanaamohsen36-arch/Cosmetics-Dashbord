"use client";

import { useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
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
import {
  BarChart3,
  FileSpreadsheet,
  Gauge,
  LayoutDashboard,
  Save,
  Settings,
  UploadCloud,
  UserCircle,
  Users
} from "lucide-react";
import type {
  AdsPlatform,
  AdsRawFile,
  AdsRow,
  AppData,
  DateRange,
  PageKey,
  SalesByPlatform,
  SalesBySalesperson,
  SalesRawFile
} from "./types";
import {
  aggregateAdsByDate,
  aggregatePeople,
  aggregatePlatforms,
  calculateKpis,
  dailyTrend,
  filterAds,
  filterPeople,
  filterPlatforms
} from "./lib/metrics";
import {
  createId,
  emptyData,
  getStorageMode,
  loadData,
  saveAdsUpload,
  saveData,
  saveSalesUpload,
  subscribeToDataChanges
} from "./lib/storage";
import { parseAdsWorkbook, parseSalesWorkbook } from "./lib/workbookParsers";

const today = new Date().toISOString().slice(0, 10);
const numberFormat = new Intl.NumberFormat("ar-EG");
const money = (value: number | null) => (value === null ? "N/A" : `${numberFormat.format(Math.round(value))} ج`);
const integer = (value: number | null) => (value === null ? "N/A" : numberFormat.format(Math.round(value)));
const ratio = (value: number | null) => (value === null ? "N/A" : value.toFixed(2));
const percent = (value: number | null) => (value === null ? "N/A" : `${value.toFixed(1)}%`);
const chartTooltipStyle = { background: "#0b1422", border: "1px solid #253246", borderRadius: 8, color: "#e5edf5" };

const navItems: Array<{ key: PageKey; label: string; icon: ReactNode }> = [
  { key: "dashboard", label: "Dashboard", icon: <LayoutDashboard size={18} /> },
  { key: "upload", label: "Upload Center", icon: <UploadCloud size={18} /> },
  { key: "sales", label: "Sales Reports", icon: <Users size={18} /> },
  { key: "ads", label: "Ads Reports", icon: <BarChart3 size={18} /> },
  { key: "settings", label: "Settings", icon: <Settings size={18} /> }
];

export default function DashboardApp() {
  const [data, setData] = useState<AppData>(() => emptyData());
  const [page, setPage] = useState<PageKey>("dashboard");
  const [range, setRange] = useState<DateRange>({ from: today, to: today });
  const [periodMode, setPeriodMode] = useState<"day" | "week" | "month">("day");
  const [theme, setTheme] = useState<"dark" | "light">("dark");

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem("dashboard-theme", theme);
  }, [theme]);

  useEffect(() => {
    const savedTheme = localStorage.getItem("dashboard-theme");
    if (savedTheme === "light" || savedTheme === "dark") setTheme(savedTheme);
    void loadData().then(setData);
    return subscribeToDataChanges(() => void loadData().then(setData));
  }, []);

  const commitData = async (next: AppData) => {
    setData(next);
    await saveData(next);
  };

  return (
    <div className={`app-shell ${theme}`} dir="rtl">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-mark">DR</div>
          <div>
            <strong>تقارير البيع</strong>
            <small>Sales + Ads BI</small>
          </div>
        </div>
        <nav>
          {navItems.map((item) => (
            <button key={item.key} className={page === item.key ? "active" : ""} onClick={() => setPage(item.key)}>
              {item.icon}
              {item.label}
            </button>
          ))}
        </nav>
        <div className="admin-box">
          <UserCircle size={20} />
          <span>Admin</span>
          <button className="theme-toggle" onClick={() => setTheme(theme === "dark" ? "light" : "dark")}>
            {theme === "dark" ? "Light" : "Dark"}
          </button>
        </div>
      </aside>

      <main className="main">
        <header className="topbar">
          <div>
            <p className="eyebrow">{getStorageMode()} Live</p>
            <h1>{navItems.find((item) => item.key === page)?.label}</h1>
            <p className="sync-status">متصل بقاعدة البيانات، وأي حفظ جديد ينعكس على اللوحة.</p>
          </div>
          {page === "dashboard" && (
            <DateFilters range={range} mode={periodMode} onRangeChange={setRange} onModeChange={(mode) => {
              setPeriodMode(mode);
              setRange(makePeriodRange(range.from, mode));
            }} />
          )}
        </header>

        {page === "dashboard" && <DashboardPage data={data} range={range} />}
        {page === "upload" && <UploadCenter data={data} setData={setData} />}
        {page === "sales" && <SalesReportsPage data={data} range={range} setRange={setRange} />}
        {page === "ads" && <AdsReportsPage data={data} range={range} setRange={setRange} />}
        {page === "settings" && <SettingsPage data={data} commitData={commitData} />}
      </main>
    </div>
  );
}

function DateFilters({
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

function UploadCenter({
  data,
  setData
}: {
  data: AppData;
  setData: (data: AppData) => void;
}) {
  return (
    <div className="content-grid">
      <SalesUploadCard data={data} setData={setData} />
      <AdsUploadCard data={data} setData={setData} platform="Meta" />
      <AdsUploadCard data={data} setData={setData} platform="TikTok" />
      <RecentUploadsPanel data={data} />
      <section className="panel wide">
        <div className="section-title">
          <Gauge />
          <div>
            <h2>حالة النظام</h2>
            <p>يتم الحفظ والاستبدال حسب تاريخ التقرير. لا يتم حفظ أي ملف قبل المعاينة.</p>
          </div>
        </div>
        <div className="kpi-grid small">
          <KpiCard label="Sales Files" value={integer(data.salesRawFiles.length)} />
          <KpiCard label="Meta Files" value={integer(data.adsRawFiles.filter((file) => file.adsPlatform === "Meta").length)} />
          <KpiCard label="TikTok Files" value={integer(data.adsRawFiles.filter((file) => file.adsPlatform === "TikTok").length)} />
          <KpiCard label="Saved Dates" value={integer(new Set([...data.salesBySalesperson, ...data.metaAds, ...data.tiktokAds].map((row) => row.reportDate)).size)} />
        </div>
      </section>
    </div>
  );
}

function SalesUploadCard({ data, setData }: { data: AppData; setData: (data: AppData) => void }) {
  const [file, setFile] = useState<File | null>(null);
  const [reportDate, setReportDate] = useState(today);
  const [peoplePreview, setPeoplePreview] = useState<SalesBySalesperson[]>([]);
  const [platformPreview, setPlatformPreview] = useState<SalesByPlatform[]>([]);
  const [errors, setErrors] = useState<string[]>([]);
  const [message, setMessage] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const existing = data.salesBySalesperson.some((row) => row.reportDate === reportDate) || data.salesByPlatform.some((row) => row.reportDate === reportDate);
  const totals = salesPreviewTotals(peoplePreview, platformPreview);

  const preview = async () => {
    if (!file) return;
    setMessage("جار قراءة الملف...");
    const sourceFileId = createId();
    const parsed = await parseSalesWorkbook(file, reportDate, sourceFileId);
    setPeoplePreview(parsed.people);
    setPlatformPreview(parsed.platforms);
    setErrors(parsed.errors);
    setMessage(parsed.errors.length ? "تمت المعاينة مع أخطاء تحتاج مراجعة." : "Preview ready. راجعي البيانات قبل الحفظ.");
  };

  const save = async () => {
    if (!file || errors.length) return;
    setIsSaving(true);
    const sourceFileId = createId();
    const now = new Date().toISOString();
    const rawFile: SalesRawFile = {
      id: sourceFileId,
      fileName: file.name,
      filePath: file.name,
      uploadedAt: now,
      reportDate,
      ocrStatus: "success",
      createdAt: now
    };
    const people = normalizePeopleRows(peoplePreview, reportDate, sourceFileId, now);
    const platforms = normalizePlatformRows(platformPreview, reportDate, sourceFileId, now);
    const enriched = syncMasterData(data, people, platforms);
    const next = await saveSalesUpload(enriched, rawFile, people, platforms, existing ? "replace" : "merge");
    setData(next);
    await saveData(next);
    setMessage(existing ? "تم استبدال بيانات المبيعات لهذا التاريخ." : "تم حفظ بيانات المبيعات.");
    setIsSaving(false);
  };

  return (
    <section className="panel upload-card">
      <div className="section-title">
        <FileSpreadsheet />
        <div>
          <h2>Sales Report Upload</h2>
          <p>Excel / CSV فقط. الفلو: Upload File ثم Select Date ثم Preview ثم Save.</p>
        </div>
      </div>
      <div className="upload-box">
        <input accept=".xlsx,.xls,.csv" type="file" onChange={(event) => setFile(event.target.files?.[0] ?? null)} />
        <label>
          Select Report Date
          <input type="date" value={reportDate} onChange={(event) => setReportDate(event.target.value)} />
        </label>
        <div className="actions">
          <button className="primary" disabled={!file} onClick={preview}>Preview</button>
          {peoplePreview.length || platformPreview.length ? (
            <button className="success" disabled={isSaving || errors.length > 0} onClick={save}>
              <Save size={18} />
              {existing ? "Replace Existing Data" : "Save Data"}
            </button>
          ) : null}
        </div>
        {message && <p className="status-line">{message}</p>}
      </div>
      {errors.length > 0 && <ErrorList errors={errors} />}
      {(peoplePreview.length > 0 || platformPreview.length > 0) && (
        <div className="preview-stack">
          <div className={totals.peopleOrders === totals.platformOrders && totals.peopleRevenue === totals.platformRevenue ? "notice success-note" : "notice warning-note"}>
            <strong>إجماليات المعاينة</strong>
            <span>السيلز: {integer(totals.peopleOrders)} أوردر / {money(totals.peopleRevenue)}</span>
            <span>الصفحات: {integer(totals.platformOrders)} أوردر / {money(totals.platformRevenue)}</span>
            {totals.peopleOrders !== totals.platformOrders || totals.peopleRevenue !== totals.platformRevenue ? <span>تحذير: إجمالي السيلز لا يساوي إجمالي الصفحات.</span> : null}
          </div>
          <EditablePeopleTable rows={peoplePreview} onChange={setPeoplePreview} />
          <EditablePlatformTable rows={platformPreview} onChange={setPlatformPreview} />
        </div>
      )}
    </section>
  );
}

function AdsUploadCard({ data, setData, platform }: { data: AppData; setData: (data: AppData) => void; platform: AdsPlatform }) {
  const [file, setFile] = useState<File | null>(null);
  const [reportDate, setReportDate] = useState(today);
  const [rows, setRows] = useState<AdsRow[]>([]);
  const [errors, setErrors] = useState<string[]>([]);
  const [message, setMessage] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const existing = data.adsRawFiles.some((raw) => raw.reportDate === reportDate && raw.adsPlatform === platform);

  const preview = async () => {
    if (!file) return;
    setMessage("جار قراءة ملف الإعلانات...");
    const parsed = await parseAdsWorkbook(file, platform, reportDate, createId());
    setRows(parsed.rows);
    setErrors(parsed.errors);
    setMessage(parsed.errors.length ? "تمت المعاينة مع أخطاء تحتاج مراجعة." : "Preview ready. راجعي البيانات قبل الحفظ.");
  };

  const save = async () => {
    if (!file || errors.length) return;
    setIsSaving(true);
    const sourceFileId = createId();
    const now = new Date().toISOString();
    const rawFile: AdsRawFile = {
      id: sourceFileId,
      fileName: file.name,
      filePath: file.name,
      uploadedAt: now,
      reportDate,
      adsPlatform: platform,
      salesPlatformName: "عام",
      adAccountName: "غير محدد",
      parsingStatus: "success",
      createdAt: now
    };
    const normalizedRows = rows.map((row) => ({
      ...row,
      id: createId(),
      reportDate,
      adsPlatform: platform,
      sourceFileId,
      createdAt: now,
      salesPlatformName: row.salesPlatformName || "عام"
    }));
    const next = await saveAdsUpload(data, rawFile, normalizedRows, platform, existing ? "replace" : "merge");
    setData(next);
    await saveData(next);
    setMessage(existing ? `تم استبدال بيانات ${platform}.` : `تم حفظ بيانات ${platform}.`);
    setIsSaving(false);
  };

  return (
    <section className="panel upload-card">
      <div className="section-title">
        <FileSpreadsheet />
        <div>
          <h2>{platform} Ads Upload</h2>
          <p>Excel / CSV مع معاينة قبل الحفظ.</p>
        </div>
      </div>
      <div className="upload-box">
        <input accept=".xlsx,.xls,.csv" type="file" onChange={(event) => setFile(event.target.files?.[0] ?? null)} />
        <label>
          Select Report Date
          <input type="date" value={reportDate} onChange={(event) => setReportDate(event.target.value)} />
        </label>
        <div className="actions">
          <button className="primary" disabled={!file} onClick={preview}>Preview</button>
          {rows.length > 0 ? (
            <button className="success" disabled={isSaving || errors.length > 0} onClick={save}>
              <Save size={18} />
              {existing ? `Replace Existing ${platform} Data` : `Save ${platform} Data`}
            </button>
          ) : null}
        </div>
        {message && <p className="status-line">{message}</p>}
      </div>
      {errors.length > 0 && <ErrorList errors={errors} />}
      {rows.length > 0 && <EditableAdsTable platform={platform} rows={rows} onChange={setRows} />}
    </section>
  );
}

function DashboardPage({ data, range }: { data: AppData; range: DateRange }) {
  const [salesperson, setSalesperson] = useState("all");
  const [platform, setPlatform] = useState("all");
  const [adsPlatform, setAdsPlatform] = useState<"All" | AdsPlatform>("All");
  const scopedData = useMemo(() => scopeData(data, range, salesperson, platform, adsPlatform), [data, range, salesperson, platform, adsPlatform]);
  const kpis = useMemo(() => calculateKpis(scopedData, range), [scopedData, range]);
  const trend = useMemo(() => dailyTrend(filterPeople(scopedData, range), filterAds(scopedData, range)), [scopedData, range]);
  const people = useMemo(() => aggregatePeople(filterPeople(scopedData, range)), [scopedData, range]);
  const platforms = useMemo(() => aggregatePlatforms(filterPlatforms(scopedData, range)), [scopedData, range]);

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
            <select value={adsPlatform} onChange={(event) => setAdsPlatform(event.target.value as "All" | AdsPlatform)}>
              <option value="All">All</option>
              <option value="Meta">Meta</option>
              <option value="TikTok">TikTok</option>
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
        <KpiCard label="CPA" value={money(kpis.cpa)} />
        <KpiCard label="Average Order Value" value={money(kpis.averageOrderValue)} />
        <KpiCard label="Spend to Sales Ratio" value={percent(kpis.spendToSalesRatio)} />
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

function SalesReportsPage({ data, range, setRange }: { data: AppData; range: DateRange; setRange: (range: DateRange) => void }) {
  const people = aggregatePeople(filterPeople(data, range));
  const platforms = aggregatePlatforms(filterPlatforms(data, range));
  const totals = {
    orders: people.reduce((sum, row) => sum + row.totalOrders, 0),
    revenue: people.reduce((sum, row) => sum + row.totalRevenue, 0)
  };
  const dates = [...new Set(data.salesBySalesperson.map((row) => row.reportDate))].sort();

  return (
    <div className="dashboard-stack">
      <DateFilters range={range} mode="day" onRangeChange={setRange} onModeChange={(mode) => setRange(makePeriodRange(range.from, mode))} />
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

function AdsReportsPage({ data, range, setRange }: { data: AppData; range: DateRange; setRange: (range: DateRange) => void }) {
  const meta = data.metaAds.filter((row) => row.reportDate >= range.from && row.reportDate <= range.to);
  const tiktok = data.tiktokAds.filter((row) => row.reportDate >= range.from && row.reportDate <= range.to);
  const combined = aggregateAdsByDate([...meta, ...tiktok]);

  return (
    <div className="dashboard-stack">
      <DateFilters range={range} mode="day" onRangeChange={setRange} onModeChange={(mode) => setRange(makePeriodRange(range.from, mode))} />
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

function SettingsPage({ data, commitData }: { data: AppData; commitData: (data: AppData) => Promise<void> }) {
  const [platformName, setPlatformName] = useState("");
  const [salespersonName, setSalespersonName] = useState("");
  const [salespersonCode, setSalespersonCode] = useState("");

  const addPlatform = async () => {
    if (!platformName.trim()) return;
    await commitData({
      ...data,
      platformSettings: [...data.platformSettings, { id: createId(), platformName: platformName.trim(), isActive: true, createdAt: new Date().toISOString() }],
      platforms: [...data.platforms, { id: createId(), name: platformName.trim(), aliases: [platformName.trim()], active: true }]
    });
    setPlatformName("");
  };

  const addSalesperson = async () => {
    if (!salespersonName.trim() && !salespersonCode.trim()) return;
    await commitData({
      ...data,
      salespeople: [...data.salespeople, { id: createId(), code: salespersonCode.trim(), name: salespersonName.trim(), active: true }]
    });
    setSalespersonName("");
    setSalespersonCode("");
  };

  return (
    <div className="content-grid">
      <section className="panel">
        <h2>Manage page/platform names</h2>
        <div className="form-row">
          <label>
            Platform name
            <input value={platformName} onChange={(event) => setPlatformName(event.target.value)} />
          </label>
          <button className="primary" onClick={addPlatform}>Add</button>
        </div>
        <ul className="settings-list">{data.platformSettings.map((item) => <li key={item.id}>{item.platformName}</li>)}</ul>
      </section>
      <section className="panel">
        <h2>Manage salesperson names and codes</h2>
        <div className="form-row">
          <label>
            Name
            <input value={salespersonName} onChange={(event) => setSalespersonName(event.target.value)} />
          </label>
          <label>
            Code
            <input value={salespersonCode} onChange={(event) => setSalespersonCode(event.target.value)} />
          </label>
          <button className="primary" onClick={addSalesperson}>Add</button>
        </div>
        <ul className="settings-list">{data.salespeople.map((item) => <li key={item.id}>{item.name} {item.code ? `(${item.code})` : ""}</li>)}</ul>
      </section>
      <section className="panel wide">
        <h2>Ads platform mapping</h2>
        <p className="status-line">النسخة الحالية تستخدم Meta و TikTok مباشرة، ويمكن إضافة mapping لاحقا بدون تغيير البيانات.</p>
      </section>
    </div>
  );
}

function EditablePeopleTable({ rows, onChange }: { rows: SalesBySalesperson[]; onChange: (rows: SalesBySalesperson[]) => void }) {
  return (
    <SimpleTable title="Preview: Salespeople" headers={["Name", "Code", "Morning Orders", "Morning Value", "Evening Orders", "Evening Value", "Total Orders", "Total Value"]}>
      {rows.map((row, index) => (
        <EditableRow key={row.id} row={row} index={index} onChange={onChange} rows={rows} fields={[
          ["salespersonName", "text"],
          ["salespersonCode", "text"],
          ["morningOrders", "number"],
          ["morningRevenue", "number"],
          ["eveningOrders", "number"],
          ["eveningRevenue", "number"],
          ["totalOrders", "number"],
          ["totalRevenue", "number"]
        ]} />
      ))}
    </SimpleTable>
  );
}

function EditablePlatformTable({ rows, onChange }: { rows: SalesByPlatform[]; onChange: (rows: SalesByPlatform[]) => void }) {
  return (
    <SimpleTable title="Preview: Pages / Platforms" headers={["Page", "Morning Orders", "Morning Value", "Evening Orders", "Evening Value", "Total Orders", "Total Value"]}>
      {rows.map((row, index) => (
        <EditableRow key={row.id} row={row} index={index} onChange={onChange} rows={rows} fields={[
          ["platformName", "text"],
          ["morningOrders", "number"],
          ["morningRevenue", "number"],
          ["eveningOrders", "number"],
          ["eveningRevenue", "number"],
          ["totalOrders", "number"],
          ["totalRevenue", "number"]
        ]} />
      ))}
    </SimpleTable>
  );
}

function EditableAdsTable({ platform, rows, onChange }: { platform: AdsPlatform; rows: AdsRow[]; onChange: (rows: AdsRow[]) => void }) {
  const headers =
    platform === "Meta"
      ? ["Campaign", "Ad set", "Ad", "Spend", "Impressions", "Reach", "Clicks", "CTR", "CPC", "CPM", "Leads", "Purchases", "Purchase value"]
      : ["Campaign", "Ad group", "Ad", "Spend", "Impressions", "Clicks", "CTR", "CPC", "CPM", "Conversions", "Cost / Conversion", "Revenue"];
  return (
    <SimpleTable title={`Preview: ${platform} Ads`} headers={headers}>
      {rows.map((row, index) => {
        const update = (field: keyof AdsRow, value: string) => {
          onChange(rows.map((item, itemIndex) => itemIndex === index ? { ...item, [field]: numericAdsFields.has(field) ? Number(value) || 0 : value } : item));
        };
        return (
          <tr key={row.id}>
            <td><input value={row.campaignName} onChange={(event) => update("campaignName", event.target.value)} /></td>
            <td><input value={row.adsetName} onChange={(event) => update("adsetName", event.target.value)} /></td>
            <td><input value={row.adName} onChange={(event) => update("adName", event.target.value)} /></td>
            <td><input type="number" value={row.spend} onChange={(event) => update("spend", event.target.value)} /></td>
            <td><input type="number" value={row.impressions} onChange={(event) => update("impressions", event.target.value)} /></td>
            {platform === "Meta" && <td><input type="number" value={row.reach} onChange={(event) => update("reach", event.target.value)} /></td>}
            <td><input type="number" value={row.clicks} onChange={(event) => update("clicks", event.target.value)} /></td>
            <td><input type="number" value={row.ctr} onChange={(event) => update("ctr", event.target.value)} /></td>
            <td><input type="number" value={row.cpc} onChange={(event) => update("cpc", event.target.value)} /></td>
            <td><input type="number" value={row.cpm} onChange={(event) => update("cpm", event.target.value)} /></td>
            <td><input type="number" value={row.leads} onChange={(event) => update("leads", event.target.value)} /></td>
            <td><input type="number" value={row.purchases} onChange={(event) => update("purchases", event.target.value)} /></td>
            <td><input type="number" value={row.purchaseValue} onChange={(event) => update("purchaseValue", event.target.value)} /></td>
          </tr>
        );
      })}
    </SimpleTable>
  );
}

function EditableRow<T extends SalesBySalesperson | SalesByPlatform>({
  row,
  index,
  rows,
  onChange,
  fields
}: {
  row: T;
  index: number;
  rows: T[];
  onChange: (rows: T[]) => void;
  fields: Array<[keyof T, "text" | "number"]>;
}) {
  const update = (field: keyof T, value: string, type: "text" | "number") => {
    onChange(rows.map((item, itemIndex) => itemIndex === index ? { ...item, [field]: type === "number" ? Number(value) || 0 : value } : item));
  };
  return (
    <tr>
      {fields.map(([field, type]) => (
        <td key={String(field)}>
          <input type={type} value={String(row[field] ?? "")} onChange={(event) => update(field, event.target.value, type)} />
        </td>
      ))}
    </tr>
  );
}

function RecentUploadsPanel({ data }: { data: AppData }) {
  const rows = [
    ...data.salesRawFiles.map((file) => ({ date: file.reportDate, type: "Sales", name: file.fileName, status: file.ocrStatus, uploadedAt: file.uploadedAt })),
    ...data.adsRawFiles.map((file) => ({ date: file.reportDate, type: file.adsPlatform, name: file.fileName, status: file.parsingStatus, uploadedAt: file.uploadedAt }))
  ].sort((a, b) => b.uploadedAt.localeCompare(a.uploadedAt));
  return (
    <SimpleTable title="Recent Uploads" headers={["Date", "Type", "File", "Status", "Upload Time"]}>
      {rows.slice(0, 20).map((row) => (
        <tr key={`${row.type}-${row.name}-${row.uploadedAt}`}>
          <td>{row.date}</td>
          <td>{row.type}</td>
          <td>{row.name}</td>
          <td><Badge text={row.status} /></td>
          <td>{new Date(row.uploadedAt).toLocaleString("ar-EG")}</td>
        </tr>
      ))}
    </SimpleTable>
  );
}

function ErrorList({ errors }: { errors: string[] }) {
  return (
    <div className="notice error-note">
      <strong>Parsing errors</strong>
      {errors.map((error) => <span key={error}>{error}</span>)}
    </div>
  );
}

function KpiCard({ label, value }: { label: string; value: string }) {
  return (
    <article className="kpi-card">
      <span>{label}</span>
      <strong>{value}</strong>
    </article>
  );
}

function ChartPanel({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="panel chart-panel">
      <h2>{title}</h2>
      {children}
    </section>
  );
}

function SimpleTable({ title, headers, children }: { title: string; headers: string[]; children: ReactNode }) {
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

function Badge({ text }: { text: string }) {
  return <span className="badge">{text}</span>;
}

const numericAdsFields = new Set<keyof AdsRow>(["spend", "impressions", "reach", "clicks", "ctr", "cpc", "cpm", "leads", "purchases", "purchaseValue"]);

const salesPreviewTotals = (people: SalesBySalesperson[], platforms: SalesByPlatform[]) => ({
  peopleOrders: people.reduce((sum, row) => sum + row.totalOrders, 0),
  peopleRevenue: people.reduce((sum, row) => sum + row.totalRevenue, 0),
  platformOrders: platforms.reduce((sum, row) => sum + row.totalOrders, 0),
  platformRevenue: platforms.reduce((sum, row) => sum + row.totalRevenue, 0)
});

const normalizePeopleRows = (rows: SalesBySalesperson[], reportDate: string, sourceFileId: string, createdAt: string) =>
  rows
    .filter((row) => row.salespersonName || row.salespersonCode || row.totalOrders || row.totalRevenue)
    .map((row) => ({
      ...row,
      id: createId(),
      reportDate,
      totalOrders: Number(row.morningOrders) + Number(row.eveningOrders),
      totalRevenue: Number(row.morningRevenue) + Number(row.eveningRevenue),
      sourceFileId,
      createdAt
    }));

const normalizePlatformRows = (rows: SalesByPlatform[], reportDate: string, sourceFileId: string, createdAt: string) =>
  rows
    .filter((row) => row.platformName || row.totalOrders || row.totalRevenue)
    .map((row) => ({
      ...row,
      id: createId(),
      reportDate,
      totalOrders: Number(row.morningOrders) + Number(row.eveningOrders),
      totalRevenue: Number(row.morningRevenue) + Number(row.eveningRevenue),
      sourceFileId,
      createdAt
    }));

const syncMasterData = (data: AppData, people: SalesBySalesperson[], platforms: SalesByPlatform[]): AppData => {
  const salespersonKeys = new Set(data.salespeople.map((row) => `${row.code}-${row.name}`));
  const platformKeys = new Set(data.platforms.map((row) => row.name.trim().toLowerCase()));
  const settingKeys = new Set(data.platformSettings.map((row) => row.platformName.trim().toLowerCase()));
  return {
    ...data,
    salespeople: [
      ...data.salespeople,
      ...people
        .filter((row) => {
          const key = `${row.salespersonCode}-${row.salespersonName}`;
          if (!row.salespersonName || salespersonKeys.has(key)) return false;
          salespersonKeys.add(key);
          return true;
        })
        .map((row) => ({ id: createId(), code: row.salespersonCode, name: row.salespersonName, active: true }))
    ],
    platforms: [
      ...data.platforms,
      ...platforms
        .filter((row) => {
          const key = row.platformName.trim().toLowerCase();
          if (!row.platformName || platformKeys.has(key)) return false;
          platformKeys.add(key);
          return true;
        })
        .map((row) => ({ id: createId(), name: row.platformName, aliases: [row.platformName], active: true }))
    ],
    platformSettings: [
      ...data.platformSettings,
      ...platforms
        .filter((row) => {
          const key = row.platformName.trim().toLowerCase();
          if (!row.platformName || settingKeys.has(key)) return false;
          settingKeys.add(key);
          return true;
        })
        .map((row) => ({ id: createId(), platformName: row.platformName, isActive: true, createdAt: new Date().toISOString() }))
    ]
  };
};

const scopeData = (data: AppData, range: DateRange, salesperson: string, platform: string, adsPlatform: "All" | AdsPlatform): AppData => ({
  ...data,
  salesBySalesperson: data.salesBySalesperson.filter((row) => row.reportDate >= range.from && row.reportDate <= range.to && (salesperson === "all" || row.salespersonName === salesperson)),
  salesByPlatform: data.salesByPlatform.filter((row) => row.reportDate >= range.from && row.reportDate <= range.to && (platform === "all" || row.platformName === platform)),
  metaAds: adsPlatform === "TikTok" ? [] : data.metaAds.filter((row) => row.reportDate >= range.from && row.reportDate <= range.to),
  tiktokAds: adsPlatform === "Meta" ? [] : data.tiktokAds.filter((row) => row.reportDate >= range.from && row.reportDate <= range.to)
});

const makePeriodRange = (dateText: string, mode: "day" | "week" | "month"): DateRange => {
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

const toDateInput = (date: Date) => date.toISOString().slice(0, 10);
