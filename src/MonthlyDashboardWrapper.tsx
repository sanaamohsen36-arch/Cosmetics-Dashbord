"use client";

import { useEffect, useMemo, useState } from "react";
import { CalendarDays, Save, Search, UploadCloud } from "lucide-react";
import DashboardApp from "./App";
import type { AppData, SalesByPlatform, SalesBySalesperson, SalesRawFile } from "./types";
import { createId, emptyData, loadData, saveSalesUpload, subscribeToDataChanges } from "./lib/storage";
import { inferDateFromFileName, parseSalesOcrText, runArabicOcr } from "./lib/parsing";

const today = new Date().toISOString().slice(0, 10);
const numberFormat = new Intl.NumberFormat("ar-EG");
const money = (value: number) => `${numberFormat.format(Math.round(value))} ج`;
const integer = (value: number) => numberFormat.format(Math.round(value));

export default function MonthlyDashboardWrapper() {
  return (
    <>
      <MonthlySalesControl />
      <DashboardApp />
    </>
  );
}

function MonthlySalesControl() {
  const [data, setData] = useState<AppData>(() => emptyData());
  const [selectedDate, setSelectedDate] = useState(today);
  const [salesFile, setSalesFile] = useState<File | null>(null);
  const [peoplePreview, setPeoplePreview] = useState<SalesBySalesperson[]>([]);
  const [platformPreview, setPlatformPreview] = useState<SalesByPlatform[]>([]);
  const [status, setStatus] = useState("جاري تحميل حالة الشهر...");

  const selectedMonth = selectedDate.slice(0, 7);
  const sourceFileId = useMemo(() => createId(), [salesFile?.name, selectedDate]);
  const days = useMemo(() => getMonthDays(selectedMonth), [selectedMonth]);
  const uploadedDays = useMemo(() => new Set(data.salesBySalesperson.map((row) => row.reportDate)), [data.salesBySalesperson]);
  const monthUploadedCount = days.filter((date) => uploadedDays.has(date)).length;
  const existingSalesDate = uploadedDays.has(selectedDate);
  const previewTotals = getPreviewTotals(peoplePreview);

  const refresh = async () => {
    try {
      setData(await loadData());
      setStatus("اختاري يوم من الشهر ثم ارفعي صورة تقفيل المبيعات الخاصة به.");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "تعذر تحميل بيانات الشهر.");
    }
  };

  useEffect(() => {
    void refresh();
    const unsubscribe = subscribeToDataChanges(() => {
      void refresh();
    });
    return unsubscribe;
  }, []);

  const selectDay = (date: string) => {
    setSelectedDate(date);
    setSalesFile(null);
    setPeoplePreview([]);
    setPlatformPreview([]);
    setStatus(uploadedDays.has(date) ? "اليوم مرفوع بالفعل. أي حفظ جديد سيستبدل صورة اليوم." : "اليوم جاهز لرفع صورة المبيعات.");
  };

  const handleFile = (file: File | null) => {
    setSalesFile(file);
    setPeoplePreview([]);
    setPlatformPreview([]);
    if (!file) return;
    const inferredDate = inferDateFromFileName(file.name);
    setSelectedDate(inferredDate);
    setStatus(`تم اختيار ${file.name}. شغلي OCR لمعاينة بيانات اليوم قبل الحفظ.`);
  };

  const runOcr = async () => {
    if (!salesFile) return;
    setStatus("جاري تشغيل OCR...");
    try {
      const text = await runArabicOcr(salesFile, (message, progress) => setStatus(`${message} ${progress}%`));
      const parsed = parseSalesOcrText(text, selectedDate, sourceFileId);
      setPeoplePreview(parsed.people);
      setPlatformPreview(parsed.platforms);
      setStatus(
        parsed.people.length
          ? "تمت قراءة التقرير. راجعي الملخص ثم احفظي صورة اليوم."
          : "قراءة OCR غير موثوقة، فلم يتم ملء اليوم حتى لا تُحفظ بيانات غلط."
      );
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "تعذر تشغيل OCR.");
    }
  };

  const saveDay = async () => {
    if (!peoplePreview.length && !platformPreview.length) return;
    const normalizedPeople = peoplePreview.map((row) => ({
      ...row,
      reportDate: selectedDate,
      sourceFileId,
      totalOrders: row.morningOrders + row.eveningOrders,
      totalRevenue: row.morningRevenue + row.eveningRevenue
    }));
    const normalizedPlatforms = platformPreview.map((row) => ({
      ...row,
      reportDate: selectedDate,
      sourceFileId,
      totalOrders: row.morningOrders + row.eveningOrders,
      totalRevenue: row.morningRevenue + row.eveningRevenue
    }));
    const hasSalesValues = [...normalizedPeople, ...normalizedPlatforms].some((row) => row.totalOrders > 0 || row.totalRevenue > 0);
    if (!hasSalesValues) {
      setStatus("لا يمكن حفظ يوم فاضي. شغلي OCR أو اكتبي أرقام اليوم أولًا.");
      return;
    }
    const now = new Date().toISOString();
    const rawFile: SalesRawFile = {
      id: sourceFileId,
      fileName: salesFile?.name ?? "manual-sales-report",
      filePath: salesFile?.name ?? "manual",
      uploadedAt: now,
      reportDate: selectedDate,
      ocrStatus: salesFile ? "success" : "manual",
      createdAt: now
    };
    setStatus("جاري حفظ صورة اليوم على Supabase...");
    const latest = await loadData();
    const next = await saveSalesUpload(latest, rawFile, normalizedPeople, normalizedPlatforms, existingSalesDate ? "replace" : "merge");
    setData(next);
    setStatus("تم حفظ اليوم وظهوره في الشهر. الداشبورد سيتحدث تلقائيًا.");
  };

  return (
    <section className="monthly-control-shell" dir="rtl">
      <div className="monthly-control-header">
        <div>
          <p className="eyebrow">رفع يومي منظم</p>
          <h1>تقسيمة مبيعات الشهر</h1>
          <p>{status}</p>
        </div>
        <label>
          الشهر
          <input
            type="month"
            value={selectedMonth}
            onChange={(event) => {
              const nextDate = `${event.target.value}-01`;
              setSelectedDate(nextDate);
            }}
          />
        </label>
      </div>

      <div className="monthly-control-summary">
        <span>{monthUploadedCount} يوم مرفوع من {days.length}</span>
        <span>اليوم المحدد: {selectedDate}</span>
        <span>{existingSalesDate ? "مرفوع: الحفظ سيستبدل اليوم" : "غير مرفوع"}</span>
      </div>

      <div className="month-grid">
        {days.map((date) => {
          const summary = getSalesDaySummary(data, date);
          const isUploaded = uploadedDays.has(date);
          const isSelected = selectedDate === date;
          return (
            <button
              key={date}
              className={`month-day ${isUploaded ? "uploaded" : "missing"} ${isSelected ? "selected" : ""}`}
              onClick={() => selectDay(date)}
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

      <div className="monthly-upload-row">
        <div className="monthly-drop">
          <UploadCloud />
          <input type="file" accept="image/*" onChange={(event) => handleFile(event.target.files?.[0] ?? null)} />
          <span>{salesFile ? salesFile.name : "ارفعي صورة مبيعات اليوم المحدد"}</span>
        </div>
        <button className="primary" disabled={!salesFile} onClick={runOcr}>
          <Search size={18} /> تشغيل OCR
        </button>
        <button className="success" disabled={!peoplePreview.length && !platformPreview.length} onClick={saveDay}>
          <Save size={18} /> حفظ صورة اليوم
        </button>
      </div>

      {!!peoplePreview.length && (
        <div className="monthly-preview">
          <div>
            <strong>{integer(previewTotals.orders)}</strong>
            <span>طلبات في المعاينة</span>
          </div>
          <div>
            <strong>{money(previewTotals.revenue)}</strong>
            <span>قيمة المبيعات</span>
          </div>
          <div>
            <strong>{integer(peoplePreview.length)}</strong>
            <span>صفوف السيلز</span>
          </div>
          <div>
            <strong>{integer(platformPreview.length)}</strong>
            <span>صفوف الصفحات</span>
          </div>
        </div>
      )}
    </section>
  );
}

const getMonthDays = (month: string) => {
  const [year, monthNumber] = month.split("-").map(Number);
  const daysInMonth = new Date(year, monthNumber, 0).getDate();
  return Array.from({ length: daysInMonth }, (_, index) => formatDateParts(year, monthNumber, index + 1));
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

const getPreviewTotals = (rows: SalesBySalesperson[]) => ({
  orders: rows.reduce((total, row) => total + row.totalOrders, 0),
  revenue: rows.reduce((total, row) => total + row.totalRevenue, 0)
});
