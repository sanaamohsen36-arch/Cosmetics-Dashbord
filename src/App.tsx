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
const latinNumberFormat = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 });
const adUploadPlatforms = ["ريجينكس", "ريجينكس eg", "واتساب ريجينكس"];
const chartTooltipStyle = { background: "#111827", border: "1px solid #263241", borderRadius: 8, color: "#e5edf5" };

const money = (value: number | null) => (value === null ? "N/A" : `${numberFormat.format(Math.round(value))} ج`);
const integer = (value: number | null) => (value === null ? "N/A" : numberFormat.format(Math.round(value)));
const reviewTotal = (revenue: number, orders: number) => `${latinNumberFormat.format(Math.round(revenue))} / ${latinNumberFormat.format(Math.round(orders))} ج`;
const ratio = (value: number | null) => (value === null ? "N/A" : value.toFixed(2));
const percent = (value: number | null) => (value === null ? "N/A" : `${value.toFixed(1)}%`);
const getAdsTotals = (rows: AdsRow[]) => ({
  spend: rows.reduce((total, row) => total + row.spend, 0),
  messages: rows.reduce((total, row) => total + (Number(row.messagesCount) || 0), 0),
  comments: rows.reduce((total, row) => total + (Number(row.commentsCount) || 0), 0),
  impressions: rows.reduce((total, row) => total + row.impressions, 0),
  reach: rows.reduce((total, row) => total + row.reach, 0),
  clicks: rows.reduce((total, row) => total + row.clicks, 0)
});
const normalizeSalesPlatform = (name: string) => {
  const normalized = name.trim().toLowerCase().replace(/\s+/g, " ");
  if (normalized.includes("eg")) return "ريجينكس eg";
  if (normalized.includes("واتس")) return "واتساب ريجينكس";
  if (normalized.includes("ريجينكس")) return "ريجينكس";
  return normalized;
};
const relatedAdsForPlatform = (ads: AdsRow[], platformName: string) =>
  ads.filter((ad) => normalizeSalesPlatform(ad.salesPlatformName) === normalizeSalesPlatform(platformName));

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
  const [theme, setTheme] = useState<"dark" | "light">("dark");

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

  useEffect(() => {
    const savedTheme = localStorage.getItem("dashboard-theme");
    if (savedTheme === "light" || savedTheme === "dark") setTheme(savedTheme);
  }, []);

  const toggleTheme = () => {
    const next = theme === "dark" ? "light" : "dark";
    setTheme(next);
    localStorage.setItem("dashboard-theme", next);
  };

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
    <div className={`app-shell ${theme}`}>
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
          <div className="topbar-actions">
            {(page === "upload" || page === "dashboard") && (
              <DateControls range={range} setRange={setRange} />
            )}
            <button className="theme-toggle" onClick={toggleTheme}>{theme === "dark" ? "Light" : "Dark"}</button>
          </div>
        </header>

        {page === "upload" && <UploadPage data={data} commitData={commitData} setRange={setRange} />}
        {page === "dashboard" && (
          <>
            <div className="panel wide">
              <MonthSalesCalendar
                month={range.from.slice(0, 7)}
                selectedDate={range.from}
                data={data}
                onSelectDate={(date) => setRange({ from: date, to: date })}
                onChangeMonth={(month) => {
                  const nextDate = `${month}-01`;
                  setRange({ from: nextDate, to: endOfMonth(nextDate) });
                }}
              />
            </div>
            <DashboardPage kpis={kpis} people={scopedPeople} platforms={scopedPlatforms} ads={scopedAds} />
          </>
        )}
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
  const setDate = (date: string, edge: "from" | "to") => {
    setRange({ ...range, [edge]: date });
  };
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
        <input type="date" value={range.from} onChange={(event) => setDate(event.target.value, "from")} />
      </label>
      <label>
        إلى
        <input type="date" value={range.to} onChange={(event) => setDate(event.target.value, "to")} />
      </label>
    </div>
  );
}

function UploadPage({ data, commitData, setRange }: { data: AppData; commitData: CommitData; setRange: (range: DateRange) => void }) {
  const [uploadUnlocked, setUploadUnlocked] = useState(false);
  const [uploadPassword, setUploadPassword] = useState("");
  const [authMessage, setAuthMessage] = useState("اكتبي باسورد الرفع للمتابعة.");
  const [salesFile, setSalesFile] = useState<File | null>(null);
  const [salesDate, setSalesDate] = useState(today);
  const [peoplePreview, setPeoplePreview] = useState<SalesBySalesperson[]>([]);
  const [platformPreview, setPlatformPreview] = useState<SalesByPlatform[]>([]);
  const [ocrProgress, setOcrProgress] = useState("");
  const [ocrText, setOcrText] = useState("");
  const [salesMode, setSalesMode] = useState<UploadMode>("merge");

  const handleSalesFile = (file: File | null) => {
    setSalesFile(file);
    setPeoplePreview([]);
    setPlatformPreview([]);
    setOcrText("");
    setOcrProgress("");
    if (file) setSalesDate(inferDateFromFileName(file.name));
  };

  const sourceFileId = useMemo(() => createId(), [salesFile?.name]);
  const existingSalesDate = data.salesBySalesperson.some((row) => row.reportDate === salesDate);
  const selectedMonth = salesDate.slice(0, 7);

  useEffect(() => {
    setSalesMode(existingSalesDate ? "replace" : "merge");
  }, [existingSalesDate, salesDate]);

  const unlockUpload = async () => {
    const response = await fetch("/api/upload-auth", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password: uploadPassword })
    });
    const result = (await response.json()) as { ok: boolean };
    setUploadUnlocked(result.ok);
    setAuthMessage(result.ok ? "تم فتح صفحة الرفع." : "الباسورد غير صحيح.");
  };

  useEffect(() => {
    void unlockUpload();
  }, []);

  const createManualSalesTemplate = () => ({
    people: [blankPerson(salesDate, sourceFileId)],
    platforms: data.platformSettings
      .filter((item) => item.isActive)
      .map((item) => normalizePlatform({ ...blankPlatform(salesDate, sourceFileId), platformName: item.platformName }))
  });

  const runOcr = async () => {
    if (!salesFile) return;
    setOcrProgress("بدء OCR...");
    try {
      const text = await runArabicOcr(salesFile, (message, progress) => setOcrProgress(`${message} ${progress}%`));
      setOcrText(text);
      const parsed = parseSalesOcrText(text, salesDate, sourceFileId);
      const template = createManualSalesTemplate();
      const people = parsed.people.length ? parsed.people : template.people;
      const platforms = parsed.platforms.length ? parsed.platforms : template.platforms;
      setPeoplePreview(people);
      setPlatformPreview(platforms);
      setOcrProgress(
        parsed.people.length || parsed.platforms.length
          ? "تم استخراج أفضل قراءة ممكنة. راجعي الجدول وعدلي أي خلية قبل الحفظ."
          : "لم يكتمل استخراج الجدول تلقائيًا، فتم فتح قالب يدوي منظم للصور و screenshots. اكتبي أو عدلي الأرقام ثم احفظي."
      );
    } catch (error) {
      setOcrProgress(error instanceof Error ? error.message : "تعذر تشغيل OCR");
    }
  };

  const loadSample = () => {
    const sample = createSampleSales(salesDate, sourceFileId);
    const template = createManualSalesTemplate();
    setPeoplePreview(sample.people.length ? sample.people : template.people);
    setPlatformPreview(sample.platforms.length ? sample.platforms : template.platforms);
    setOcrProgress(sample.people.length || sample.platforms.length ? "تم تحميل نموذج قابل للتعديل من شكل التقرير المرفق." : "تم تحميل قالب يدوي لليوم المختار.");
  };

  const saveSales = async () => {
    const normalizedPeople = peoplePreview.map((row) => normalizePerson({ ...row, reportDate: salesDate, sourceFileId }));
    const normalizedPlatforms = platformPreview.map((row) => normalizePlatform({ ...row, reportDate: salesDate, sourceFileId }));
    const hasSalesValues = [...normalizedPeople, ...normalizedPlatforms].some((row) => row.totalOrders > 0 || row.totalRevenue > 0);
    if (!hasSalesValues) {
      setOcrProgress("لا يمكن حفظ تقرير فاضي. راجعي المعاينة أو اكتبي أرقام اليوم أولًا.");
      return;
    }
    const blockingWarnings = [...normalizedPeople, ...normalizedPlatforms].flatMap((row) => severeOcrWarnings(row));
    if (blockingWarnings.length) {
      setOcrProgress("فيه خلايا OCR محتاجة مراجعة يدوية قبل الحفظ: " + blockingWarnings.slice(0, 3).join("، "));
      return;
    }

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
      normalizedPeople,
      normalizedPlatforms,
      existingSalesDate ? salesMode : "merge"
    );
    setOcrProgress("جاري حفظ تقرير المبيعات على Supabase...");
    await commitData(next);
    setRange({ from: salesDate, to: salesDate });
    setOcrProgress("تم حفظ تقرير المبيعات وتحديث اللوحة.");
  };

  const selectSalesDay = (date: string) => {
    setSalesDate(date);
    setRange({ from: date, to: date });
  };

  if (!uploadUnlocked) {
    return (
      <section className="panel upload-panel">
        <div className="section-title">
          <UploadCloud />
          <div>
            <h2>صفحة الرفع محمية</h2>
            <p>{authMessage}</p>
          </div>
        </div>
        <div className="form-row">
          <input
            type="password"
            placeholder="UPLOAD_PASSWORD"
            value={uploadPassword}
            onChange={(event) => setUploadPassword(event.target.value)}
          />
          <button className="primary" onClick={unlockUpload}>فتح الرفع</button>
        </div>
      </section>
    );
  }

  return (
    <section className="content-grid">
      <div className="panel wide">
        <MonthSalesCalendar
          month={selectedMonth}
          selectedDate={salesDate}
          data={data}
          onSelectDate={selectSalesDay}
          onChangeMonth={(month) => {
            const nextDate = `${month}-01`;
            setSalesDate(nextDate);
            setRange({ from: nextDate, to: endOfMonth(nextDate) });
          }}
        />
      </div>

      <div className="panel upload-panel">
        <div className="section-title">
          <UploadCloud />
          <div>
            <h2>رفع صورة تقفيل المبيعات</h2>
            <p>يدعم OCR عربي/إنجليزي، مع مراجعة يدوية قبل الحفظ.</p>
          </div>
        </div>
        <div className="upload-box">
          <input type="file" accept=".jpg,.jpeg,.png,image/jpeg,image/png,image/*" onChange={(event) => handleSalesFile(event.target.files?.[0] ?? null)} />
          <span>{salesFile ? salesFile.name : "اختر صورة التقرير اليومي JPG أو screenshot"}</span>
        </div>
        <div className="form-row">
          <label>
            تاريخ التقرير
            <input type="date" value={salesDate} onChange={(event) => setSalesDate(event.target.value)} />
          </label>
          {existingSalesDate && (
            <label>
              نفس اليوم مرفوع
              <select value={salesMode} onChange={(event) => setSalesMode(event.target.value as UploadMode)}>
                <option value="replace">استبدال صورة اليوم</option>
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
            <p>CSV/Excel من Meta أو TikTok، مقسم حسب صفحة المبيعات ويقبل أكثر من ملف لنفس اليوم.</p>
          </div>
        </div>
        {adUploadPlatforms.map((salesPlatformName) => (
          <div className="ads-platform-group" key={salesPlatformName}>
            <h3>{salesPlatformName}</h3>
            <AdsUpload platform="Meta" salesPlatformName={salesPlatformName} data={data} commitData={commitData} />
            <AdsUpload platform="TikTok" salesPlatformName={salesPlatformName} data={data} commitData={commitData} />
          </div>
        ))}
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

function MonthSalesCalendar({
  month,
  selectedDate,
  data,
  onSelectDate,
  onChangeMonth
}: {
  month: string;
  selectedDate: string;
  data: AppData;
  onSelectDate: (date: string) => void;
  onChangeMonth: (month: string) => void;
}) {
  const days = getMonthDays(month);
  const uploadedDays = new Set(data.salesRawFiles.map((file) => file.reportDate));
  const savedDays = new Set(data.salesBySalesperson.map((row) => row.reportDate));
  const monthUploadedCount = days.filter((date) => uploadedDays.has(date) || savedDays.has(date)).length;

  return (
    <div className="month-sales">
      <div className="section-title">
        <CalendarDays />
        <div>
          <h2>تقسيمة رفع مبيعات الشهر</h2>
          <p>اختاري يوم واحد، ارفعي صورة التقفيل الخاصة به، وبعد الحفظ يظهر اليوم هنا ويتحدث الداشبورد تلقائيًا.</p>
        </div>
      </div>
      <div className="month-toolbar">
        <label>
          الشهر
          <input type="month" value={month} onChange={(event) => onChangeMonth(event.target.value)} />
        </label>
        <Badge text={`${monthUploadedCount} يوم مرفوع من ${days.length}`} />
      </div>
      <div className="month-grid">
        {days.map((date) => {
          const summary = getSalesDaySummary(data, date);
          const isUploaded = uploadedDays.has(date) || savedDays.has(date);
          const isSelected = selectedDate === date;

          return (
            <button
              key={date}
              className={`month-day ${isUploaded ? "uploaded" : "missing"} ${isSelected ? "selected" : ""}`}
              onClick={() => onSelectDate(date)}
            >
              <span className="day-name">{formatWeekday(date)}</span>
              <strong>{Number(date.slice(-2))}</strong>
              <small>{isUploaded ? "مرفوع" : "ناقص"}</small>
              <em>{integer(summary.orders)} طلب</em>
              <em>{money(summary.revenue)}</em>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function AdsUpload({
  platform,
  salesPlatformName,
  data,
  commitData
}: {
  platform: AdsPlatform;
  salesPlatformName: string;
  data: AppData;
  commitData: CommitData;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [reportDate, setReportDate] = useState(today);
  const [adAccountName, setAdAccountName] = useState("");
  const [rows, setRows] = useState<AdsRow[]>([]);
  const [message, setMessage] = useState("");

  const existing = data.adsRawFiles.some(
    (item) =>
      item.reportDate === reportDate &&
      item.adsPlatform === platform &&
      item.salesPlatformName === salesPlatformName &&
      (item.adAccountName || "غير محدد") === (adAccountName || "غير محدد")
  );

  const handleFile = async (selected: File | null) => {
    setFile(selected);
    if (!selected) return;
    const date = inferDateFromFileName(selected.name);
    setReportDate(date);
    const sourceFileId = createId();
    try {
      const parsed = await parseAdsWorkbook(selected, platform, salesPlatformName, date, sourceFileId, adAccountName);
      setRows(parsed);
      const totals = getAdsTotals(parsed);
      setMessage(
        `تمت قراءة ${parsed.length} صف. الصرف ${money(totals.spend)}، الرسائل ${integer(totals.messages)}، التعليقات ${integer(totals.comments)}.`
      );
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
      adAccountName: adAccountName || "غير محدد",
      parsingStatus: "success",
      createdAt: now
    };
    const datedRows = rows.map((row) => ({ ...row, reportDate, salesPlatformName, adAccountName: adAccountName || row.adAccountName || "غير محدد" }));
    setMessage(`جاري حفظ بيانات ${platform} لصفحة ${salesPlatformName}...`);
    const next = await saveAdsUpload(data, rawFile, datedRows, platform, "merge");
    await commitData(next);
    setMessage(existing ? `تم دمج ملف جديد مع بيانات ${platform} لصفحة ${salesPlatformName}.` : `تم حفظ بيانات ${platform} لصفحة ${salesPlatformName}.`);
  };

  return (
    <div className="ads-upload-card">
      <div>
        <strong>{platform === "Meta" ? "Meta Ads" : "TikTok Ads"}</strong>
        <span>{rows.length ? `${rows.length} صف جاهز لصفحة ${salesPlatformName}` : "اختر الصفحة ثم ملف الإعلانات"}</span>
      </div>
      <input placeholder="اسم حساب الإعلانات" value={adAccountName} onChange={(event) => setAdAccountName(event.target.value)} />
      <input type="file" accept=".xlsx,.xls,.csv" onChange={(event) => handleFile(event.target.files?.[0] ?? null)} />
      <input type="date" value={reportDate} onChange={(event) => setReportDate(event.target.value)} />
      <button disabled={!rows.length} onClick={save}>
        {existing ? "دمج" : "حفظ"}
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
        <Kpi title="إجمالي الرسائل اليومية" value={integer(kpis.messagesCount)} />
        <Kpi title="نسبة المبيعات من الرسائل" value={percent(kpis.messageConversionRate ?? 0)} />
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
            <LineChart data={trend} margin={{ top: 12, right: 18, left: 8, bottom: 12 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#263241" />
              <XAxis dataKey="date" stroke="#94a3b8" tick={{ fontSize: 12 }} />
              <YAxis stroke="#94a3b8" tick={{ fontSize: 12 }} width={70} />
              <Tooltip contentStyle={chartTooltipStyle} labelStyle={{ color: "#bae6fd" }} />
              <Line type="monotone" dataKey="revenue" name="المبيعات" stroke="#38bdf8" strokeWidth={3} />
              <Line type="monotone" dataKey="orders" name="الطلبات" stroke="#34d399" strokeWidth={3} />
            </LineChart>
          </ResponsiveContainer>
        </ChartPanel>
        <ChartPanel title="مصروف الإعلانات و ROAS">
          <ResponsiveContainer width="100%" height={280}>
            <LineChart data={trend} margin={{ top: 12, right: 18, left: 8, bottom: 12 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#263241" />
              <XAxis dataKey="date" stroke="#94a3b8" tick={{ fontSize: 12 }} />
              <YAxis stroke="#94a3b8" tick={{ fontSize: 12 }} width={70} />
              <Tooltip contentStyle={chartTooltipStyle} labelStyle={{ color: "#bae6fd" }} />
              <Line type="monotone" dataKey="spend" name="المصروف" stroke="#f59e0b" strokeWidth={3} />
              <Line type="monotone" dataKey="roas" name="ROAS" stroke="#a78bfa" strokeWidth={3} />
            </LineChart>
          </ResponsiveContainer>
        </ChartPanel>
        <ChartPanel title="صباحي مقابل مسائي">
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={shiftData} margin={{ top: 12, right: 18, left: 8, bottom: 12 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#263241" />
              <XAxis dataKey="name" stroke="#94a3b8" tick={{ fontSize: 12 }} />
              <YAxis stroke="#94a3b8" tick={{ fontSize: 12 }} width={70} />
              <Tooltip contentStyle={chartTooltipStyle} labelStyle={{ color: "#bae6fd" }} />
              <Bar dataKey="orders" name="طلبات" fill="#22c55e" radius={[8, 8, 0, 0]} />
              <Bar dataKey="revenue" name="قيمة" fill="#0ea5e9" radius={[8, 8, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartPanel>
        <ChartPanel title="المبيعات حسب السيلز">
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={byPeople} margin={{ top: 12, right: 18, left: 8, bottom: 28 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#263241" />
              <XAxis dataKey="salespersonName" stroke="#94a3b8" tick={{ fontSize: 11 }} interval={0} angle={-18} textAnchor="end" height={52} />
              <YAxis stroke="#94a3b8" tick={{ fontSize: 12 }} width={70} />
              <Tooltip contentStyle={chartTooltipStyle} labelStyle={{ color: "#bae6fd" }} />
              <Bar dataKey="totalRevenue" name="قيمة" fill="#38bdf8" radius={[8, 8, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartPanel>
        <ChartPanel title="الطلبات حسب الصفحات">
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={byPlatform} margin={{ top: 12, right: 18, left: 8, bottom: 28 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#263241" />
              <XAxis dataKey="platformName" stroke="#94a3b8" tick={{ fontSize: 11 }} interval={0} angle={-18} textAnchor="end" height={52} />
              <YAxis stroke="#94a3b8" tick={{ fontSize: 12 }} width={70} />
              <Tooltip contentStyle={chartTooltipStyle} labelStyle={{ color: "#bae6fd" }} />
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
  const filtered = rows
    .filter((row) => `${row.salespersonName} ${row.salespersonCode}`.includes(query))
    .sort((a, b) => b.totalRevenue - a.totalRevenue);
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
              <th>الرسائل</th>
              <th>الكومنتات</th>
              <th>تحويل الرسائل</th>
              <th>ROAS للصفحة</th>
              <th>CPA للصفحة</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const relatedAds = relatedAdsForPlatform(ads, row.platformName);
              const relatedSpend = relatedAds.reduce((total, ad) => total + ad.spend, 0);
              const messages = relatedAds.reduce((total, ad) => total + (Number(ad.messagesCount) || 0), 0);
              const comments = relatedAds.reduce((total, ad) => total + (Number(ad.commentsCount) || 0), 0);
              const messageConversion = messages ? (row.totalOrders / messages) * 100 : 0;
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
                  <td>{integer(messages)}</td>
                  <td>{integer(comments)}</td>
                  <td>{percent(messageConversion)}</td>
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
      {
        date: string;
        salesPlatformName: string;
        metaSpend: number;
        tiktokSpend: number;
        totalSpend: number;
        messages: number;
        comments: number;
        impressions: number;
        reach: number;
        clicks: number;
        sales: number;
        orders: number;
      }
    >();
    for (const ad of rows) {
      const key = `${ad.reportDate}-${ad.salesPlatformName}`;
      const item = dates.get(key) ?? {
        date: ad.reportDate,
        salesPlatformName: ad.salesPlatformName,
        metaSpend: 0,
        tiktokSpend: 0,
        totalSpend: 0,
        messages: 0,
        comments: 0,
        impressions: 0,
        reach: 0,
        clicks: 0,
        sales: 0,
        orders: 0
      };
      if (ad.adsPlatform === "Meta") item.metaSpend += ad.spend;
      if (ad.adsPlatform === "TikTok") item.tiktokSpend += ad.spend;
      item.totalSpend = item.metaSpend + item.tiktokSpend;
      item.messages += Number(ad.messagesCount) || 0;
      item.comments += Number(ad.commentsCount) || 0;
      item.impressions += ad.impressions;
      item.reach += ad.reach;
      item.clicks += ad.clicks;
      dates.set(key, item);
    }
    for (const sale of platforms) {
      const matchedAdPlatform = [...dates.values()].find(
        (item) =>
          item.date === sale.reportDate &&
          normalizeSalesPlatform(item.salesPlatformName) === normalizeSalesPlatform(sale.platformName)
      )?.salesPlatformName;
      const key = `${sale.reportDate}-${matchedAdPlatform ?? sale.platformName}`;
      const item = dates.get(key) ?? {
        date: sale.reportDate,
        salesPlatformName: matchedAdPlatform ?? sale.platformName,
        metaSpend: 0,
        tiktokSpend: 0,
        totalSpend: 0,
        messages: 0,
        comments: 0,
        impressions: 0,
        reach: 0,
        clicks: 0,
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
                <th>Messages</th>
                <th>Comments</th>
                <th>Impressions</th>
                <th>Reach</th>
                <th>Clicks</th>
                <th>المبيعات</th>
                <th>الطلبات</th>
                <th>تحويل الرسائل</th>
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
                  <td>{integer(row.messages)}</td>
                  <td>{integer(row.comments)}</td>
                  <td>{integer(row.impressions)}</td>
                  <td>{integer(row.reach)}</td>
                  <td>{integer(row.clicks)}</td>
                  <td>{money(row.sales)}</td>
                  <td>{integer(row.orders)}</td>
                  <td>{percent(row.messages ? (row.orders / row.messages) * 100 : 0)}</td>
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
                <th>حساب الإعلانات</th>
                <th>الحملة</th>
                <th>Ad set / Group</th>
                <th>Ad</th>
                <th>Spend</th>
                <th>Messages</th>
                <th>Comments</th>
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
                  <td>{row.adAccountName || "غير محدد"}</td>
                  <td>{row.campaignName}</td>
                  <td>{row.adsetName}</td>
                  <td>{row.adName}</td>
                  <td>{money(row.spend)}</td>
                  <td>{integer(row.messagesCount || 0)}</td>
                  <td>{integer(row.commentsCount || 0)}</td>
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
            <th>الخلية</th>
            <th>الاسم</th>
            <th>الكود</th>
            <th>طلبات صباحي</th>
            <th>قيمة صباحي</th>
            <th>طلبات مسائي</th>
            <th>قيمة مسائي</th>
            <th>الإجمالي</th>
            <th>OCR</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const warnings = ocrWarningMessages(row);
            return (
            <tr key={row.id} className={row.totalOrders <= 0 && row.totalRevenue <= 0 ? "suspicious" : ""}>
              <td>{row.ocrCellImages?.name ? <img className="ocr-cell-image" src={row.ocrCellImages.name} alt="" /> : "-"}</td>
              <td><input value={row.salespersonName} onChange={(event) => update(row.id, "salespersonName", event.target.value)} /></td>
              <td><input value={row.salespersonCode} onChange={(event) => update(row.id, "salespersonCode", event.target.value)} /></td>
              <td><input type="number" value={row.morningOrders} onChange={(event) => update(row.id, "morningOrders", event.target.value)} /></td>
              <td><input type="number" value={row.morningRevenue} onChange={(event) => update(row.id, "morningRevenue", event.target.value)} /></td>
              <td><input type="number" value={row.eveningOrders} onChange={(event) => update(row.id, "eveningOrders", event.target.value)} /></td>
              <td><input type="number" value={row.eveningRevenue} onChange={(event) => update(row.id, "eveningRevenue", event.target.value)} /></td>
              <td>{reviewTotal(row.totalRevenue, row.totalOrders)}</td>
              <td className={warnings.length ? "ocr-warning-cell" : ""}>{row.ocrConfidence ? `${row.ocrConfidence}%` : "-"}{warnings.length ? <small>{warnings.join("، ")}</small> : null}</td>
            </tr>
            );
          })}
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
            <th>الخلية</th>
            <th>الصفحة</th>
            <th>طلبات صباحي</th>
            <th>قيمة صباحي</th>
            <th>طلبات مسائي</th>
            <th>قيمة مسائي</th>
            <th>الإجمالي</th>
            <th>OCR</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const warnings = ocrWarningMessages(row);
            return (
            <tr key={row.id} className={row.totalOrders <= 0 && row.totalRevenue <= 0 ? "suspicious" : ""}>
              <td>{row.ocrCellImages?.name ? <img className="ocr-cell-image" src={row.ocrCellImages.name} alt="" /> : "-"}</td>
              <td><input value={row.platformName} onChange={(event) => update(row.id, "platformName", event.target.value)} /></td>
              <td><input type="number" value={row.morningOrders} onChange={(event) => update(row.id, "morningOrders", event.target.value)} /></td>
              <td><input type="number" value={row.morningRevenue} onChange={(event) => update(row.id, "morningRevenue", event.target.value)} /></td>
              <td><input type="number" value={row.eveningOrders} onChange={(event) => update(row.id, "eveningOrders", event.target.value)} /></td>
              <td><input type="number" value={row.eveningRevenue} onChange={(event) => update(row.id, "eveningRevenue", event.target.value)} /></td>
              <td>{reviewTotal(row.totalRevenue, row.totalOrders)}</td>
              <td className={warnings.length ? "ocr-warning-cell" : ""}>{row.ocrConfidence ? `${row.ocrConfidence}%` : "-"}{warnings.length ? <small>{warnings.join("، ")}</small> : null}</td>
            </tr>
            );
          })}
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

const getMonthDays = (month: string) => {
  const [year, monthNumber] = month.split("-").map(Number);
  const daysInMonth = new Date(year, monthNumber, 0).getDate();
  return Array.from({ length: daysInMonth }, (_, index) => formatDateParts(year, monthNumber, index + 1));
};

const endOfMonth = (date: string) => {
  const [year, monthNumber] = date.slice(0, 7).split("-").map(Number);
  return formatDateParts(year, monthNumber, new Date(year, monthNumber, 0).getDate());
};

const formatDateParts = (year: number, monthNumber: number, day: number) =>
  `${year}-${String(monthNumber).padStart(2, "0")}-${String(day).padStart(2, "0")}`;

const formatWeekday = (date: string) =>
  new Intl.DateTimeFormat("ar-EG", { weekday: "short" }).format(new Date(`${date}T12:00:00`));

const getSalesDaySummary = (data: AppData, date: string) => {
  const rows = data.salesBySalesperson.filter((row) => row.reportDate === date);
  return {
    orders: rows.reduce((total, row) => total + row.totalOrders, 0),
    revenue: rows.reduce((total, row) => total + row.totalRevenue, 0)
  };
};

const numericField = (field: string) => /Orders|Revenue|spend|impressions|reach|clicks|ctr|cpc|cpm|leads|purchases|Value/.test(field);

const ocrWarningMessages = (row: SalesBySalesperson | SalesByPlatform) =>
  Object.values(row.ocrFieldWarnings ?? {}).flat();

const severeOcrWarnings = (row: SalesBySalesperson | SalesByPlatform) =>
  ocrWarningMessages(row).filter((message) => /منخفضة|رفضها|محتاجة مراجعة|غير رقمية/.test(message));

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
