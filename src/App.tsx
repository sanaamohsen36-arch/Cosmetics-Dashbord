"use client";

import { useEffect, useMemo, useState } from "react";
import type { ElementType, ReactNode } from "react";
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
  CalendarDays,
  FileSpreadsheet,
  Gauge,
  LayoutDashboard,
  Plus,
  Save,
  Search,
  Settings,
  UploadCloud,
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
  SalesRawFile,
  UploadMode
} from "./types";
import { calculateKpis, dailyTrend, filterAds, filterPeople, filterPlatforms, aggregatePeople, aggregatePlatforms } from "./lib/metrics";
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
import { createSampleSales, inferDateFromFileName, parseAdsWorkbook, parseSalesOcrText, runArabicOcr } from "./lib/parsing";

const today = new Date().toISOString().slice(0, 10);
const numberFormat = new Intl.NumberFormat("ar-EG");

const money = (value: number | null) => (value === null ? "N/A" : `${numberFormat.format(Math.round(value))} ج`);
const integer = (value: number | null) => (value === null ? "N/A" : numberFormat.format(Math.round(value)));
const ratio = (value: number | null) => (value === null ? "N/A" : value.toFixed(2));
const percent = (value: number | null) => (value === null ? "N/A" : `${value.toFixed(1)}%`);

const navItems: { key: PageKey; label: string; icon: ElementType }[] = [
  { key: "upload", label: "رفع البيانات", icon: UploadCloud },
  { key: "dashboard", label: "لوحة التحكم", icon: LayoutDashboard },
  { key: "salespeople", label: "السيلز", icon: Users },
  { key: "platforms", label: "الصفحات", icon: BarChart3 },
  { key: "ads", label: "الإعلانات", icon: Gauge },
  { key: "settings", label: "الإعدادات", icon: Settings }
];

type CommitData = (data: AppData) => Promise<void>;

export default function App() {
  const [data, setData] = useState<AppData>(() => emptyData());
  const [page, setPage] = useState<PageKey>("upload");
  const [range, setRange] = useState<DateRange>({ from: today, to: today });
  const [query, setQuery] = useState("");
  const [syncStatus, setSyncStatus] = useState("جاري تحميل البيانات...");

  const refreshData = async () => {
    try {
      const next = await loadData();
      setData(next);
      setSyncStatus(`متصل: ${getStorageMode()}`);
    } catch (error) {
      setSyncStatus(error instanceof Error ? error.message : "تعذر تحميل البيانات");
    }
  };

  useEffect(() => {
    void refreshData();
    const unsubscribe = subscribeToDataChanges(() => {
      void refreshData();
    });
    return unsubscribe;
  }, []);

  const scopedPeople = useMemo(() => filterPeople(data, range), [data, range]);
  const scopedPlatforms = useMemo(() => filterPlatforms(data, range), [data, range]);
  const scopedAds = useMemo(() => filterAds(data, range), [data, range]);
  const kpis = useMemo(() => calculateKpis(data, range), [data, range]);

  const commitData = async (next: AppData) => {
    setData(next);
    setSyncStatus("جاري الحفظ...");
    try {
      await saveData(next);
      await refreshData();
      setSyncStatus(`تم الحفظ: ${getStorageMode()}`);
    } catch (error) {
      setSyncStatus(error instanceof Error ? error.message : "تعذر حفظ البيانات");
    }
  };

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <span className="brand-mark">DR</span>
          <div>
            <strong>تقارير البيع</strong>
            <small>Sales + Ads BI</small>
          </div>
        </div>
        <nav>
          {navItems.map((item) => {
            const Icon = item.icon;
            return (
              <button key={item.key} className={page === item.key ? "active" : ""} onClick={() => setPage(item.key)}>
                <Icon size={18} />
                <span>{item.label}</span>
              </button>
            );
          })}
        </nav>
      </aside>

      <main className="main">
        <header className="topbar">
          <div>
            <p className="eyebrow">MVP مباشر</p>
            <h1>{navItems.find((item) => item.key === page)?.label}</h1>
            <p className="sync-status">{syncStatus}</p>
          </div>
          <DateControls range={range} setRange={setRange} />
        </header>

        {page === "upload" && <UploadPage data={data} commitData={commitData} />}
        {page === "dashboard" && <DashboardPage kpis={kpis} people={scopedPeople} platforms={scopedPlatforms} ads={scopedAds} />}
        {page === "salespeople" && (
          <SalespeoplePage rows={aggregatePeople(scopedPeople)} totalOrders={kpis.totalOrders} totalRevenue={kpis.totalSalesRevenue} query={query} setQuery={setQuery} />
        )}
        {page === "platforms" && (
          <PlatformsPage
            rows={aggregatePlatforms(scopedPlatforms)}
            totalOrders={kpis.totalOrders}
            totalRevenue={kpis.totalSalesRevenue}
            ads={scopedAds}
          />
        )}
        {page === "ads" && <AdsPage rows={scopedAds} platforms={scopedPlatforms} />}
        {page === "settings" && <SettingsPage data={data} commitData={commitData} />}
      </main>
    </div>
  );
}

function DateControls({ range, setRange }: { range: DateRange; setRange: (range: DateRange) => void }) {
  const setPreset = (preset: "day" | "week" | "month") => {
    const base = new Date(range.to || today);
    if (preset === "day") setRange({ from: base.toISOString().slice(0, 10), to: base.toISOString().slice(0, 10) });
    if (preset === "week") {
      const start = new Date(base);
      start.setDate(base.getDate() - 6);
      setRange({ from: start.toISOString().slice(0, 10), to: base.toISOString().slice(0, 10) });
    }
    if (preset === "month") {
      const start = new Date(base.getFullYear(), base.getMonth(), 1);
      const end = new Date(base.getFullYear(), base.getMonth() + 1, 0);
      setRange({ from: start.toISOString().slice(0, 10), to: end.toISOString().slice(0, 10) });
    }
  };

  return (
    <div className="date-controls">
      <button onClick={() => setPreset("day")}>يوم</button>
      <button onClick={() => setPreset("week")}>أسبوع</button>
      <button onClick={() => setPreset("month")}>شهر</button>
      <label>
        من
        <input type="date" value={range.from} onChange={(event) => setRange({ ...range, from: event.target.value })} />
      </label>
      <label>
        إلى
        <input type="date" value={range.to} onChange={(event) => setRange({ ...range, to: event.target.value })} />
      </label>
    </div>
  );
}

function UploadPage({ data, commitData }: { data: AppData; commitData: CommitData }) {
  const [salesFile, setSalesFile] = useState<File | null>(null);
  const [salesDate, setSalesDate] = useState(today);
  const [peoplePreview, setPeoplePreview] = useState<SalesBySalesperson[]>([]);
  const [platformPreview, setPlatformPreview] = useState<SalesByPlatform[]>([]);
  const [ocrProgress, setOcrProgress] = useState("");
  const [ocrText, setOcrText] = useState("");
  const [salesMode, setSalesMode] = useState<UploadMode>("merge");

  const handleSalesFile = (file: File | null) => {
    setSalesFile(file);
    if (file) setSalesDate(inferDateFromFileName(file.name));
  };

  const sourceFileId = useMemo(() => createId(), [salesFile?.name]);
  const existingSalesDate = data.salesBySalesperson.some((row) => row.reportDate === salesDate);

  const runOcr = async () => {
    if (!salesFile) return;
    setOcrProgress("بدء OCR...");
    try {
      const text = await runArabicOcr(salesFile, (message, progress) => setOcrProgress(`${message} ${progress}%`));
      setOcrText(text);
      const parsed = parseSalesOcrText(text, salesDate, sourceFileId);
      setPeoplePreview(parsed.people);
      setPlatformPreview(parsed.platforms);
      setOcrProgress(parsed.people.length || parsed.platforms.length ? "تم استخراج البيانات. راجع الجدول قبل الحفظ." : "لم يتم استخراج صفوف كافية. يمكن إدخالها يدويًا أو تحميل نموذج.");
    } catch (error) {
      setOcrProgress(error instanceof Error ? error.message : "تعذر تشغيل OCR");
    }
  };

  const loadSample = () => {
    const sample = createSampleSales(salesDate, sourceFileId);
    setPeoplePreview(sample.people);
    setPlatformPreview(sample.platforms);
    setOcrProgress("تم تحميل نموذج قابل للتعديل من شكل التقرير المرفق.");
  };

  const saveSales = async () => {
    const now = new Date().toISOString();
    const rawFile: SalesRawFile = {
      id: sourceFileId,
      fileName: salesFile?.name ?? "manual-sales-report",
      filePath: salesFile?.name ?? "manual",
      uploadedAt: now,
      reportDate: salesDate,
      ocrStatus: ocrText ? "success" : "manual",
      createdAt: now
    };
    const next = await saveSalesUpload(
      data,
      rawFile,
      peoplePreview.map(normalizePerson),
      platformPreview.map(normalizePlatform),
      existingSalesDate ? salesMode : "merge"
    );
    setOcrProgress("جاري حفظ تقرير المبيعات على Supabase...");
    await commitData(next);
    setOcrProgress("تم حفظ تقرير المبيعات وتحديث اللوحة.");
  };

  return (
    <section className="content-grid">
      <div className="panel upload-panel">
        <div className="section-title">
          <UploadCloud />
          <div>
            <h2>رفع صورة تقفيل المبيعات</h2>
            <p>يدعم OCR عربي/إنجليزي، مع مراجعة يدوية قبل الحفظ.</p>
          </div>
        </div>
        <div className="upload-box">
          <input type="file" accept="image/*" onChange={(event) => handleSalesFile(event.target.files?.[0] ?? null)} />
          <span>{salesFile ? salesFile.name : "اختر صورة التقرير اليومي"}</span>
        </div>
        <div className="form-row">
          <label>
            تاريخ التقرير
            <input type="date" value={salesDate} onChange={(event) => setSalesDate(event.target.value)} />
          </label>
          {existingSalesDate && (
            <label>
              نفس التاريخ موجود
              <select value={salesMode} onChange={(event) => setSalesMode(event.target.value as UploadMode)}>
                <option value="replace">استبدال</option>
                <option value="merge">دمج</option>
                <option value="cancel">إلغاء</option>
              </select>
            </label>
          )}
        </div>
        <div className="actions">
          <button className="primary" disabled={!salesFile} onClick={runOcr}>
            <Search size={18} /> تشغيل OCR
          </button>
          <button onClick={loadSample}>تحميل نموذج</button>
          <button className="success" disabled={!peoplePreview.length && !platformPreview.length} onClick={saveSales}>
            <Save size={18} /> حفظ المبيعات
          </button>
        </div>
        {ocrProgress && <p className="status-line">{ocrProgress}</p>}
      </div>

      <div className="panel">
        <div className="section-title">
          <FileSpreadsheet />
          <div>
            <h2>رفع تقارير الإعلانات</h2>
            <p>Excel من Meta أو TikTok مع معاينة وحفظ مستقل.</p>
          </div>
        </div>
        <AdsUpload platform="Meta" data={data} commitData={commitData} />
        <AdsUpload platform="TikTok" data={data} commitData={commitData} />
      </div>

      <div className="panel wide">
        <PreviewToolbar title="معاينة السيلز" onAdd={() => setPeoplePreview([...peoplePreview, blankPerson(salesDate, sourceFileId)])} />
        <EditablePeopleTable rows={peoplePreview} setRows={setPeoplePreview} />
      </div>

      <div className="panel wide">
        <PreviewToolbar title="معاينة الصفحات" onAdd={() => setPlatformPreview([...platformPreview, blankPlatform(salesDate, sourceFileId)])} />
        <EditablePlatformTable rows={platformPreview} setRows={setPlatformPreview} />
      </div>
    </section>
  );
}

function AdsUpload({ platform, data, commitData }: { platform: AdsPlatform; data: AppData; commitData: CommitData }) {
  const [file, setFile] = useState<File | null>(null);
  const [reportDate, setReportDate] = useState(today);
  const activePlatforms = data.platformSettings.filter((item) => item.isActive);
  const [salesPlatformName, setSalesPlatformName] = useState(activePlatforms[0]?.platformName ?? "ريجينكس");
  const [rows, setRows] = useState<AdsRow[]>([]);
  const [message, setMessage] = useState("");
  const [mode, setMode] = useState<UploadMode>("merge");

  const existing = data.adsRawFiles.some(
    (item) => item.reportDate === reportDate && item.adsPlatform === platform && item.salesPlatformName === salesPlatformName
  );

  const handleFile = async (selected: File | null) => {
    setFile(selected);
    if (!selected) return;
    const date = inferDateFromFileName(selected.name);
    setReportDate(date);
    const sourceFileId = createId();
    try {
      const parsed = await parseAdsWorkbook(selected, platform, salesPlatformName, date, sourceFileId);
      setRows(parsed);
      setMessage(`تمت قراءة ${parsed.length} صف من ${platform} لصفحة ${salesPlatformName}.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "تعذر قراءة ملف الإعلانات");
    }
  };

  const save = async () => {
    const now = new Date().toISOString();
    const rawFile: AdsRawFile = {
      id: rows[0]?.sourceFileId ?? createId(),
      fileName: file?.name ?? `${platform}-manual.xlsx`,
      filePath: file?.name ?? "manual",
      uploadedAt: now,
      reportDate,
      adsPlatform: platform,
      salesPlatformName,
      parsingStatus: "success",
      createdAt: now
    };
    const datedRows = rows.map((row) => ({ ...row, reportDate, salesPlatformName }));
    setMessage(`جاري حفظ بيانات ${platform} لصفحة ${salesPlatformName}...`);
    const next = await saveAdsUpload(data, rawFile, datedRows, platform, existing ? mode : "merge");
    await commitData(next);
    setMessage(`تم حفظ بيانات ${platform} لصفحة ${salesPlatformName}.`);
  };

  return (
    <div className="ads-upload-card">
      <div>
        <strong>{platform === "Meta" ? "Meta Ads" : "TikTok Ads"}</strong>
        <span>{rows.length ? `${rows.length} صف جاهز لصفحة ${salesPlatformName}` : "اختر الصفحة ثم ملف الإعلانات"}</span>
      </div>
      <select value={salesPlatformName} onChange={(event) => setSalesPlatformName(event.target.value)}>
        {activePlatforms.map((item) => (
          <option key={item.id} value={item.platformName}>
            {item.platformName}
          </option>
        ))}
      </select>
      <input type="file" accept=".xlsx,.xls,.csv" onChange={(event) => handleFile(event.target.files?.[0] ?? null)} />
      <input type="date" value={reportDate} onChange={(event) => setReportDate(event.target.value)} />
      {existing && (
        <select value={mode} onChange={(event) => setMode(event.target.value as UploadMode)}>
          <option value="replace">استبدال</option>
          <option value="merge">دمج</option>
          <option value="cancel">إلغاء</option>
        </select>
      )}
      <button disabled={!rows.length} onClick={save}>
        حفظ
      </button>
      {message && <small>{message}</small>}
    </div>
  );
}

function DashboardPage({ kpis, people, platforms, ads }: { kpis: ReturnType<typeof calculateKpis>; people: SalesBySalesperson[]; platforms: SalesByPlatform[]; ads: AdsRow[] }) {
  const trend = dailyTrend(people, ads);
  const byPeople = aggregatePeople(people).slice(0, 8);
  const byPlatform = aggregatePlatforms(platforms).slice(0, 8);
  const shiftData = [
    { name: "صباحي", orders: kpis.morningOrders, revenue: kpis.morningRevenue },
    { name: "مسائي", orders: kpis.eveningOrders, revenue: kpis.eveningRevenue }
  ];

  return (
    <section className="dashboard-stack">
      <div className="kpi-grid">
        <Kpi title="إجمالي المبيعات" value={money(kpis.totalSalesRevenue)} />
        <Kpi title="إجمالي الطلبات" value={integer(kpis.totalOrders)} />
        <Kpi title="مصروف الإعلانات" value={money(kpis.totalAdsSpend)} />
        <Kpi title="ROAS" value={ratio(kpis.roas)} />
        <Kpi title="ROI" value={percent(kpis.roi)} />
        <Kpi title="CPA" value={money(kpis.cpa)} />
        <Kpi title="متوسط الأوردر" value={money(kpis.averageOrderValue)} />
        <Kpi title="نسبة المصروف للمبيعات" value={percent(kpis.spendToSalesRatio)} />
        <Kpi title="أفضل سيلز بالطلبات" value={kpis.bestSalespersonByOrders} compact />
        <Kpi title="أفضل صفحة بالمبيعات" value={kpis.bestPlatformByRevenue} compact />
      </div>

      <div className="chart-grid">
        <ChartPanel title="اتجاه المبيعات والطلبات">
          <ResponsiveContainer width="100%" height={280}>
            <LineChart data={trend}>
              <CartesianGrid strokeDasharray="3 3" stroke="#263241" />
              <XAxis dataKey="date" stroke="#94a3b8" />
              <YAxis stroke="#94a3b8" />
              <Tooltip contentStyle={{ background: "#111827", border: "1px solid #263241" }} />
              <Line type="monotone" dataKey="revenue" name="المبيعات" stroke="#38bdf8" strokeWidth={3} />
              <Line type="monotone" dataKey="orders" name="الطلبات" stroke="#34d399" strokeWidth={3} />
            </LineChart>
          </ResponsiveContainer>
        </ChartPanel>
        <ChartPanel title="مصروف الإعلانات و ROAS">
          <ResponsiveContainer width="100%" height={280}>
            <LineChart data={trend}>
              <CartesianGrid strokeDasharray="3 3" stroke="#263241" />
              <XAxis dataKey="date" stroke="#94a3b8" />
              <YAxis stroke="#94a3b8" />
              <Tooltip contentStyle={{ background: "#111827", border: "1px solid #263241" }} />
              <Line type="monotone" dataKey="spend" name="المصروف" stroke="#f59e0b" strokeWidth={3} />
              <Line type="monotone" dataKey="roas" name="ROAS" stroke="#a78bfa" strokeWidth={3} />
            </LineChart>
          </ResponsiveContainer>
        </ChartPanel>
        <ChartPanel title="صباحي مقابل مسائي">
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={shiftData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#263241" />
              <XAxis dataKey="name" stroke="#94a3b8" />
              <YAxis stroke="#94a3b8" />
              <Tooltip contentStyle={{ background: "#111827", border: "1px solid #263241" }} />
              <Bar dataKey="orders" name="طلبات" fill="#22c55e" radius={[8, 8, 0, 0]} />
              <Bar dataKey="revenue" name="قيمة" fill="#0ea5e9" radius={[8, 8, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartPanel>
        <ChartPanel title="المبيعات حسب السيلز">
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={byPeople}>
              <CartesianGrid strokeDasharray="3 3" stroke="#263241" />
              <XAxis dataKey="salespersonName" stroke="#94a3b8" />
              <YAxis stroke="#94a3b8" />
              <Tooltip contentStyle={{ background: "#111827", border: "1px solid #263241" }} />
              <Bar dataKey="totalRevenue" name="قيمة" fill="#38bdf8" radius={[8, 8, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartPanel>
        <ChartPanel title="الطلبات حسب الصفحات">
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={byPlatform}>
              <CartesianGrid strokeDasharray="3 3" stroke="#263241" />
              <XAxis dataKey="platformName" stroke="#94a3b8" />
              <YAxis stroke="#94a3b8" />
              <Tooltip contentStyle={{ background: "#111827", border: "1px solid #263241" }} />
              <Bar dataKey="totalOrders" name="طلبات" fill="#34d399" radius={[8, 8, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartPanel>
      </div>
    </section>
  );
}

function SalespeoplePage({
  rows,
  totalOrders,
  totalRevenue,
  query,
  setQuery
}: {
  rows: SalesBySalesperson[];
  totalOrders: number;
  totalRevenue: number;
  query: string;
  setQuery: (value: string) => void;
}) {
  const filtered = rows.filter((row) => `${row.salespersonName} ${row.salespersonCode}`.includes(query));
  return (
    <section className="panel wide">
      <TableHeader title="أداء السيلز" query={query} setQuery={setQuery} onExport={() => exportCsv("salespeople.csv", filtered)} />
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>الترتيب</th>
              <th>الاسم</th>
              <th>الكود</th>
              <th>طلبات صباحي</th>
              <th>قيمة صباحي</th>
              <th>طلبات مسائي</th>
              <th>قيمة مسائي</th>
              <th>إجمالي الطلبات</th>
              <th>إجمالي القيمة</th>
              <th>حصة الطلبات</th>
              <th>حصة القيمة</th>
              <th>متوسط الأوردر</th>
              <th>الحالة</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((row, index) => (
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
                <td>{percent(totalOrders ? (row.totalOrders / totalOrders) * 100 : null)}</td>
                <td>{percent(totalRevenue ? (row.totalRevenue / totalRevenue) * 100 : null)}</td>
                <td>{money(row.totalOrders ? row.totalRevenue / row.totalOrders : null)}</td>
                <td><Badge text={performanceStatus(row.totalRevenue)} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function PlatformsPage({
  rows,
  totalOrders,
  totalRevenue,
  ads
}: {
  rows: SalesByPlatform[];
  totalOrders: number;
  totalRevenue: number;
  ads: AdsRow[];
}) {
  return (
    <section className="panel wide">
      <TableHeader title="أداء الصفحات والمنصات" onExport={() => exportCsv("platforms.csv", rows)} />
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>الصفحة</th>
              <th>طلبات صباحي</th>
              <th>قيمة صباحي</th>
              <th>طلبات مسائي</th>
              <th>قيمة مسائي</th>
              <th>إجمالي الطلبات</th>
              <th>إجمالي القيمة</th>
              <th>حصة الطلبات</th>
              <th>حصة القيمة</th>
              <th>مصروف مرتبط</th>
              <th>ROAS للصفحة</th>
              <th>CPA للصفحة</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const relatedSpend = ads
                .filter((ad) => ad.salesPlatformName === row.platformName)
                .reduce((total, ad) => total + ad.spend, 0);
              return (
                <tr key={row.id}>
                  <td>{row.platformName}</td>
                  <td>{integer(row.morningOrders)}</td>
                  <td>{money(row.morningRevenue)}</td>
                  <td>{integer(row.eveningOrders)}</td>
                  <td>{money(row.eveningRevenue)}</td>
                  <td>{integer(row.totalOrders)}</td>
                  <td>{money(row.totalRevenue)}</td>
                  <td>{percent(totalOrders ? (row.totalOrders / totalOrders) * 100 : null)}</td>
                  <td>{percent(totalRevenue ? (row.totalRevenue / totalRevenue) * 100 : null)}</td>
                  <td>{money(relatedSpend)}</td>
                  <td>{ratio(relatedSpend ? row.totalRevenue / relatedSpend : null)}</td>
                  <td>{money(row.totalOrders && relatedSpend ? relatedSpend / row.totalOrders : null)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function AdsPage({ rows, platforms }: { rows: AdsRow[]; platforms: SalesByPlatform[] }) {
  const summary = useMemo(() => {
    const dates = new Map<
      string,
      { date: string; salesPlatformName: string; metaSpend: number; tiktokSpend: number; totalSpend: number; sales: number; orders: number }
    >();
    for (const ad of rows) {
      const key = `${ad.reportDate}-${ad.salesPlatformName}`;
      const item = dates.get(key) ?? {
        date: ad.reportDate,
        salesPlatformName: ad.salesPlatformName,
        metaSpend: 0,
        tiktokSpend: 0,
        totalSpend: 0,
        sales: 0,
        orders: 0
      };
      if (ad.adsPlatform === "Meta") item.metaSpend += ad.spend;
      if (ad.adsPlatform === "TikTok") item.tiktokSpend += ad.spend;
      item.totalSpend = item.metaSpend + item.tiktokSpend;
      dates.set(key, item);
    }
    for (const sale of platforms) {
      const key = `${sale.reportDate}-${sale.platformName}`;
      const item = dates.get(key) ?? {
        date: sale.reportDate,
        salesPlatformName: sale.platformName,
        metaSpend: 0,
        tiktokSpend: 0,
        totalSpend: 0,
        sales: 0,
        orders: 0
      };
      item.sales += sale.totalRevenue;
      item.orders += sale.totalOrders;
      dates.set(key, item);
    }
    return [...dates.values()].sort((a, b) => `${a.date}-${a.salesPlatformName}`.localeCompare(`${b.date}-${b.salesPlatformName}`));
  }, [rows, platforms]);

  return (
    <section className="dashboard-stack">
      <div className="panel wide">
        <TableHeader title="ملخص الإعلانات مع المبيعات" onExport={() => exportCsv("ads-summary.csv", summary)} />
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>التاريخ</th>
                <th>صفحة المبيعات</th>
                <th>Meta Spend</th>
                <th>TikTok Spend</th>
                <th>إجمالي المصروف</th>
                <th>المبيعات</th>
                <th>الطلبات</th>
                <th>ROAS</th>
                <th>ROI</th>
                <th>CPA</th>
                <th>Spend/Sales</th>
              </tr>
            </thead>
            <tbody>
              {summary.map((row) => (
                <tr key={`${row.date}-${row.salesPlatformName}`}>
                  <td>{row.date}</td>
                  <td>{row.salesPlatformName}</td>
                  <td>{money(row.metaSpend)}</td>
                  <td>{money(row.tiktokSpend)}</td>
                  <td>{money(row.totalSpend)}</td>
                  <td>{money(row.sales)}</td>
                  <td>{integer(row.orders)}</td>
                  <td>{ratio(row.totalSpend ? row.sales / row.totalSpend : null)}</td>
                  <td>{percent(row.totalSpend ? ((row.sales - row.totalSpend) / row.totalSpend) * 100 : null)}</td>
                  <td>{money(row.orders ? row.totalSpend / row.orders : null)}</td>
                  <td>{percent(row.sales ? (row.totalSpend / row.sales) * 100 : null)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      <div className="panel wide">
        <TableHeader title="كل صفوف الإعلانات" onExport={() => exportCsv("ads-rows.csv", rows)} />
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>التاريخ</th>
                <th>المنصة</th>
                <th>صفحة المبيعات</th>
                <th>الحملة</th>
                <th>Ad set / Group</th>
                <th>Ad</th>
                <th>Spend</th>
                <th>Impressions</th>
                <th>Reach</th>
                <th>Clicks</th>
                <th>CTR</th>
                <th>CPC</th>
                <th>CPM</th>
                <th>Leads</th>
                <th>Orders</th>
                <th>Value</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id}>
                  <td>{row.reportDate}</td>
                  <td><Badge text={row.adsPlatform} /></td>
                  <td>{row.salesPlatformName}</td>
                  <td>{row.campaignName}</td>
                  <td>{row.adsetName}</td>
                  <td>{row.adName}</td>
                  <td>{money(row.spend)}</td>
                  <td>{integer(row.impressions)}</td>
                  <td>{integer(row.reach)}</td>
                  <td>{integer(row.clicks)}</td>
                  <td>{percent(row.ctr)}</td>
                  <td>{money(row.cpc)}</td>
                  <td>{money(row.cpm)}</td>
                  <td>{integer(row.leads)}</td>
                  <td>{integer(row.purchases)}</td>
                  <td>{money(row.purchaseValue)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}

function SettingsPage({ data, commitData }: { data: AppData; commitData: CommitData }) {
  const [name, setName] = useState("");
  const [importMessage, setImportMessage] = useState("");
  const addPlatform = () => {
    if (!name.trim()) return;
    void commitData({
      ...data,
      platformSettings: [...data.platformSettings, { id: createId(), platformName: name.trim(), isActive: true, createdAt: new Date().toISOString() }]
    });
    setName("");
  };
  const exportBackup = () => {
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `daily-report-backup-${today}.json`;
    link.click();
    URL.revokeObjectURL(url);
  };
  const importBackup = async (file: File | null) => {
    if (!file) return;
    try {
      const text = await file.text();
      const imported = JSON.parse(text) as AppData;
      if (!Array.isArray(imported.salesBySalesperson) || !Array.isArray(imported.salesByPlatform)) {
        throw new Error("ملف البيانات غير صحيح");
      }
      await commitData(imported);
      setImportMessage("تم استيراد البيانات بنجاح.");
    } catch (error) {
      setImportMessage(error instanceof Error ? error.message : "تعذر استيراد الملف.");
    }
  };
  const exportShareableHtml = () => {
    const blob = new Blob([buildShareableHtml(data)], { type: "text/html;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `daily-report-dashboard-${today}.html`;
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <section className="settings-stack">
      <div className="panel settings-panel">
        <div className="section-title">
          <Settings />
          <div>
            <h2>إعدادات الصفحات</h2>
            <p>أي صفحة لا تظهر في تقرير يومي يتم حفظها بصفر لذلك اليوم.</p>
          </div>
        </div>
        <div className="form-row">
          <input placeholder="اسم صفحة جديدة" value={name} onChange={(event) => setName(event.target.value)} />
          <button className="primary" onClick={addPlatform}>
            <Plus size={18} /> إضافة
          </button>
        </div>
        <div className="settings-list">
          {data.platformSettings.map((item) => (
            <label key={item.id} className="toggle-row">
              <input
                type="checkbox"
                checked={item.isActive}
                onChange={(event) =>
                  void commitData({
                    ...data,
                    platformSettings: data.platformSettings.map((platform) =>
                      platform.id === item.id ? { ...platform, isActive: event.target.checked } : platform
                    )
                  })
                }
              />
              <span>{item.platformName}</span>
            </label>
          ))}
        </div>
      </div>

      <div className="panel settings-panel">
        <div className="section-title">
          <UploadCloud />
          <div>
            <h2>مشاركة ونقل البيانات</h2>
            <p>استخدم النسخة الاحتياطية لنقل نفس التقارير إلى جهاز آخر عند مشاركة رابط التطبيق.</p>
          </div>
        </div>
        <div className="form-row">
          <button className="primary" onClick={exportShareableHtml}>
            Export HTML Snapshot
          </button>
          <button className="success" onClick={exportBackup}>
            تنزيل نسخة البيانات
          </button>
          <label>
            استيراد نسخة بيانات
            <input type="file" accept="application/json,.json" onChange={(event) => importBackup(event.target.files?.[0] ?? null)} />
          </label>
        </div>
        {importMessage && <p className="status-line">{importMessage}</p>}
      </div>
    </section>
  );
}

function PreviewToolbar({ title, onAdd }: { title: string; onAdd: () => void }) {
  return (
    <div className="table-header">
      <h2>{title}</h2>
      <button onClick={onAdd}>
        <Plus size={18} /> إضافة صف
      </button>
    </div>
  );
}

function EditablePeopleTable({ rows, setRows }: { rows: SalesBySalesperson[]; setRows: (rows: SalesBySalesperson[]) => void }) {
  const update = (id: string, field: keyof SalesBySalesperson, value: string) => {
    setRows(rows.map((row) => (row.id === id ? normalizePerson({ ...row, [field]: numericField(field) ? Number(value) : value }) : row)));
  };
  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <th>الاسم</th>
            <th>الكود</th>
            <th>طلبات صباحي</th>
            <th>قيمة صباحي</th>
            <th>طلبات مسائي</th>
            <th>قيمة مسائي</th>
            <th>الإجمالي</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.id} className={row.totalOrders <= 0 && row.totalRevenue <= 0 ? "suspicious" : ""}>
              <td><input value={row.salespersonName} onChange={(event) => update(row.id, "salespersonName", event.target.value)} /></td>
              <td><input value={row.salespersonCode} onChange={(event) => update(row.id, "salespersonCode", event.target.value)} /></td>
              <td><input type="number" value={row.morningOrders} onChange={(event) => update(row.id, "morningOrders", event.target.value)} /></td>
              <td><input type="number" value={row.morningRevenue} onChange={(event) => update(row.id, "morningRevenue", event.target.value)} /></td>
              <td><input type="number" value={row.eveningOrders} onChange={(event) => update(row.id, "eveningOrders", event.target.value)} /></td>
              <td><input type="number" value={row.eveningRevenue} onChange={(event) => update(row.id, "eveningRevenue", event.target.value)} /></td>
              <td>{integer(row.totalOrders)} / {money(row.totalRevenue)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function EditablePlatformTable({ rows, setRows }: { rows: SalesByPlatform[]; setRows: (rows: SalesByPlatform[]) => void }) {
  const update = (id: string, field: keyof SalesByPlatform, value: string) => {
    setRows(rows.map((row) => (row.id === id ? normalizePlatform({ ...row, [field]: numericField(field) ? Number(value) : value }) : row)));
  };
  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <th>الصفحة</th>
            <th>طلبات صباحي</th>
            <th>قيمة صباحي</th>
            <th>طلبات مسائي</th>
            <th>قيمة مسائي</th>
            <th>الإجمالي</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.id} className={row.totalOrders <= 0 && row.totalRevenue <= 0 ? "suspicious" : ""}>
              <td><input value={row.platformName} onChange={(event) => update(row.id, "platformName", event.target.value)} /></td>
              <td><input type="number" value={row.morningOrders} onChange={(event) => update(row.id, "morningOrders", event.target.value)} /></td>
              <td><input type="number" value={row.morningRevenue} onChange={(event) => update(row.id, "morningRevenue", event.target.value)} /></td>
              <td><input type="number" value={row.eveningOrders} onChange={(event) => update(row.id, "eveningOrders", event.target.value)} /></td>
              <td><input type="number" value={row.eveningRevenue} onChange={(event) => update(row.id, "eveningRevenue", event.target.value)} /></td>
              <td>{integer(row.totalOrders)} / {money(row.totalRevenue)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Kpi({ title, value, compact = false }: { title: string; value: string; compact?: boolean }) {
  return (
    <article className={`kpi-card ${compact ? "compact" : ""}`}>
      <span>{title}</span>
      <strong>{value}</strong>
    </article>
  );
}

function ChartPanel({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="panel chart-panel">
      <h2>{title}</h2>
      {children}
    </div>
  );
}

function TableHeader({ title, query, setQuery, onExport }: { title: string; query?: string; setQuery?: (value: string) => void; onExport: () => void }) {
  return (
    <div className="table-header">
      <h2>{title}</h2>
      <div className="table-tools">
        {setQuery && <input placeholder="بحث" value={query} onChange={(event) => setQuery(event.target.value)} />}
        <button onClick={onExport}>تصدير CSV</button>
      </div>
    </div>
  );
}

function Badge({ text }: { text: string }) {
  return <span className="badge">{text}</span>;
}

const numericField = (field: string) => /Orders|Revenue|spend|impressions|reach|clicks|ctr|cpc|cpm|leads|purchases|Value/.test(field);

const normalizePerson = (row: SalesBySalesperson): SalesBySalesperson => ({
  ...row,
  morningOrders: Number(row.morningOrders) || 0,
  morningRevenue: Number(row.morningRevenue) || 0,
  eveningOrders: Number(row.eveningOrders) || 0,
  eveningRevenue: Number(row.eveningRevenue) || 0,
  totalOrders: (Number(row.morningOrders) || 0) + (Number(row.eveningOrders) || 0),
  totalRevenue: (Number(row.morningRevenue) || 0) + (Number(row.eveningRevenue) || 0)
});

const normalizePlatform = (row: SalesByPlatform): SalesByPlatform => ({
  ...row,
  morningOrders: Number(row.morningOrders) || 0,
  morningRevenue: Number(row.morningRevenue) || 0,
  eveningOrders: Number(row.eveningOrders) || 0,
  eveningRevenue: Number(row.eveningRevenue) || 0,
  totalOrders: (Number(row.morningOrders) || 0) + (Number(row.eveningOrders) || 0),
  totalRevenue: (Number(row.morningRevenue) || 0) + (Number(row.eveningRevenue) || 0)
});

const blankPerson = (reportDate: string, sourceFileId: string): SalesBySalesperson =>
  normalizePerson({
    id: createId(),
    reportDate,
    salespersonName: "",
    salespersonCode: "",
    morningOrders: 0,
    morningRevenue: 0,
    eveningOrders: 0,
    eveningRevenue: 0,
    totalOrders: 0,
    totalRevenue: 0,
    sourceFileId,
    createdAt: new Date().toISOString()
  });

const blankPlatform = (reportDate: string, sourceFileId: string): SalesByPlatform =>
  normalizePlatform({
    id: createId(),
    reportDate,
    platformName: "",
    morningOrders: 0,
    morningRevenue: 0,
    eveningOrders: 0,
    eveningRevenue: 0,
    totalOrders: 0,
    totalRevenue: 0,
    sourceFileId,
    createdAt: new Date().toISOString()
  });

const performanceStatus = (revenue: number) => {
  if (revenue >= 50000) return "ممتاز";
  if (revenue >= 20000) return "جيد";
  if (revenue > 0) return "يحتاج متابعة";
  return "لا توجد مبيعات";
};

function exportCsv(fileName: string, rows: unknown[]) {
  if (!rows.length) return;
  const normalized = rows as Record<string, unknown>[];
  const headers = Object.keys(normalized[0]);
  const csv = [
    headers.join(","),
    ...normalized.map((row) => headers.map((header) => `"${String(row[header] ?? "").replace(/"/g, '""')}"`).join(","))
  ].join("\n");
  const blob = new Blob([`\uFEFF${csv}`], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  link.click();
  URL.revokeObjectURL(url);
}

function buildShareableHtml(data: AppData) {
  const esc = (value: unknown) =>
    String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  const fmtNumber = (value: number | null | undefined) =>
    Number.isFinite(Number(value)) ? numberFormat.format(Math.round(Number(value))) : "N/A";
  const fmtMoney = (value: number | null | undefined) =>
    Number.isFinite(Number(value)) ? `${fmtNumber(Number(value))} ج` : "N/A";
  const fmtRatio = (value: number | null | undefined) => (Number.isFinite(Number(value)) ? Number(value).toFixed(2) : "N/A");
  const fmtPercent = (value: number | null | undefined) => (Number.isFinite(Number(value)) ? `${Number(value).toFixed(1)}%` : "N/A");
  const sumBy = <T,>(rows: T[], picker: (row: T) => number) => rows.reduce((total, row) => total + picker(row), 0);
  const allAds = [...data.metaAds, ...data.tiktokAds];
  const totalSalesRevenue = sumBy(data.salesBySalesperson, (row) => row.totalRevenue);
  const totalOrders = sumBy(data.salesBySalesperson, (row) => row.totalOrders);
  const morningOrders = sumBy(data.salesBySalesperson, (row) => row.morningOrders);
  const eveningOrders = sumBy(data.salesBySalesperson, (row) => row.eveningOrders);
  const totalAdsSpend = sumBy(allAds, (row) => row.spend);
  const roas = totalAdsSpend ? totalSalesRevenue / totalAdsSpend : null;
  const roi = totalAdsSpend ? ((totalSalesRevenue - totalAdsSpend) / totalAdsSpend) * 100 : null;
  const cpa = totalOrders ? totalAdsSpend / totalOrders : null;
  const aov = totalOrders ? totalSalesRevenue / totalOrders : null;
  const exportedAt = new Date().toLocaleString("ar-EG");

  const people = aggregatePeople(data.salesBySalesperson);
  const platforms = aggregatePlatforms(data.salesByPlatform);
  const tableRows = <T,>(rows: T[], cells: ((row: T) => unknown)[]) =>
    rows.length
      ? rows.map((row) => `<tr>${cells.map((cell) => `<td>${esc(cell(row))}</td>`).join("")}</tr>`).join("")
      : `<tr><td colspan="${cells.length}">لا توجد بيانات محفوظة في هذه النسخة</td></tr>`;

  return `<!doctype html>
<html lang="ar" dir="rtl">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>لوحة تقارير المبيعات والإعلانات</title>
  <style>
    :root { color-scheme: dark; font-family: Tahoma, Arial, sans-serif; background: #071018; color: #e5edf5; }
    * { box-sizing: border-box; }
    body { margin: 0; padding: 24px; background: #071018; }
    header { display: flex; justify-content: space-between; align-items: flex-start; gap: 16px; margin-bottom: 18px; }
    h1, h2 { margin: 0; }
    .muted { color: #94a3b8; }
    .grid { display: grid; grid-template-columns: repeat(4, minmax(160px, 1fr)); gap: 12px; margin-bottom: 18px; }
    .card, section { border: 1px solid #1f2a3b; border-radius: 8px; background: #0d1623; padding: 16px; }
    .card span { display: block; color: #94a3b8; font-size: 13px; margin-bottom: 8px; }
    .card strong { font-size: 26px; }
    section { margin-bottom: 18px; overflow: auto; }
    table { width: 100%; border-collapse: collapse; min-width: 820px; }
    th, td { padding: 10px 12px; border-bottom: 1px solid #1f2a3b; text-align: right; white-space: nowrap; }
    th { background: #101b2b; color: #cbd5e1; }
    @media (max-width: 900px) { body { padding: 14px; } .grid { grid-template-columns: repeat(2, 1fr); } header { display: grid; } }
  </style>
</head>
<body>
  <header>
    <div>
      <h1>لوحة تقارير المبيعات والإعلانات</h1>
      <p class="muted">نسخة HTML ثابتة قابلة للمشاركة - تم التصدير ${esc(exportedAt)}</p>
    </div>
    <p class="muted">هذه النسخة ثابتة ولا تحتاج إنترنت أو localhost.</p>
  </header>
  <div class="grid">
    <div class="card"><span>إجمالي المبيعات</span><strong>${esc(fmtMoney(totalSalesRevenue))}</strong></div>
    <div class="card"><span>إجمالي الطلبات</span><strong>${esc(fmtNumber(totalOrders))}</strong></div>
    <div class="card"><span>مصروف الإعلانات</span><strong>${esc(fmtMoney(totalAdsSpend))}</strong></div>
    <div class="card"><span>ROAS</span><strong>${esc(fmtRatio(roas))}</strong></div>
    <div class="card"><span>ROI</span><strong>${esc(fmtPercent(roi))}</strong></div>
    <div class="card"><span>CPA</span><strong>${esc(fmtMoney(cpa))}</strong></div>
    <div class="card"><span>متوسط الأوردر</span><strong>${esc(fmtMoney(aov))}</strong></div>
    <div class="card"><span>صباحي / مسائي</span><strong>${esc(`${fmtNumber(morningOrders)} / ${fmtNumber(eveningOrders)}`)}</strong></div>
  </div>
  <section>
    <h2>أداء السيلز</h2>
    <table>
      <thead><tr><th>الاسم</th><th>الكود</th><th>طلبات صباحي</th><th>قيمة صباحي</th><th>طلبات مسائي</th><th>قيمة مسائي</th><th>إجمالي الطلبات</th><th>إجمالي القيمة</th></tr></thead>
      <tbody>${tableRows(people, [
        (row) => row.salespersonName,
        (row) => row.salespersonCode,
        (row) => fmtNumber(row.morningOrders),
        (row) => fmtMoney(row.morningRevenue),
        (row) => fmtNumber(row.eveningOrders),
        (row) => fmtMoney(row.eveningRevenue),
        (row) => fmtNumber(row.totalOrders),
        (row) => fmtMoney(row.totalRevenue)
      ])}</tbody>
    </table>
  </section>
  <section>
    <h2>أداء الصفحات</h2>
    <table>
      <thead><tr><th>الصفحة</th><th>طلبات صباحي</th><th>قيمة صباحي</th><th>طلبات مسائي</th><th>قيمة مسائي</th><th>إجمالي الطلبات</th><th>إجمالي القيمة</th></tr></thead>
      <tbody>${tableRows(platforms, [
        (row) => row.platformName,
        (row) => fmtNumber(row.morningOrders),
        (row) => fmtMoney(row.morningRevenue),
        (row) => fmtNumber(row.eveningOrders),
        (row) => fmtMoney(row.eveningRevenue),
        (row) => fmtNumber(row.totalOrders),
        (row) => fmtMoney(row.totalRevenue)
      ])}</tbody>
    </table>
  </section>
  <section>
    <h2>صفوف الإعلانات</h2>
    <table>
      <thead><tr><th>التاريخ</th><th>منصة الإعلان</th><th>صفحة المبيعات</th><th>الحملة</th><th>المصروف</th><th>Impressions</th><th>Clicks</th></tr></thead>
      <tbody>${tableRows(allAds, [
        (row) => row.reportDate,
        (row) => row.adsPlatform,
        (row) => row.salesPlatformName,
        (row) => row.campaignName,
        (row) => fmtMoney(row.spend),
        (row) => fmtNumber(row.impressions),
        (row) => fmtNumber(row.clicks)
      ])}</tbody>
    </table>
  </section>
</body>
</html>`;
}
