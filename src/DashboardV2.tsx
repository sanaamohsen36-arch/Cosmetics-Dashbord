"use client";

import { useEffect, useMemo, useState } from "react";
import { FileSpreadsheet, Lock, Save, Search, UploadCloud } from "lucide-react";
import type { AdsPlatform, AdsRawFile, AdsRow, AppData, DateRange, SalesByPlatform, SalesBySalesperson, SalesRawFile, UploadMode } from "./types";
import { calculateKpis, filterAds, filterPeople, filterPlatforms } from "./lib/metrics";
import { createId, emptyData, getStorageMode, loadData, saveAdsUpload, saveSalesUpload, subscribeToDataChanges } from "./lib/storage";
import { inferDateFromFileName, parseAdsWorkbook, parseSalesOcrText, runArabicOcr } from "./lib/parsing";

const today = new Date().toISOString().slice(0, 10);
const salesAdPlatforms = ["ريجينكس", "ريجينكس eg", "واتساب ريجينكس"];
const numberFormat = new Intl.NumberFormat("ar-EG");

const money = (value: number | null) => (value === null ? "N/A" : `${numberFormat.format(Math.round(value))} ج`);
const integer = (value: number | null | undefined) => numberFormat.format(Math.round(Number(value) || 0));
const percent = (value: number | null) => (value === null ? "N/A" : `${value.toFixed(1)}%`);
const ratio = (value: number | null) => (value === null ? "N/A" : value.toFixed(2));

export default function DashboardV2() {
  const [data, setData] = useState<AppData>(() => emptyData());
  const [page, setPage] = useState<"upload" | "dashboard">("upload");
  const [range, setRange] = useState<DateRange>({ from: today, to: today });
  const [status, setStatus] = useState("جاري تحميل البيانات...");

  const refresh = async () => {
    try {
      setData(await loadData());
      setStatus(`متصل: ${getStorageMode()}`);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "تعذر تحميل البيانات");
    }
  };

  useEffect(() => {
    void refresh();
    return subscribeToDataChanges(() => {
      void refresh();
    });
  }, []);

  const people = useMemo(() => filterPeople(data, range), [data, range]);
  const platforms = useMemo(() => filterPlatforms(data, range), [data, range]);
  const ads = useMemo(() => filterAds(data, range), [data, range]);
  const kpis = useMemo(() => calculateKpis(data, range), [data, range]);

  const commitSales = async (rawFile: SalesRawFile, rows: SalesBySalesperson[], platformRows: SalesByPlatform[], mode: UploadMode) => {
    setStatus("جاري حفظ المبيعات...");
    const next = await saveSalesUpload(data, rawFile, rows, platformRows, mode);
    setData(next);
    await refresh();
    setStatus("تم حفظ المبيعات وتحديث اللوحة.");
  };

  const commitAds = async (rawFile: AdsRawFile, rows: AdsRow[], platform: AdsPlatform, mode: UploadMode) => {
    setStatus("جاري حفظ الإعلانات...");
    const next = await saveAdsUpload(data, rawFile, rows, platform, mode);
    setData(next);
    await refresh();
    setStatus("تم حفظ الإعلانات وتحديث اللوحة.");
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
          <button className={page === "upload" ? "active" : ""} onClick={() => setPage("upload")}>
            <UploadCloud size={18} />
            <span>رفع البيانات</span>
          </button>
          <button className={page === "dashboard" ? "active" : ""} onClick={() => setPage("dashboard")}>
            <FileSpreadsheet size={18} />
            <span>لوحة التحكم</span>
          </button>
        </nav>
      </aside>

      <main className="main">
        <header className="topbar">
          <div>
            <p className="eyebrow">Supabase Live</p>
            <h1>{page === "upload" ? "رفع البيانات" : "لوحة التحكم"}</h1>
            <p className="sync-status">{status}</p>
          </div>
          <div className="date-controls">
            <label>
              من
              <input type="date" value={range.from} onChange={(event) => setRange({ ...range, from: event.target.value })} />
            </label>
            <label>
              إلى
              <input type="date" value={range.to} onChange={(event) => setRange({ ...range, to: event.target.value })} />
            </label>
          </div>
        </header>

        {page === "upload" ? (
          <ProtectedUpload data={data} commitSales={commitSales} commitAds={commitAds} />
        ) : (
          <DashboardSummary kpis={kpis} people={people} platforms={platforms} ads={ads} />
        )}
      </main>
    </div>
  );
}

function ProtectedUpload({
  data,
  commitSales,
  commitAds
}: {
  data: AppData;
  commitSales: (rawFile: SalesRawFile, rows: SalesBySalesperson[], platformRows: SalesByPlatform[], mode: UploadMode) => Promise<void>;
  commitAds: (rawFile: AdsRawFile, rows: AdsRow[], platform: AdsPlatform, mode: UploadMode) => Promise<void>;
}) {
  const [password, setPassword] = useState("");
  const [allowed, setAllowed] = useState(false);
  const [authMessage, setAuthMessage] = useState("اكتبي باسورد الرفع للمتابعة.");

  const unlock = async () => {
    const response = await fetch("/api/upload-auth", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password })
    });
    const result = (await response.json()) as { ok: boolean; protected: boolean };
    setAllowed(result.ok);
    setAuthMessage(result.ok ? "تم فتح صفحة الرفع." : "الباسورد غير صحيح.");
  };

  useEffect(() => {
    void unlock();
  }, []);

  if (!allowed) {
    return (
      <section className="panel upload-panel">
        <div className="section-title">
          <Lock />
          <div>
            <h2>صفحة الرفع محمية</h2>
            <p>{authMessage}</p>
          </div>
        </div>
        <div className="form-row">
          <input type="password" placeholder="UPLOAD_PASSWORD" value={password} onChange={(event) => setPassword(event.target.value)} />
          <button className="primary" onClick={unlock}>
            فتح الرفع
          </button>
        </div>
      </section>
    );
  }

  return (
    <section className="dashboard-stack">
      <SalesUpload data={data} commitSales={commitSales} />
      <div className="panel">
        <div className="section-title">
          <FileSpreadsheet />
          <div>
            <h2>رفع الإعلانات حسب صفحة المبيعات</h2>
            <p>كل صفحة تقبل ملفات Meta و TikTok من أكثر من حساب إعلاني، مع دمج أو استبدال حسب التاريخ والحساب.</p>
          </div>
        </div>
        <div className="content-grid">
          {salesAdPlatforms.map((platformName) => (
            <AdsPlatformGroup key={platformName} salesPlatformName={platformName} data={data} commitAds={commitAds} />
          ))}
        </div>
      </div>
    </section>
  );
}

function SalesUpload({
  data,
  commitSales
}: {
  data: AppData;
  commitSales: (rawFile: SalesRawFile, rows: SalesBySalesperson[], platformRows: SalesByPlatform[], mode: UploadMode) => Promise<void>;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [reportDate, setReportDate] = useState(today);
  const [peopleRows, setPeopleRows] = useState<SalesBySalesperson[]>([]);
  const [platformRows, setPlatformRows] = useState<SalesByPlatform[]>([]);
  const [message, setMessage] = useState("");
  const sourceFileId = useMemo(() => createId(), [file?.name, reportDate]);
  const existing = data.salesBySalesperson.some((row) => row.reportDate === reportDate);

  const chooseFile = (selected: File | null) => {
    setFile(selected);
    setPeopleRows([]);
    setPlatformRows([]);
    if (selected) setReportDate(inferDateFromFileName(selected.name));
  };

  const runOcr = async () => {
    if (!file) return;
    setMessage("جاري تشغيل OCR...");
    const text = await runArabicOcr(file, (step, progress) => setMessage(`${step} ${progress}%`));
    const parsed = parseSalesOcrText(text, reportDate, sourceFileId);
    setPeopleRows(parsed.people);
    setPlatformRows(parsed.platforms);
    setMessage(parsed.people.length ? "تم استخراج المبيعات. راجعي الأرقام ثم احفظي." : "لم يتم استخراج صفوف موثوقة.");
  };

  const save = async () => {
    const now = new Date().toISOString();
    await commitSales(
      {
        id: sourceFileId,
        fileName: file?.name ?? "manual-sales-report",
        filePath: file?.name ?? "manual",
        uploadedAt: now,
        reportDate,
        ocrStatus: file ? "success" : "manual",
        createdAt: now
      },
      peopleRows,
      platformRows,
      existing ? "replace" : "merge"
    );
    setMessage("تم حفظ تقرير المبيعات.");
  };

  return (
    <div className="panel upload-panel">
      <div className="section-title">
        <UploadCloud />
        <div>
          <h2>رفع صورة تقفيل المبيعات</h2>
          <p>صورة واحدة لكل يوم، والحفظ لنفس اليوم يستبدل بيانات اليوم القديم.</p>
        </div>
      </div>
      <div className="form-row">
        <input type="file" accept="image/*" onChange={(event) => chooseFile(event.target.files?.[0] ?? null)} />
        <input type="date" value={reportDate} onChange={(event) => setReportDate(event.target.value)} />
        <button className="primary" disabled={!file} onClick={runOcr}>
          <Search size={18} /> OCR
        </button>
        <button className="success" disabled={!peopleRows.length && !platformRows.length} onClick={save}>
          <Save size={18} /> حفظ
        </button>
      </div>
      {message && <p className="status-line">{message}</p>}
      {!!peopleRows.length && <Preview title="معاينة السيلز" rows={peopleRows} />}
      {!!platformRows.length && <Preview title="معاينة الصفحات" rows={platformRows} />}
    </div>
  );
}

function AdsPlatformGroup({
  salesPlatformName,
  data,
  commitAds
}: {
  salesPlatformName: string;
  data: AppData;
  commitAds: (rawFile: AdsRawFile, rows: AdsRow[], platform: AdsPlatform, mode: UploadMode) => Promise<void>;
}) {
  return (
    <div className="panel">
      <h2>{salesPlatformName}</h2>
      <AdsUploader adsPlatform="Meta" salesPlatformName={salesPlatformName} data={data} commitAds={commitAds} />
      <AdsUploader adsPlatform="TikTok" salesPlatformName={salesPlatformName} data={data} commitAds={commitAds} />
    </div>
  );
}

function AdsUploader({
  adsPlatform,
  salesPlatformName,
  data,
  commitAds
}: {
  adsPlatform: AdsPlatform;
  salesPlatformName: string;
  data: AppData;
  commitAds: (rawFile: AdsRawFile, rows: AdsRow[], platform: AdsPlatform, mode: UploadMode) => Promise<void>;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [reportDate, setReportDate] = useState(today);
  const [adAccountName, setAdAccountName] = useState("");
  const [rows, setRows] = useState<AdsRow[]>([]);
  const [message, setMessage] = useState("");
  const sourceFileId = useMemo(() => createId(), [file?.name, reportDate, adAccountName]);
  const existing = data.adsRawFiles.some(
    (item) =>
      item.reportDate === reportDate &&
      item.adsPlatform === adsPlatform &&
      item.salesPlatformName === salesPlatformName &&
      (item.adAccountName || "غير محدد") === (adAccountName || "غير محدد")
  );

  const chooseFile = async (selected: File | null) => {
    setFile(selected);
    setRows([]);
    if (!selected) return;
    const inferredDate = inferDateFromFileName(selected.name);
    setReportDate(inferredDate);
    const parsed = await parseAdsWorkbook(selected, adsPlatform, salesPlatformName, inferredDate, sourceFileId, adAccountName);
    setRows(parsed);
    setMessage(`تمت قراءة ${parsed.length} صف. الرسائل: ${integer(sumAds(parsed, "messagesCount"))}، الكومنتات: ${integer(sumAds(parsed, "commentsCount"))}.`);
  };

  const save = async () => {
    const now = new Date().toISOString();
    const normalizedRows = rows.map((row) => ({
      ...row,
      reportDate,
      salesPlatformName,
      adAccountName: adAccountName || row.adAccountName || "غير محدد"
    }));
    await commitAds(
      {
        id: sourceFileId,
        fileName: file?.name ?? `${adsPlatform}-ads.xlsx`,
        filePath: file?.name ?? "manual",
        uploadedAt: now,
        reportDate,
        adsPlatform,
        salesPlatformName,
        adAccountName: adAccountName || "غير محدد",
        parsingStatus: "success",
        createdAt: now
      },
      normalizedRows,
      adsPlatform,
      existing ? "merge" : "merge"
    );
    setMessage("تم حفظ ملف الإعلانات.");
  };

  return (
    <div className="ads-upload-card">
      <strong>{adsPlatform} Ads</strong>
      <input placeholder="اسم حساب الإعلانات" value={adAccountName} onChange={(event) => setAdAccountName(event.target.value)} />
      <input type="file" accept=".xlsx,.xls,.csv" onChange={(event) => void chooseFile(event.target.files?.[0] ?? null)} />
      <input type="date" value={reportDate} onChange={(event) => setReportDate(event.target.value)} />
      <button disabled={!rows.length} onClick={save}>
        حفظ
      </button>
      {message && <small>{message}</small>}
    </div>
  );
}

function DashboardSummary({ kpis, people, platforms, ads }: { kpis: ReturnType<typeof calculateKpis>; people: SalesBySalesperson[]; platforms: SalesByPlatform[]; ads: AdsRow[] }) {
  const platformSummaries = salesAdPlatforms.map((name) => {
    const orders = platforms.filter((row) => platformBucket(row.platformName) === name).reduce((total, row) => total + row.totalOrders, 0);
    const platformAds = ads.filter((row) => row.salesPlatformName === name);
    const messages = sumAds(platformAds, "messagesCount");
    const comments = sumAds(platformAds, "commentsCount");
    const spend = platformAds.reduce((total, row) => total + row.spend, 0);
    return { name, orders, messages, comments, spend, conversion: messages ? (orders / messages) * 100 : null };
  });

  return (
    <section className="dashboard-stack">
      <div className="kpi-grid">
        <Kpi title="إجمالي المبيعات" value={money(kpis.totalSalesRevenue)} />
        <Kpi title="إجمالي الطلبات" value={integer(kpis.totalOrders)} />
        <Kpi title="مصروف الإعلانات" value={money(kpis.totalAdsSpend)} />
        <Kpi title="Messages" value={integer(kpis.messagesCount)} />
        <Kpi title="Comments" value={integer(kpis.commentsCount)} />
        <Kpi title="تحويل الرسائل" value={percent(kpis.messageConversionRate)} />
        <Kpi title="ROAS" value={ratio(kpis.roas)} />
        <Kpi title="CPA" value={money(kpis.cpa)} />
      </div>

      <div className="panel wide">
        <h2>أداء صفحات الإعلانات</h2>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>الصفحة</th>
                <th>الطلبات</th>
                <th>Messages</th>
                <th>Comments</th>
                <th>Spend</th>
                <th>Conversion</th>
              </tr>
            </thead>
            <tbody>
              {platformSummaries.map((row) => (
                <tr key={row.name}>
                  <td>{row.name}</td>
                  <td>{integer(row.orders)}</td>
                  <td>{integer(row.messages)}</td>
                  <td>{integer(row.comments)}</td>
                  <td>{money(row.spend)}</td>
                  <td>{percent(row.conversion)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="panel wide">
        <h2>آخر ملفات الإعلانات</h2>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>التاريخ</th>
                <th>الصفحة</th>
                <th>الحساب</th>
                <th>المنصة</th>
                <th>الحملة</th>
                <th>Spend</th>
                <th>Messages</th>
                <th>Comments</th>
              </tr>
            </thead>
            <tbody>
              {ads.slice(0, 80).map((row) => (
                <tr key={row.id}>
                  <td>{row.reportDate}</td>
                  <td>{row.salesPlatformName}</td>
                  <td>{row.adAccountName || "غير محدد"}</td>
                  <td>{row.adsPlatform}</td>
                  <td>{row.campaignName}</td>
                  <td>{money(row.spend)}</td>
                  <td>{integer(row.messagesCount)}</td>
                  <td>{integer(row.commentsCount)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="panel wide">
        <h2>ملخص المبيعات</h2>
        <p className="status-line">صفوف السيلز في الفترة: {integer(people.length)}</p>
      </div>
    </section>
  );
}

function Preview({ title, rows }: { title: string; rows: Array<SalesBySalesperson | SalesByPlatform> }) {
  return (
    <div className="table-wrap">
      <h3>{title}</h3>
      <table>
        <thead>
          <tr>
            <th>الاسم</th>
            <th>صباحي</th>
            <th>مسائي</th>
            <th>الإجمالي</th>
          </tr>
        </thead>
        <tbody>
          {rows.slice(0, 20).map((row) => (
            <tr key={row.id}>
              <td>{"salespersonName" in row ? row.salespersonName : row.platformName}</td>
              <td>{integer(row.morningOrders)} / {money(row.morningRevenue)}</td>
              <td>{integer(row.eveningOrders)} / {money(row.eveningRevenue)}</td>
              <td>{integer(row.totalOrders)} / {money(row.totalRevenue)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Kpi({ title, value }: { title: string; value: string }) {
  return (
    <article className="kpi-card">
      <span>{title}</span>
      <strong>{value}</strong>
    </article>
  );
}

const sumAds = (rows: AdsRow[], field: "messagesCount" | "commentsCount") =>
  rows.reduce((total, row) => total + (Number(row[field]) || 0), 0);

const platformBucket = (platformName: string) => {
  const normalized = platformName.trim().toLowerCase();
  if (normalized.includes("eg")) return "ريجينكس eg";
  if (normalized.includes("واتس")) return "واتساب ريجينكس";
  return "ريجينكس";
};
