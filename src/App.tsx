"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { ElementType, ReactNode } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  Legend,
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
  Moon,
  Plus,
  Save,
  Settings,
  Sun,
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
  OcrPageCorrection,
  OcrSalespersonCorrection,
  PageKey,
  PlatformMaster,
  SalesByPlatform,
  SalesBySalesperson,
  SalesRawFile
} from "./types";
import { calculateKpis, dailyTrend, filterAds, filterPeople, filterPlatforms, aggregatePeople, aggregatePlatforms, isSubtotalPlatformName } from "./lib/metrics";
import {
  createId,
  deleteAdsForDate,
  deleteDataForDate,
  deleteRawFile,
  emptyData,
  getStorageMode,
  loadData,
  saveAdsUpload,
  saveData,
  saveSalesUpload,
  subscribeToDataChanges
} from "./lib/storage";
import { parseAdsWorkbook, parseSalesWorkbook } from "./lib/parsing";

const today = new Date().toISOString().slice(0, 10);
const numberFormat = new Intl.NumberFormat("ar-EG");
const adUploadPlatforms = ["ريجينكس", "ريجينكس eg", "واتساب ريجينكس"];
const chartTooltipStyle = { background: "#111827", border: "1px solid #263241", borderRadius: 8, color: "#e5edf5" };

const money = (value: number | null) => (value === null ? "N/A" : `${numberFormat.format(Math.round(value))} ج`);
const integer = (value: number | null) => (value === null ? "N/A" : numberFormat.format(Math.round(value)));
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
        <div className="sidebar-footer">
          <button className="theme-toggle" onClick={toggleTheme}>
            {theme === "dark" ? <Sun size={18} /> : <Moon size={18} />}
            <span>{theme === "dark" ? "Light Mode" : "Dark Mode"}</span>
          </button>
          <div className="admin-card">
            <UserCircle size={22} />
            <div>
              <strong>Admin</strong>
              <small>{getStorageMode()}</small>
            </div>
          </div>
        </div>
      </aside>

      <main className="main">
        <header className="topbar">
          <div>
            <p className="eyebrow">MVP مباشر</p>
            <h1>{navItems.find((item) => item.key === page)?.label}</h1>
            <p className="sync-status">{syncStatus}</p>
          </div>
          <div className="topbar-actions">
            {page === "dashboard" && (
              <DateControls range={range} setRange={setRange} />
            )}
          </div>
        </header>

        {page === "upload" && <UploadPage data={data} commitData={commitData} setRange={setRange} activeDate={range.from} />}
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
            <DashboardPage
              kpis={kpis}
              people={scopedPeople}
              platforms={scopedPlatforms}
              ads={scopedAds}
              data={data}
              selectedDate={range.from}
              onReplaceDate={() => setPage("upload")}
              onDeleteDate={async (date) => {
                if (!window.confirm(`Delete all saved data for ${date}?`)) return;
                const next = await deleteDataForDate(data, date);
                await commitData(next);
                setRange({ from: date, to: date });
              }}
            />
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

function UploadPage({
  data,
  commitData,
  setRange,
  activeDate
}: {
  data: AppData;
  commitData: CommitData;
  setRange: (range: DateRange) => void;
  activeDate: string;
}) {
  const [uploadUnlocked, setUploadUnlocked] = useState(false);
  const [uploadPassword, setUploadPassword] = useState("");
  const [authMessage, setAuthMessage] = useState("اكتبي باسورد الرفع للمتابعة.");
  const [salesExcelFile, setSalesExcelFile] = useState<File | null>(null);
  const [salesExcelUploadedAt, setSalesExcelUploadedAt] = useState("");
  const [salesExcelStatus, setSalesExcelStatus] = useState<"idle" | "uploaded" | "previewed" | "saved">("idle");
  const [salesPreviewVisible, setSalesPreviewVisible] = useState(true);
  const [salesDate, setSalesDate] = useState(today);
  const [peoplePreview, setPeoplePreview] = useState<SalesBySalesperson[]>([]);
  const [platformPreview, setPlatformPreview] = useState<SalesByPlatform[]>([]);
  const [originalPeoplePreview, setOriginalPeoplePreview] = useState<SalesBySalesperson[]>([]);
  const [originalPlatformPreview, setOriginalPlatformPreview] = useState<SalesByPlatform[]>([]);
  const [uploadMessage, setUploadMessage] = useState("");
  const salesExcelInputRef = useRef<HTMLInputElement | null>(null);

  const resetSalesPreview = () => {
    setPeoplePreview([]);
    setPlatformPreview([]);
    setOriginalPeoplePreview([]);
    setOriginalPlatformPreview([]);
    setUploadMessage("");
  };

  const handleSalesExcelFile = (file: File | null) => {
    setSalesExcelFile(file);
    setSalesExcelUploadedAt(file ? new Date().toISOString() : "");
    setSalesExcelStatus(file ? "uploaded" : "idle");
    setSalesPreviewVisible(false);
    resetSalesPreview();
    if (file) {
      setUploadMessage("File uploaded successfully. اضغطي Preview لمراجعة البيانات قبل الحفظ.");
    }
  };

  const sourceFileId = useMemo(() => createId(), [salesExcelFile?.name]);
  const existingSalesDate =
    data.salesBySalesperson.some((row) => row.reportDate === salesDate) ||
    data.salesByPlatform.some((row) => row.reportDate === salesDate) ||
    data.salesRawFiles.some((file) => file.reportDate === salesDate);
  useEffect(() => {
    if (activeDate) setSalesDate(activeDate);
  }, [activeDate]);

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

  const previewSalesExcel = async () => {
    if (!salesExcelFile) return;
    setUploadMessage("جاري قراءة ملف Excel/CSV...");
    try {
      const parsed = await parseSalesWorkbook(salesExcelFile, salesDate, sourceFileId);
      const people = parsed.people;
      const platforms = parsed.platforms;
      setOriginalPeoplePreview(cloneSalesRows(people));
      setOriginalPlatformPreview(cloneSalesRows(platforms));
      setPeoplePreview(people);
      setPlatformPreview(platforms);
      setUploadMessage(
        parsed.people.length || parsed.platforms.length
          ? "Preview ready. تمت قراءة ملف المبيعات. راجعي الجدول وعدلي أي خلية قبل الحفظ."
          : "لم يتم العثور على جدول السيلز أو جدول الصفحات داخل الملف. تأكدي من الأعمدة العربية المطلوبة."
      );
      setSalesExcelStatus("previewed");
      setSalesPreviewVisible(true);
    } catch (error) {
      setUploadMessage(error instanceof Error ? error.message : "تعذر قراءة ملف المبيعات");
    }
  };

  const saveSales = async (forceReplace = false) => {
    if (existingSalesDate && !forceReplace && !window.confirm("Data already exists for this date. Replace old sales data?")) {
      setUploadMessage("تم إلغاء الحفظ، لم يتم استبدال بيانات اليوم.");
      return;
    }
    const totalMismatches = [...peoplePreview, ...platformPreview].filter(hasSalesTotalMismatch);
    if (totalMismatches.length) {
      setUploadMessage("لا يمكن الحفظ: فيه صفوف إجماليها لا يساوي صباحي + مسائي. صححي الصفوف المظللة بالأحمر الأول.");
      setSalesPreviewVisible(true);
      return;
    }
    const reconciliation = getSalesPreviewReconciliation(peoplePreview, platformPreview);
    if (!reconciliation.canSave) {
      setUploadMessage("Parsed totals do not match report totals. راجعي الإجماليات وصححي الصفوف قبل الحفظ.");
      setSalesPreviewVisible(true);
      return;
    }
    const detailPeoplePreview = peoplePreview.filter((row) => !isSalespersonSummaryRow(row));
    const detailPlatformPreview = platformPreview.filter((row) => !isPlatformSummaryRow(row));
    const normalizedPeople = detailPeoplePreview.map((row) => normalizePerson({ ...row, reportDate: salesDate, sourceFileId }));
    const normalizedPlatforms = detailPlatformPreview.map((row) => normalizePlatform({ ...row, reportDate: salesDate, sourceFileId }));
    const hasSalesValues = [...normalizedPeople, ...normalizedPlatforms].some((row) => row.totalOrders > 0 || row.totalRevenue > 0);
    if (!hasSalesValues) {
      setUploadMessage("لا يمكن حفظ تقرير فاضي. راجعي المعاينة أو اكتبي أرقام اليوم أولًا.");
      return;
    }
    const now = new Date().toISOString();
    const rawFile: SalesRawFile = {
      id: sourceFileId,
      fileName: salesExcelFile?.name ?? "sales-report",
      filePath: salesExcelFile?.name ?? "manual",
      uploadedAt: now,
      reportDate: salesDate,
      ocrStatus: "manual",
      createdAt: now
    };
    const learnedData = buildOcrLearningData(data, originalPeoplePreview, normalizedPeople, originalPlatformPreview, normalizedPlatforms);
    const next = await saveSalesUpload(
      learnedData,
      rawFile,
      normalizedPeople,
      normalizedPlatforms,
      "replace"
    );
    setUploadMessage("جاري حفظ تقرير المبيعات على Supabase...");
    await commitData(next);
    setRange({ from: salesDate, to: salesDate });
    setUploadMessage("Final data saved. تم حفظ تقرير المبيعات وتحديث اللوحة.");
    setSalesExcelStatus("saved");
    setSalesPreviewVisible(true);
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
      <div className="panel upload-panel">
        <div className="section-title">
          <FileSpreadsheet />
          <div>
            <h2>رفع تقفيل المبيعات</h2>
            <p>Excel / CSV فقط. ارفعي الملف، اختاري تاريخ التقرير، اعملي Preview، وبعد المراجعة احفظي البيانات.</p>
          </div>
        </div>
        <input
          ref={salesExcelInputRef}
          type="file"
          accept=".xlsx,.xls,.csv,text/csv,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
          onChange={(event) => handleSalesExcelFile(event.target.files?.[0] ?? null)}
        />
        {salesExcelFile && (
          <div className="file-status-card simple">
            <div>
              <strong>{salesExcelFile.name}</strong>
              <small>{salesExcelUploadedAt ? new Date(salesExcelUploadedAt).toLocaleString("ar-EG") : ""}</small>
            </div>
            <Badge text={salesExcelStatusLabel(salesExcelStatus)} />
          </div>
        )}
        <div className="form-row">
          <label>
            تاريخ التقرير
            <input type="date" value={salesDate} onChange={(event) => setSalesDate(event.target.value)} />
          </label>
          {existingSalesDate && <Badge text="هذا اليوم محفوظ، الحفظ الجديد سيطلب تأكيد الاستبدال" />}
        </div>
        <div className="actions">
          <button className="primary" disabled={!salesExcelFile} onClick={previewSalesExcel}>
            <FileSpreadsheet size={18} /> Preview
          </button>
          {salesPreviewVisible && (peoplePreview.length > 0 || platformPreview.length > 0) && (
            <button
              className="success"
              disabled={!getSalesPreviewReconciliation(peoplePreview, platformPreview).canSave}
              onClick={() => void saveSales(existingSalesDate)}
            >
              <Save size={18} /> {existingSalesDate ? "Replace Existing Data" : "Save Data"}
            </button>
          )}
        </div>
        {uploadMessage && <p className="status-line">{uploadMessage}</p>}
      </div>

      {salesPreviewVisible && (peoplePreview.length > 0 || platformPreview.length > 0) && (
        <div className="panel wide">
          <SimpleSalesPreview
            data={data}
            peopleRows={peoplePreview}
            platformRows={platformPreview}
            setPeopleRows={setPeoplePreview}
            setPlatformRows={setPlatformPreview}
          />
        </div>
      )}
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

function AdsFileManager({
  data,
  commitData,
  reportDate,
  setReportDate
}: {
  data: AppData;
  commitData: CommitData;
  reportDate: string;
  setReportDate: (date: string) => void;
}) {
  const [message, setMessage] = useState("");
  const [activeFiles, setActiveFiles] = useState<{ salesPlatformName: string; platform: AdsPlatform } | null>(null);
  const [adAccountName, setAdAccountName] = useState("غير محدد");
  const salesFiles = data.salesRawFiles.filter((file) => file.reportDate === reportDate);
  const dateAdsFiles = data.adsRawFiles.filter((file) => file.reportDate === reportDate);
  const recentUploads = [...data.salesRawFiles, ...data.adsRawFiles]
    .sort((a, b) => b.uploadedAt.localeCompare(a.uploadedAt))
    .slice(0, 12);

  const uploadAdsFile = async (file: File | null, salesPlatformName: string, platform: AdsPlatform) => {
    if (!file) return;
    const existing = data.adsRawFiles.some(
      (item) => item.reportDate === reportDate && item.adsPlatform === platform && item.salesPlatformName === salesPlatformName
    );
    if (existing && !window.confirm("Data already exists for this date. Replace old data?")) {
      setMessage("تم إلغاء الرفع، لم يتم تغيير البيانات.");
      return;
    }

    const sourceFileId = createId();
    try {
      setMessage(`جاري قراءة ${file.name}...`);
      const parsed = await parseAdsWorkbook(file, platform, salesPlatformName, reportDate, sourceFileId, adAccountName);
      const now = new Date().toISOString();
      const rawFile: AdsRawFile = {
        id: sourceFileId,
        fileName: file.name,
        filePath: file.name,
        uploadedAt: now,
        reportDate,
        adsPlatform: platform,
        salesPlatformName,
        adAccountName: adAccountName || "غير محدد",
        parsingStatus: "success",
        createdAt: now
      };
      const rows = parsed.map((row) => ({
        ...row,
        reportDate,
        salesPlatformName,
        adAccountName: adAccountName || row.adAccountName || "غير محدد",
        sourceFileId
      }));
      const next = await saveAdsUpload(data, rawFile, rows, platform, existing ? "replace" : "merge");
      await commitData(next);
      setMessage(`تم حفظ ${rows.length} صف من ${platform} لصفحة ${salesPlatformName}.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "تعذر قراءة ملف الإعلانات");
    }
  };

  const deleteDate = async () => {
    if (!window.confirm(`Delete all data for ${reportDate}?`)) return;
    const next = await deleteDataForDate(data, reportDate);
    await commitData(next);
    setMessage("تم حذف بيانات اليوم وتحديث الداشبورد.");
  };

  const deletePlatformDate = async (platform: AdsPlatform) => {
    if (!window.confirm(`Delete all ${platform} ads files for ${reportDate}?`)) return;
    const next = await deleteAdsForDate(data, reportDate, platform);
    await commitData(next);
    setMessage(`تم حذف ملفات ${platform} لهذا اليوم.`);
  };

  const deleteCardFiles = async (salesPlatformName: string, platform: AdsPlatform) => {
    if (!window.confirm(`Delete ${platform} files for ${salesPlatformName} on ${reportDate}?`)) return;
    const tableKey = platform === "Meta" ? "metaAds" : "tiktokAds";
    const next = {
      ...data,
      adsRawFiles: data.adsRawFiles.filter(
        (file) => !(file.reportDate === reportDate && file.adsPlatform === platform && file.salesPlatformName === salesPlatformName)
      ),
      [tableKey]: data[tableKey].filter((row) => !(row.reportDate === reportDate && row.salesPlatformName === salesPlatformName))
    };
    await commitData(next);
    setMessage(`تم حذف ملفات ${platform} الخاصة بصفحة ${salesPlatformName}.`);
  };

  const deleteFile = async (fileId: string) => {
    if (!window.confirm("Delete this file and its imported rows?")) return;
    const next = await deleteRawFile(data, fileId);
    await commitData(next);
    setMessage("تم حذف الملف والصفوف المرتبطة به.");
  };

  return (
    <div className="ads-file-manager">
      <div className="section-title">
        <FileSpreadsheet />
        <div>
          <h2>إدارة ملفات الإعلانات</h2>
          <p>اختاري التاريخ أولًا، ثم ارفعي أو استبدلي ملفات Meta و TikTok لكل صفحة من مكان واحد.</p>
        </div>
      </div>

      <div className="file-manager-toolbar">
        <label>
          تاريخ الملفات
          <input type="date" value={reportDate} onChange={(event) => setReportDate(event.target.value)} />
        </label>
        <label>
          حساب الإعلانات
          <input value={adAccountName} onChange={(event) => setAdAccountName(event.target.value)} placeholder="اسم حساب الإعلانات" />
        </label>
        <button onClick={deleteDate}>Delete Data by Date</button>
        <button onClick={() => deletePlatformDate("Meta")}>Delete Meta for Date</button>
        <button onClick={() => deletePlatformDate("TikTok")}>Delete TikTok for Date</button>
      </div>

      <div className="upload-status-strip">
        <StatusPill label="Sales" count={salesFiles.length} tone={salesFiles.length ? "green" : "red"} />
        <StatusPill label="Meta Ads" count={dateAdsFiles.filter((file) => file.adsPlatform === "Meta").length} tone={dateAdsFiles.some((file) => file.adsPlatform === "Meta") ? "green" : "red"} />
        <StatusPill label="TikTok Ads" count={dateAdsFiles.filter((file) => file.adsPlatform === "TikTok").length} tone={dateAdsFiles.some((file) => file.adsPlatform === "TikTok") ? "green" : "red"} />
      </div>

      <div className="ads-status-grid">
        {adUploadPlatforms.map((salesPlatformName) => (
          <article className="ads-status-card" key={salesPlatformName}>
            <div className="card-heading">
              <h3>{salesPlatformName}</h3>
              <Badge text={platformUploadTone(data, reportDate, salesPlatformName)} />
            </div>
            {(["Meta", "TikTok"] as AdsPlatform[]).map((platform) => {
              const files = filesForAdsCard(data, reportDate, salesPlatformName, platform);
              const rowsCount = rowsForAdsCard(data, reportDate, salesPlatformName, platform).length;
              return (
                <div className="ads-platform-line" key={platform}>
                  <div>
                    <strong>{platform} Ads</strong>
                    <span>{files.length ? `Uploaded (${files.length} files, ${rowsCount} rows)` : "No Files"}</span>
                  </div>
                  <StatusDot uploaded={files.length > 0} />
                  <label className="compact-upload">
                    Upload
                    <input type="file" accept=".xlsx,.xls,.csv" onChange={(event) => uploadAdsFile(event.target.files?.[0] ?? null, salesPlatformName, platform)} />
                  </label>
                  <button disabled={!files.length} onClick={() => setActiveFiles({ salesPlatformName, platform })}>View Files</button>
                  <button disabled={!files.length} onClick={() => deleteCardFiles(salesPlatformName, platform)}>Delete</button>
                </div>
              );
            })}
          </article>
        ))}
      </div>

      <div className="upload-history">
        <h3>Recent Uploads</h3>
        <div className="table-wrap compact-table">
          <table>
            <thead>
              <tr>
                <th>Date</th>
                <th>Brand</th>
                <th>Platform</th>
                <th>File Name</th>
                <th>Imported Rows</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {recentUploads.map((file) => (
                <tr key={file.id}>
                  <td>{file.reportDate}</td>
                  <td>{"salesPlatformName" in file ? file.salesPlatformName : "Sales"}</td>
                  <td>{"adsPlatform" in file ? file.adsPlatform : "Sales"}</td>
                  <td>{file.fileName}</td>
                  <td>{rowCountForFile(data, file.id)}</td>
                  <td><Badge text={"parsingStatus" in file ? file.parsingStatus : file.ocrStatus} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {activeFiles && (
        <FileListModal
          data={data}
          reportDate={reportDate}
          salesPlatformName={activeFiles.salesPlatformName}
          platform={activeFiles.platform}
          onClose={() => setActiveFiles(null)}
          onDelete={deleteFile}
          onReplace={(file) => uploadAdsFile(file, activeFiles.salesPlatformName, activeFiles.platform)}
        />
      )}

      {message && <p className="status-line">{message}</p>}
    </div>
  );
}

function StatusPill({ label, count, tone }: { label: string; count: number; tone: "green" | "yellow" | "red" }) {
  return (
    <div className={`status-pill ${tone}`}>
      <strong>{label}</strong>
      <span>{count ? `${count} files` : "Missing Data"}</span>
    </div>
  );
}

function StatusDot({ uploaded }: { uploaded: boolean }) {
  return <span className={`status-dot ${uploaded ? "green" : "red"}`}>{uploaded ? "Uploaded" : "No Files"}</span>;
}

function FileListModal({
  data,
  reportDate,
  salesPlatformName,
  platform,
  onClose,
  onDelete,
  onReplace
}: {
  data: AppData;
  reportDate: string;
  salesPlatformName: string;
  platform: AdsPlatform;
  onClose: () => void;
  onDelete: (fileId: string) => void;
  onReplace: (file: File | null) => void;
}) {
  const files = filesForAdsCard(data, reportDate, salesPlatformName, platform);
  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true">
      <div className="file-modal">
        <div className="table-header">
          <h2>{salesPlatformName} - {platform} Ads</h2>
          <button onClick={onClose}>إغلاق</button>
        </div>
        <div className="table-wrap compact-table">
          <table>
            <thead>
              <tr>
                <th>File Name</th>
                <th>Upload Time</th>
                <th>Rows Imported</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {files.map((file) => (
                <tr key={file.id}>
                  <td>{file.fileName}</td>
                  <td>{new Date(file.uploadedAt).toLocaleString("ar-EG")}</td>
                  <td>{rowCountForFile(data, file.id)}</td>
                  <td><Badge text={file.parsingStatus} /></td>
                  <td>
                    <div className="inline-actions">
                      <button onClick={() => onDelete(file.id)}>Delete</button>
                      <label className="compact-upload">
                        Replace
                        <input type="file" accept=".xlsx,.xls,.csv" onChange={(event) => onReplace(event.target.files?.[0] ?? null)} />
                      </label>
                    </div>
                  </td>
                </tr>
              ))}
              {!files.length && (
                <tr>
                  <td colSpan={5}>No files uploaded for this date.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function DashboardPage({
  kpis,
  people,
  platforms,
  ads,
  data,
  selectedDate,
  onReplaceDate,
  onDeleteDate
}: {
  kpis: ReturnType<typeof calculateKpis>;
  people: SalesBySalesperson[];
  platforms: SalesByPlatform[];
  ads: AdsRow[];
  data: AppData;
  selectedDate: string;
  onReplaceDate: () => void;
  onDeleteDate: (date: string) => void;
}) {
  const trend = dailyTrend(people, ads);
  const byPeople = aggregatePeople(people).slice(0, 8);
  const byPlatform = aggregatePlatforms(platforms).slice(0, 8);
  const selectedFiles = [...data.salesRawFiles, ...data.adsRawFiles].filter((file) => file.reportDate === selectedDate);
  const lastUpload = selectedFiles.sort((a, b) => b.uploadedAt.localeCompare(a.uploadedAt))[0];
  const shiftData = [
    { name: "صباحي", orders: kpis.morningOrders, revenue: kpis.morningRevenue },
    { name: "مسائي", orders: kpis.eveningOrders, revenue: kpis.eveningRevenue }
  ];

  return (
    <section className="dashboard-stack">
      <div className="panel dashboard-file-status">
        <div>
          <h2>حالة ملفات {selectedDate}</h2>
          <p>Sales: {data.salesRawFiles.filter((file) => file.reportDate === selectedDate).length} file(s) · Meta: {data.adsRawFiles.filter((file) => file.reportDate === selectedDate && file.adsPlatform === "Meta").length} file(s) · TikTok: {data.adsRawFiles.filter((file) => file.reportDate === selectedDate && file.adsPlatform === "TikTok").length} file(s)</p>
          <small>Last upload: {lastUpload ? new Date(lastUpload.uploadedAt).toLocaleString("ar-EG") : "No uploads"}</small>
        </div>
        <div className="actions">
          <button onClick={onReplaceDate}>Replace Data for Date</button>
          <button onClick={() => onDeleteDate(selectedDate)}>Delete Data by Date</button>
        </div>
      </div>
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
              <Legend verticalAlign="top" height={34} iconType="circle" />
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
              <Legend verticalAlign="top" height={34} iconType="circle" />
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
              <Legend verticalAlign="top" height={34} iconType="circle" />
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
              <Legend verticalAlign="top" height={34} iconType="circle" />
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
              <Legend verticalAlign="top" height={34} iconType="circle" />
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

function SimpleSalesPreview({
  data,
  peopleRows,
  platformRows,
  setPeopleRows,
  setPlatformRows
}: {
  data: AppData;
  peopleRows: SalesBySalesperson[];
  platformRows: SalesByPlatform[];
  setPeopleRows: (rows: SalesBySalesperson[]) => void;
  setPlatformRows: (rows: SalesByPlatform[]) => void;
}) {
  const reconciliation = getSalesPreviewReconciliation(peopleRows, platformRows);
  const salespersonSuggestions = getSalespersonSuggestions(data, peopleRows);
  const platformSuggestions = getPlatformSuggestions(data, platformRows);

  const updatePerson = (id: string, field: keyof SalesBySalesperson, value: string) => {
    setPeopleRows(
      peopleRows.map((row) =>
        row.id === id
          ? applyPreviewValidation({
              ...row,
              [field]: numericField(field) ? Number(value) : value,
              ocrReviewStatus: "ok"
            })
          : row
      )
    );
  };

  const updatePlatform = (id: string, field: keyof SalesByPlatform, value: string) => {
    setPlatformRows(
      platformRows.map((row) => {
        if (row.id !== id) return row;
        if (field === "totalOrders") {
          return applyPreviewValidation({ ...row, totalOrders: Number(value), morningOrders: Number(value), eveningOrders: 0 });
        }
        if (field === "totalRevenue") {
          return applyPreviewValidation({ ...row, totalRevenue: Number(value), morningRevenue: Number(value), eveningRevenue: 0 });
        }
        return applyPreviewValidation({ ...row, [field]: numericField(field) ? Number(value) : value });
      })
    );
  };

  return (
    <div className="simple-preview">
      <div className="table-header">
        <div>
          <h2>معاينة ملف المبيعات</h2>
          <p className="review-subtitle">يمكنك تعديل أي اسم أو رقم قبل الحفظ. زر الحفظ يظهر في أعلى الصفحة بعد نجاح المطابقة.</p>
        </div>
      </div>
      <datalist id="simple-salesperson-suggestions">
        {salespersonSuggestions.map((name) => <option value={name} key={name} />)}
      </datalist>
      <datalist id="simple-platform-suggestions">
        {platformSuggestions.map((name) => <option value={name} key={name} />)}
      </datalist>
      <SalesTotalsSummary reconciliation={reconciliation} />
      <div className="preview-two-tables">
        <div className="table-wrap">
          <h3>جدول السيلز</h3>
          <table>
            <thead>
              <tr>
                <th>السيلز</th>
                <th>طلبات صباحي</th>
                <th>قيمة صباحي</th>
                <th>طلبات مسائي</th>
                <th>قيمة مسائي</th>
                <th>إجمالي الطلبات</th>
                <th>إجمالي القيمة</th>
              </tr>
            </thead>
            <tbody>
              {peopleRows.map((row) => (
                <tr key={row.id} className={reviewRowClass(row)}>
                  <td><input list="simple-salesperson-suggestions" value={row.salespersonName} onChange={(event) => updatePerson(row.id, "salespersonName", event.target.value)} /></td>
                  <td><input type="number" value={row.morningOrders} onChange={(event) => updatePerson(row.id, "morningOrders", event.target.value)} /></td>
                  <td><input type="number" value={row.morningRevenue} onChange={(event) => updatePerson(row.id, "morningRevenue", event.target.value)} /></td>
                  <td><input type="number" value={row.eveningOrders} onChange={(event) => updatePerson(row.id, "eveningOrders", event.target.value)} /></td>
                  <td><input type="number" value={row.eveningRevenue} onChange={(event) => updatePerson(row.id, "eveningRevenue", event.target.value)} /></td>
                  <td><input type="number" value={row.totalOrders} onChange={(event) => updatePerson(row.id, "totalOrders", event.target.value)} /></td>
                  <td><input type="number" value={row.totalRevenue} onChange={(event) => updatePerson(row.id, "totalRevenue", event.target.value)} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="table-wrap">
          <h3>جدول الصفحات / البلاتفورمز</h3>
          <table>
            <thead>
              <tr>
                <th>القسم</th>
                <th>الصفحة</th>
                <th>عدد الأوردرات</th>
                <th>القيمة</th>
                <th>متوسط الأوردر</th>
              </tr>
            </thead>
            <tbody>
              {platformRows.map((row) => (
                <tr key={row.id} className={reviewRowClass(row)}>
                  <td><input value={row.platformCategory ?? ""} onChange={(event) => updatePlatform(row.id, "platformCategory", event.target.value)} /></td>
                  <td><input list="simple-platform-suggestions" value={row.platformName} onChange={(event) => updatePlatform(row.id, "platformName", event.target.value)} /></td>
                  <td><input type="number" value={row.totalOrders} onChange={(event) => updatePlatform(row.id, "totalOrders", event.target.value)} /></td>
                  <td><input type="number" value={row.totalRevenue} onChange={(event) => updatePlatform(row.id, "totalRevenue", event.target.value)} /></td>
                  <td>{row.totalOrders ? money(row.totalRevenue / row.totalOrders) : money(0)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function SalesTotalsSummary({ reconciliation }: { reconciliation: SalesPreviewReconciliation }) {
  return (
    <div className={`sales-total-summary ${reconciliation.canSave ? "ok" : "warning"}`}>
      <Kpi compact title="إجمالي عدد أوردرات السيلز" value={integer(reconciliation.salespeopleOrders)} />
      <Kpi compact title="إجمالي قيمة أوردرات السيلز" value={money(reconciliation.salespeopleValue)} />
      <Kpi compact title="إجمالي عدد أوردرات الصفحات" value={integer(reconciliation.pagesOrders)} />
      <Kpi compact title="إجمالي قيمة الصفحات" value={money(reconciliation.pagesValue)} />
      {!reconciliation.canSave && (
        <p>تحذير واضح: إجمالي السيلز لا يساوي إجمالي الصفحات. راجعي الصفوف قبل الحفظ.</p>
      )}
    </div>
  );
}

function Kpi({ title, value, compact = false }: { title: string; value: string; compact?: boolean }) {
  return (
    <article className={`kpi-card ${compact ? "compact" : ""}`}>
      <span className="kpi-accent" />
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

interface SalesPreviewReconciliation {
  parsedOrders: number;
  parsedValue: number;
  expectedOrders: number | null;
  expectedValue: number | null;
  ordersDifference: number | null;
  valueDifference: number | null;
  salespeopleOrders: number;
  salespeopleValue: number;
  pagesOrders: number;
  pagesValue: number;
  canSave: boolean;
  warnings: string[];
}

function SalesReconciliationPanel({
  reconciliation,
  peopleRows,
  platformRows
}: {
  reconciliation: SalesPreviewReconciliation;
  peopleRows: SalesBySalesperson[];
  platformRows: SalesByPlatform[];
}) {
  return (
    <div className={`reconciliation-panel ${reconciliation.canSave ? "ok" : "error"}`}>
      <div className="reconciliation-header">
        <div>
          <h3>{reconciliation.canSave ? "Reconciliation passed" : "Parsed totals do not match report totals."}</h3>
          <p>لا يتم حفظ البيانات النهائية إلا لو مجموع السيلز ومجموع الصفحات يساوي إجمالي التقرير.</p>
        </div>
        <Badge text={reconciliation.canSave ? "Ready to save" : "Blocked"} />
      </div>
      <div className="reconciliation-grid">
        <Kpi compact title="Parsed Orders" value={integer(reconciliation.parsedOrders)} />
        <Kpi compact title="Parsed Value" value={money(reconciliation.parsedValue)} />
        <Kpi compact title="Expected Orders" value={reconciliation.expectedOrders === null ? "N/A" : integer(reconciliation.expectedOrders)} />
        <Kpi compact title="Expected Value" value={reconciliation.expectedValue === null ? "N/A" : money(reconciliation.expectedValue)} />
        <Kpi compact title="Orders Difference" value={reconciliation.ordersDifference === null ? "N/A" : integer(reconciliation.ordersDifference)} />
        <Kpi compact title="Value Difference" value={reconciliation.valueDifference === null ? "N/A" : money(reconciliation.valueDifference)} />
      </div>
      <div className="reconciliation-checks">
        <span>Salespeople Total Orders: <strong>{integer(reconciliation.salespeopleOrders)}</strong></span>
        <span>Pages Total Orders: <strong>{integer(reconciliation.pagesOrders)}</strong></span>
        <span>Salespeople Total Value: <strong>{money(reconciliation.salespeopleValue)}</strong></span>
        <span>Pages Total Value: <strong>{money(reconciliation.pagesValue)}</strong></span>
      </div>
      {reconciliation.warnings.length > 0 && (
        <ul className="reconciliation-warnings">
          {reconciliation.warnings.map((warning) => <li key={warning}>{warning}</li>)}
        </ul>
      )}
      <details className="debug-section" open={!reconciliation.canSave}>
        <summary>Debug parsed rows</summary>
        <div className="debug-grid">
          <DebugSalesRows title="Parsed salesperson rows" rows={peopleRows} nameKey="salespersonName" />
          <DebugSalesRows title="Parsed page rows" rows={platformRows} nameKey="platformName" />
        </div>
      </details>
    </div>
  );
}

function DebugSalesRows({
  title,
  rows,
  nameKey
}: {
  title: string;
  rows: Array<SalesBySalesperson | SalesByPlatform>;
  nameKey: "salespersonName" | "platformName";
}) {
  return (
    <div className="debug-table-wrap">
      <h4>{title}</h4>
      <table className="debug-table">
        <thead>
          <tr>
            <th>Name</th>
            <th>Morning</th>
            <th>Evening</th>
            <th>Total</th>
            <th>Value</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.id} className={hasSalesTotalMismatch(row) || isMissingSalesRow(row) ? "review-needs" : ""}>
              <td>{String(row[nameKey as keyof typeof row] ?? "") || "Missing row/name"}</td>
              <td>{integer(row.morningOrders)} / {money(row.morningRevenue)}</td>
              <td>{integer(row.eveningOrders)} / {money(row.eveningRevenue)}</td>
              <td>{integer(row.totalOrders)}</td>
              <td>{money(row.totalRevenue)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

const salesExcelStatusLabel = (status: "idle" | "uploaded" | "previewed" | "saved") => {
  if (status === "saved") return "Saved";
  if (status === "previewed") return "Previewed";
  if (status === "uploaded") return "Uploaded";
  return "No File";
};

const cloneSalesRows = <T extends SalesBySalesperson | SalesByPlatform>(rows: T[]): T[] =>
  rows.map((row) => ({ ...row, ocrFieldWarnings: { ...(row.ocrFieldWarnings ?? {}) } }));

const reviewRowClass = (row: SalesBySalesperson | SalesByPlatform) => {
  if (hasSalesTotalMismatch(row) || isMissingSalesRow(row) || row.ocrReviewStatus === "needs_review" || (row.ocrConfidence ?? 100) < 70) return "review-needs";
  if (row.ocrReviewStatus === "auto_corrected") return "review-auto";
  return "";
};

const hasSalesTotalMismatch = (row: SalesBySalesperson | SalesByPlatform) =>
  row.totalOrders !== row.morningOrders + row.eveningOrders ||
  row.totalRevenue !== row.morningRevenue + row.eveningRevenue;

const isSalespersonSummaryRow = (row: SalesBySalesperson) =>
  /اجمالي|إجمالي|total/i.test(row.salespersonName) && !row.salespersonCode.trim();

const isGrandTotalPlatformName = (name: string) => {
  const normalized = normalizeOcrLookupText(name);
  return normalized === "اجمالي اليوم" || normalized === "total day" || normalized === "daily total";
};

const isPlatformSummaryRow = (row: SalesByPlatform) =>
  isSubtotalPlatformName(row.platformName) ||
  isGrandTotalPlatformName(row.platformName) ||
  /اجمالي|إجمالي|total/i.test(row.platformName) ||
  /اجمالي|إجمالي|total/i.test(row.platformCategory ?? "");

const isMissingSalesRow = (row: SalesBySalesperson | SalesByPlatform) => {
  if ("salespersonName" in row) return !isSalespersonSummaryRow(row) && !row.salespersonName.trim();
  return !isPlatformSummaryRow(row) && !row.platformName.trim();
};

const sumSalesRows = <T extends SalesBySalesperson | SalesByPlatform>(rows: T[]) => ({
  orders: rows.reduce((total, row) => total + row.totalOrders, 0),
  value: rows.reduce((total, row) => total + row.totalRevenue, 0)
});

const getSalesPreviewReconciliation = (
  peopleRows: SalesBySalesperson[],
  platformRows: SalesByPlatform[]
): SalesPreviewReconciliation => {
  const detailPeople = peopleRows.filter((row) => !isSalespersonSummaryRow(row));
  const detailPlatforms = platformRows.filter((row) => !isPlatformSummaryRow(row));
  const peopleTotals = sumSalesRows(detailPeople);
  const platformTotals = sumSalesRows(detailPlatforms);
  const platformGrandTotal = platformRows.find((row) => isGrandTotalPlatformName(row.platformName));
  const salespersonGrandTotal = peopleRows.find(isSalespersonSummaryRow);
  const expectedOrders = platformGrandTotal?.totalOrders ?? salespersonGrandTotal?.totalOrders ?? null;
  const expectedValue = platformGrandTotal?.totalRevenue ?? salespersonGrandTotal?.totalRevenue ?? null;
  const warnings: string[] = [];

  if (expectedOrders === null || expectedValue === null) {
    warnings.push("Expected report grand total was not found in the uploaded file.");
  }
  if (peopleTotals.orders !== platformTotals.orders || peopleTotals.value !== platformTotals.value) {
    warnings.push("Salespeople totals do not match page totals.");
  }
  if (expectedOrders !== null && peopleTotals.orders !== expectedOrders) {
    warnings.push("Salespeople Total Orders does not equal report grand total.");
  }
  if (expectedValue !== null && peopleTotals.value !== expectedValue) {
    warnings.push("Salespeople Total Value does not equal report grand total.");
  }
  if (expectedOrders !== null && platformTotals.orders !== expectedOrders) {
    warnings.push("Pages Total Orders does not equal report grand total.");
  }
  if (expectedValue !== null && platformTotals.value !== expectedValue) {
    warnings.push("Pages Total Value does not equal report grand total.");
  }
  if (platformGrandTotal && salespersonGrandTotal) {
    if (platformGrandTotal.totalOrders !== salespersonGrandTotal.totalOrders || platformGrandTotal.totalRevenue !== salespersonGrandTotal.totalRevenue) {
      warnings.push("Page grand total and salesperson grand total are different.");
    }
  }

  return {
    parsedOrders: peopleTotals.orders,
    parsedValue: peopleTotals.value,
    expectedOrders,
    expectedValue,
    ordersDifference: expectedOrders === null ? null : expectedOrders - peopleTotals.orders,
    valueDifference: expectedValue === null ? null : expectedValue - peopleTotals.value,
    salespeopleOrders: peopleTotals.orders,
    salespeopleValue: peopleTotals.value,
    pagesOrders: platformTotals.orders,
    pagesValue: platformTotals.value,
    canSave: warnings.length === 0,
    warnings
  };
};

const applyPreviewValidation = <T extends SalesBySalesperson | SalesByPlatform>(row: T): T => {
  const warnings = { ...(row.ocrFieldWarnings ?? {}) };
  delete warnings.totalOrders;
  delete warnings.totalValue;
  if (row.totalOrders !== row.morningOrders + row.eveningOrders) {
    warnings.totalOrders = ["إجمالي الطلبات لا يساوي صباحي + مسائي"];
  }
  if (row.totalRevenue !== row.morningRevenue + row.eveningRevenue) {
    warnings.totalValue = ["إجمالي القيمة لا يساوي صباحي + مسائي"];
  }
  return {
    ...row,
    ocrFieldWarnings: warnings,
    ocrReviewStatus: Object.keys(warnings).length ? "needs_review" : row.ocrReviewStatus
  };
};

const reviewConfidenceLabel = (row: SalesBySalesperson | SalesByPlatform) => {
  const confidence = row.ocrConfidence ?? 100;
  const status =
    row.ocrReviewStatus === "auto_corrected"
      ? "Auto-corrected"
      : row.ocrReviewStatus === "needs_review"
        ? "Needs Review"
        : "OK";
  return `${confidence}% · ${status}`;
};

const getSalespersonSuggestions = (data: AppData, rows: SalesBySalesperson[]) =>
  uniqueValues([
    ...data.salespeople.filter((item) => item.active).map((item) => item.name),
    ...data.ocrSalespersonCorrections.map((item) => item.correctValue),
    ...data.salesBySalesperson.map((item) => item.salespersonName),
    ...rows.map((item) => item.salespersonName)
  ]);

const getPlatformSuggestions = (data: AppData, rows: SalesByPlatform[]) =>
  uniqueValues([
    ...data.platforms.filter((item) => item.active).map((item) => item.name),
    ...data.platformSettings.filter((item) => item.isActive).map((item) => item.platformName),
    ...data.ocrPageCorrections.map((item) => item.correctValue),
    ...data.salesByPlatform.map((item) => item.platformName),
    ...rows.map((item) => item.platformName)
  ]);

const uniqueValues = (values: string[]) =>
  [...new Set(values.map((value) => value.trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b, "ar"));

const applyOcrCorrections = (
  data: AppData,
  people: SalesBySalesperson[],
  platforms: SalesByPlatform[]
): { people: SalesBySalesperson[]; platforms: SalesByPlatform[] } => ({
  people: people.map((row) => applySalespersonCorrection(data, row)),
  platforms: platforms.map((row) => applyPlatformCorrection(data, row))
});

const applySalespersonCorrection = (data: AppData, row: SalesBySalesperson): SalesBySalesperson => {
  const originalName = row.salespersonName;
  const notes: string[] = [];
  let nextName = originalName;
  let status: SalesBySalesperson["ocrReviewStatus"] = row.ocrReviewStatus ?? "ok";

  const byCode = row.salespersonCode
    ? data.salespeople.find((person) => person.active && person.code === row.salespersonCode)
    : undefined;
  if (byCode && byCode.name && byCode.name !== nextName) {
    nextName = byCode.name;
    status = "auto_corrected";
    notes.push("Auto-corrected by salesperson code");
  }

  const correction = findCorrection(data.ocrSalespersonCorrections, originalName, row.salespersonCode);
  if (!byCode && correction && correction.correctValue !== nextName) {
    nextName = correction.correctValue;
    status = "auto_corrected";
    notes.push("Auto-corrected from saved correction");
  }

  if (!nextName.trim() || (row.ocrConfidence ?? 100) < 70) {
    status = "needs_review";
    notes.push("Unknown / low confidence");
  }

  return {
    ...row,
    salespersonName: nextName,
    ocrOriginalName: originalName,
    ocrReviewStatus: status,
    ocrReviewNotes: notes.length ? notes.join("، ") : row.ocrReviewNotes
  };
};

const applyPlatformCorrection = (data: AppData, row: SalesByPlatform): SalesByPlatform => {
  const originalName = row.platformName;
  const notes: string[] = [];
  let nextName = originalName;
  let status: SalesByPlatform["ocrReviewStatus"] = row.ocrReviewStatus ?? "ok";

  const correction = findCorrection(data.ocrPageCorrections, originalName);
  if (correction && correction.correctValue !== nextName) {
    nextName = correction.correctValue;
    status = "auto_corrected";
    notes.push("Auto-corrected from saved page correction");
  } else {
    const platform = findBestPlatformMaster(data, originalName);
    if (platform && platform.name !== nextName) {
      nextName = platform.name;
      status = "auto_corrected";
      notes.push("Auto-corrected from platform master data");
    }
  }

  if (!nextName.trim() || (row.ocrConfidence ?? 100) < 70) {
    status = "needs_review";
    notes.push("Unknown / low confidence");
  }

  return {
    ...row,
    platformName: nextName,
    ocrOriginalName: originalName,
    ocrReviewStatus: status,
    ocrReviewNotes: notes.length ? notes.join("، ") : row.ocrReviewNotes
  };
};

const findCorrection = <T extends OcrPageCorrection | OcrSalespersonCorrection>(
  corrections: T[],
  wrongValue: string,
  salespersonCode = ""
) => {
  const normalizedWrong = normalizeOcrLookupText(wrongValue);
  if (!normalizedWrong) return undefined;
  return corrections.find((item) => {
    const codeMatches = !("salespersonCode" in item) || !salespersonCode || item.salespersonCode === salespersonCode;
    return codeMatches && normalizeOcrLookupText(item.wrongValue) === normalizedWrong;
  });
};

const findBestPlatformMaster = (data: AppData, value: string) => {
  const normalized = normalizeOcrLookupText(value);
  if (!normalized) return undefined;
  let best: { platform: PlatformMaster; score: number } | undefined;
  const platformMasters = [
    ...data.platforms,
    ...data.platformSettings.map((item) => ({
      id: item.id,
      name: item.platformName,
      aliases: [item.platformName],
      active: item.isActive
    }))
  ];
  for (const platform of platformMasters.filter((item) => item.active)) {
    for (const alias of [platform.name, ...(platform.aliases ?? [])]) {
      const aliasNormalized = normalizeOcrLookupText(alias);
      const contains = normalized.includes(aliasNormalized) || aliasNormalized.includes(normalized);
      const score = contains ? 0.94 : textSimilarity(normalized, aliasNormalized);
      if (!best || score > best.score) best = { platform, score };
    }
  }
  return best && best.score >= 0.72 ? best.platform : undefined;
};

const buildOcrLearningData = (
  data: AppData,
  originalPeople: SalesBySalesperson[],
  correctedPeople: SalesBySalesperson[],
  originalPlatforms: SalesByPlatform[],
  correctedPlatforms: SalesByPlatform[]
): AppData => {
  const now = new Date().toISOString();
  const pageCorrections = [...data.ocrPageCorrections];
  const salespersonCorrections = [...data.ocrSalespersonCorrections];
  const salespeople = [...data.salespeople];
  const platforms = [...data.platforms];

  for (const row of correctedPeople) {
    const original = originalPeople.find((item) => item.id === row.id);
    if (original?.salespersonName && row.salespersonName && normalizeOcrLookupText(original.salespersonName) !== normalizeOcrLookupText(row.salespersonName)) {
      upsertSalespersonCorrection(salespersonCorrections, original.salespersonName, row.salespersonName, row.salespersonCode, now);
    }
    if (row.salespersonCode && row.salespersonName) {
      const existing = salespeople.find((item) => item.code === row.salespersonCode);
      if (existing) existing.name = row.salespersonName;
      else salespeople.push({ id: createId(), code: row.salespersonCode, name: row.salespersonName, active: true });
    }
  }

  for (const row of correctedPlatforms) {
    const original = originalPlatforms.find((item) => item.id === row.id);
    if (original?.platformName && row.platformName && normalizeOcrLookupText(original.platformName) !== normalizeOcrLookupText(row.platformName)) {
      upsertPageCorrection(pageCorrections, original.platformName, row.platformName, now);
    }
    if (row.platformName) {
      const existing = platforms.find((item) => normalizeOcrLookupText(item.name) === normalizeOcrLookupText(row.platformName));
      if (existing) {
        existing.aliases = uniqueValues([...existing.aliases, row.platformName, original?.platformName ?? ""]);
        existing.active = true;
      } else {
        platforms.push({ id: createId(), name: row.platformName, aliases: uniqueValues([row.platformName, original?.platformName ?? ""]), active: true });
      }
    }
  }

  return {
    ...data,
    ocrPageCorrections: pageCorrections,
    ocrSalespersonCorrections: salespersonCorrections,
    salespeople,
    platforms
  };
};

const upsertPageCorrection = (rows: OcrPageCorrection[], wrongValue: string, correctValue: string, createdAt: string) => {
  const existing = rows.find(
    (row) => normalizeOcrLookupText(row.wrongValue) === normalizeOcrLookupText(wrongValue) && normalizeOcrLookupText(row.correctValue) === normalizeOcrLookupText(correctValue)
  );
  if (existing) existing.usageCount += 1;
  else rows.push({ id: createId(), wrongValue, correctValue, createdAt, usageCount: 1 });
};

const upsertSalespersonCorrection = (
  rows: OcrSalespersonCorrection[],
  wrongValue: string,
  correctValue: string,
  salespersonCode: string,
  createdAt: string
) => {
  const existing = rows.find(
    (row) =>
      normalizeOcrLookupText(row.wrongValue) === normalizeOcrLookupText(wrongValue) &&
      normalizeOcrLookupText(row.correctValue) === normalizeOcrLookupText(correctValue) &&
      row.salespersonCode === salespersonCode
  );
  if (existing) existing.usageCount += 1;
  else rows.push({ id: createId(), wrongValue, correctValue, salespersonCode, createdAt, usageCount: 1 });
};

const normalizeOcrLookupText = (value: string) =>
  value
    .replace(/[إأآ]/g, "ا")
    .replace(/[ة]/g, "ه")
    .replace(/[ى]/g, "ي")
    .replace(/[ؤئ]/g, "ء")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();

const textSimilarity = (left: string, right: string) => {
  if (!left && !right) return 1;
  if (!left || !right) return 0;
  const distance = textDistance(left, right);
  return 1 - distance / Math.max(left.length, right.length, 1);
};

const textDistance = (left: string, right: string) => {
  const previous = Array.from({ length: right.length + 1 }, (_, index) => index);
  for (let i = 1; i <= left.length; i += 1) {
    let diagonal = previous[0];
    previous[0] = i;
    for (let j = 1; j <= right.length; j += 1) {
      const saved = previous[j];
      previous[j] = Math.min(
        previous[j] + 1,
        previous[j - 1] + 1,
        diagonal + (left[i - 1] === right[j - 1] ? 0 : 1)
      );
      diagonal = saved;
    }
  }
  return previous[right.length];
};

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

const filesForAdsCard = (data: AppData, reportDate: string, salesPlatformName: string, platform: AdsPlatform) =>
  data.adsRawFiles.filter(
    (file) => file.reportDate === reportDate && file.salesPlatformName === salesPlatformName && file.adsPlatform === platform
  );

const rowsForAdsCard = (data: AppData, reportDate: string, salesPlatformName: string, platform: AdsPlatform) => {
  const rows = platform === "Meta" ? data.metaAds : data.tiktokAds;
  return rows.filter((row) => row.reportDate === reportDate && row.salesPlatformName === salesPlatformName);
};

const rowCountForFile = (data: AppData, sourceFileId: string) =>
  data.salesBySalesperson.filter((row) => row.sourceFileId === sourceFileId).length +
  data.salesByPlatform.filter((row) => row.sourceFileId === sourceFileId).length +
  data.metaAds.filter((row) => row.sourceFileId === sourceFileId).length +
  data.tiktokAds.filter((row) => row.sourceFileId === sourceFileId).length;

const platformUploadTone = (data: AppData, reportDate: string, salesPlatformName: string) => {
  const meta = filesForAdsCard(data, reportDate, salesPlatformName, "Meta").length;
  const tiktok = filesForAdsCard(data, reportDate, salesPlatformName, "TikTok").length;
  if (meta && tiktok) return "مكتمل";
  if (meta || tiktok) return "جزئي";
  return "ناقص";
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
