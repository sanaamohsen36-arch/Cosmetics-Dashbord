"use client";

import { useRef, useState } from "react";
import { FileSpreadsheet, FolderOpen, RotateCcw, Save, Trash2 } from "lucide-react";
import type { AppData, MappableField, SalesByPlatform, SalesBySalesperson, SalesRawFile } from "../../types";
import { firstDayOfMonth, monthKey, today } from "../../lib/date";
import { brandOptions } from "../../lib/constants";
import { integer, money } from "../../lib/format";
import { Badge, CalendarMonth, ErrorList, MonthFolderList, SimpleTable } from "../../lib/ui";
import {
  applyPageCorrections,
  applySalespersonCorrections,
  computeHeaderSignature,
  diffPageCorrections,
  diffSalespersonCorrections
} from "../../lib/mapping-memory";
import {
  createId,
  deleteRawFile,
  recordColumnMapping,
  recordPageCorrection,
  recordSalespersonCorrection,
  saveMasterDataAdditions,
  saveSalesUpload
} from "../../lib/supabase";
import type { PendingColumnMapping } from "../../lib/workbookParsers";
import { applyManualColumnMapping, parseSalesImage, parseSalesWorkbook } from "../../lib/workbookParsers";
import { brandKey } from "../../lib/brands";
import { MappingWizard } from "./MappingWizard";

export function SalesFolderPage({ data, setData }: { data: AppData; setData: (data: AppData) => void }) {
  const knownBrands = [
    ...new Set([
      ...data.brands.filter((item) => item.active).map((item) => item.name),
      ...brandOptions,
      ...data.salesRawFiles.map((file) => file.brandName).filter(Boolean)
    ])
  ];
  const [brand, setBrand] = useState(knownBrands[0]);
  const [selectedDate, setSelectedDate] = useState(today);
  const [statusMessage, setStatusMessage] = useState("");
  const filesForBrand = data.salesRawFiles.filter((file) => file.brandName === brand);
  const uploadedDates = new Set(filesForBrand.map((file) => file.reportDate));
  const existingFile = filesForBrand.find((file) => file.reportDate === selectedDate);
  const selectedMonth = monthKey(selectedDate);
  const monthsWithUploads = new Set(filesForBrand.map((file) => monthKey(file.reportDate)));
  const deleteExistingFile = async () => {
    if (!existingFile) return;
    const confirmed = window.confirm(`Delete saved sales data for ${selectedDate}?`);
    if (!confirmed) return;
    const next = await deleteRawFile(data, existingFile.id);
    setData(next);
    setStatusMessage("تم حذف ملف المبيعات وبياناته لهذا اليوم.");
  };

  return (
    <div className="dashboard-stack">
      <section className="panel">
        <div className="section-title">
          <FolderOpen />
          <div>
            <h2>Sales / المبيعات</h2>
            <p>اختاري Brand أولاً، ثم الشهر، ثم اليوم. كل يوم/Brand له مساحة رفع مستقلة، وملف نهائي واحد فقط.</p>
          </div>
        </div>
        <div className="form-row">
          <label>
            Brand
            <select value={brand} onChange={(event) => setBrand(event.target.value)}>
              {knownBrands.map((item) => <option key={item}>{item}</option>)}
            </select>
          </label>
        </div>
        <MonthFolderList
          selectedMonth={selectedMonth}
          onSelect={(month) => setSelectedDate(firstDayOfMonth(month))}
          isMonthUploaded={(month) => monthsWithUploads.has(month)}
        />
      </section>
      <section className="panel">
        <CalendarMonth selectedDate={selectedDate} uploadedDates={uploadedDates} onSelect={setSelectedDate} />
      </section>
      <section className="panel">
        <h2>{brand} — ملف يوم {selectedDate}</h2>
        {existingFile ? (
          <div className="file-status-card dark-card">
            <div>
              <strong>{existingFile.fileName}</strong>
              <small>{new Date(existingFile.uploadedAt).toLocaleString("ar-EG")}</small>
            </div>
            <div className="actions">
              <Badge text="Saved" />
              <button className="ghost" onClick={deleteExistingFile}>
                <Trash2 size={16} />
                Delete
              </button>
            </div>
          </div>
        ) : (
          <p className="status-line">لا يوجد ملف محفوظ لهذا اليوم لهذا Brand.</p>
        )}
        {statusMessage && <p className="status-line">{statusMessage}</p>}
        <SalesUploadCard data={data} setData={setData} fixedDate={selectedDate} brandName={brand} compact />
      </section>
    </div>
  );
}

function SalesUploadCard({
  data,
  setData,
  fixedDate,
  brandName = "غير محدد",
  compact = false
}: {
  data: AppData;
  setData: (data: AppData) => void;
  fixedDate?: string;
  brandName?: string;
  compact?: boolean;
}) {
  const [file, setFile] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [reportDate, setReportDate] = useState(fixedDate || today);
  const [peoplePreview, setPeoplePreview] = useState<SalesBySalesperson[]>([]);
  const [platformPreview, setPlatformPreview] = useState<SalesByPlatform[]>([]);
  // Snapshot of the preview as first shown (post-parse, post-mapping-memory),
  // kept alongside the editable state so save() can tell a genuine manual
  // name correction apart from an unrelated numeric edit.
  const [originalPeoplePreview, setOriginalPeoplePreview] = useState<SalesBySalesperson[]>([]);
  const [originalPlatformPreview, setOriginalPlatformPreview] = useState<SalesByPlatform[]>([]);
  const [errors, setErrors] = useState<string[]>([]);
  const [message, setMessage] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [pendingMapping, setPendingMapping] = useState<PendingColumnMapping | null>(null);
  const activeDate = fixedDate || reportDate;
  const existing =
    data.salesBySalesperson.some((row) => row.reportDate === activeDate && row.brandName === brandName) ||
    data.salesByPlatform.some((row) => row.reportDate === activeDate && row.brandName === brandName);
  const totals = salesPreviewTotals(peoplePreview, platformPreview);
  const hasValidPreview = (peoplePreview.length > 0 || platformPreview.length > 0) && errors.length === 0 && !pendingMapping;

  const reset = () => {
    setFile(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
    setPeoplePreview([]);
    setPlatformPreview([]);
    setOriginalPeoplePreview([]);
    setOriginalPlatformPreview([]);
    setErrors([]);
    setMessage("");
    setPendingMapping(null);
  };

  const preview = async () => {
    if (!file) return;
    const sourceFileId = createId();
    const isWorkbook = isWorkbookFile(file);
    setMessage(isWorkbook ? "جار قراءة الملف..." : "جاري تحليل الصورة بالذكاء الاصطناعي...");
    setPendingMapping(null);
    try {
      const parsed = isWorkbook
        ? await parseSalesWorkbook(file, activeDate, sourceFileId, data.columnMappings)
        : await parseSalesImage(file, activeDate, sourceFileId, data.columnMappings);
      const correctedPeople = applySalespersonCorrections(parsed.people, data.ocrSalespersonCorrections);
      const correctedPlatforms = applyPageCorrections(parsed.platforms, data.ocrPageCorrections);
      setPeoplePreview(correctedPeople);
      setPlatformPreview(correctedPlatforms);
      setOriginalPeoplePreview(correctedPeople);
      setOriginalPlatformPreview(correctedPlatforms);
      setErrors(parsed.errors);
      if (parsed.pendingMapping) {
        setPendingMapping(parsed.pendingMapping);
        setMessage("لم يتم التعرف على أعمدة الملف تلقائيًا. أكملي التعيين اليدوي أدناه.");
      } else {
        setMessage(parsed.errors.length ? "تمت المعاينة مع أخطاء تحتاج مراجعة." : "Preview ready. راجعي البيانات قبل الحفظ.");
      }
    } catch (error) {
      setPeoplePreview([]);
      setPlatformPreview([]);
      setOriginalPeoplePreview([]);
      setOriginalPlatformPreview([]);
      setErrors([error instanceof Error ? error.message : String(error)]);
      setMessage(isWorkbook ? "فشل قراءة الملف. راجعي نوع الملف والأعمدة." : "فشلت قراءة الصورة. جربي صورة أوضح أو ارفعي Excel/CSV.");
    }
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
      reportDate: activeDate,
      brandName,
      ocrStatus: "success",
      createdAt: now,
      version: 1,
      isCurrent: true
    };

    let workingData = data;
    for (const correction of diffSalespersonCorrections(originalPeoplePreview, peoplePreview)) {
      workingData = await recordSalespersonCorrection(
        workingData,
        correction.wrongValue,
        correction.correctValue,
        correction.salespersonCode
      );
    }
    for (const correction of diffPageCorrections(originalPlatformPreview, platformPreview)) {
      workingData = await recordPageCorrection(workingData, correction.wrongValue, correction.correctValue);
    }

    const people = normalizePeopleRows(peoplePreview, activeDate, brandName, sourceFileId, now);
    const platforms = normalizePlatformRows(platformPreview, activeDate, brandName, sourceFileId, now);
    const enriched = syncMasterData(workingData, people, platforms);
    const newPlatformSettings = enriched.platformSettings.slice(workingData.platformSettings.length);
    const newSalespeople = enriched.salespeople.slice(workingData.salespeople.length);
    const newPlatforms = enriched.platforms.slice(workingData.platforms.length);
    const newBrands = enriched.brands.slice(workingData.brands.length);
    const next = await saveSalesUpload(enriched, rawFile, people, platforms, existing ? "replace" : "merge");
    await saveMasterDataAdditions(newPlatformSettings, newSalespeople, newPlatforms, newBrands);
    setData(next);
    setMessage(existing ? "تم استبدال بيانات المبيعات لهذا التاريخ." : "تم حفظ بيانات المبيعات.");
    setIsSaving(false);
  };

  const confirmMapping = async (fields: Partial<Record<MappableField, number>>) => {
    if (!pendingMapping) return;
    const result = applyManualColumnMapping(pendingMapping.rows, pendingMapping.headerRowIndex, fields, activeDate, createId());
    const correctedPeople = applySalespersonCorrections(result.people, data.ocrSalespersonCorrections);
    const correctedPlatforms = applyPageCorrections(result.platforms, data.ocrPageCorrections);
    // Merge with whatever this file's other sheets already parsed successfully.
    setPeoplePreview((previous) => [...previous, ...correctedPeople]);
    setPlatformPreview((previous) => [...previous, ...correctedPlatforms]);
    setOriginalPeoplePreview((previous) => [...previous, ...correctedPeople]);
    setOriginalPlatformPreview((previous) => [...previous, ...correctedPlatforms]);
    setErrors(result.errors);
    setMessage(result.errors.length ? "تمت المعاينة مع أخطاء تحتاج مراجعة." : "Preview ready. راجعي البيانات قبل الحفظ.");

    const signature = computeHeaderSignature(pendingMapping.headers);
    const next = await recordColumnMapping(data, signature, fields, pendingMapping.gridLabel);
    setData(next);
    setPendingMapping(null);
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
        <input
          ref={fileInputRef}
          accept=".xlsx,.xls,.csv,.png,.jpg,.jpeg"
          type="file"
          onChange={(event) => setFile(event.target.files?.[0] ?? null)}
        />
        {!fixedDate && (
          <label>
            Select Report Date
            <input type="date" value={reportDate} onChange={(event) => setReportDate(event.target.value)} />
          </label>
        )}
        <div className="actions">
          <button className="primary" disabled={!file} onClick={preview}>Preview</button>
          {hasValidPreview && (
            <button className="success" disabled={isSaving} onClick={save}>
              <Save size={18} />
              {existing ? "Replace File" : "Save Data"}
            </button>
          )}
          {(file || peoplePreview.length > 0 || platformPreview.length > 0 || errors.length > 0) && (
            <button className="ghost" disabled={isSaving} onClick={reset}>
              <RotateCcw size={16} />
              Cancel / Reset
            </button>
          )}
        </div>
        {message && <p className="status-line">{message}</p>}
      </div>
      {errors.length > 0 && <ErrorList errors={errors} />}
      {pendingMapping && (
        <MappingWizard headers={pendingMapping.headers} onCancel={() => setPendingMapping(null)} onConfirm={confirmMapping} />
      )}
      {(peoplePreview.length > 0 || platformPreview.length > 0) && (
        <div className="preview-stack">
          <div className={totals.peopleOrders === totals.platformOrders && totals.peopleRevenue === totals.platformRevenue ? "notice success-note" : "notice warning-note"}>
            <strong>إجماليات المعاينة</strong>
            <span>إجمالي الأوردرات: {integer(totals.peopleOrders)} / إجمالي القيمة: {money(totals.peopleRevenue)}</span>
            <span>صباحي: {integer(totals.morningOrders)} أوردر / {money(totals.morningRevenue)}</span>
            <span>مسائي: {integer(totals.eveningOrders)} أوردر / {money(totals.eveningRevenue)}</span>
            <span>السيلز: {integer(totals.peopleOrders)} أوردر / {money(totals.peopleRevenue)}</span>
            <span>الصفحات: {integer(totals.platformOrders)} أوردر / {money(totals.platformRevenue)}</span>
            {totals.grandOrders !== null || totals.grandRevenue !== null ? <span>إجمالي اليوم في الملف: {integer(totals.grandOrders)} أوردر / {money(totals.grandRevenue)}</span> : null}
            {totals.peopleOrders !== totals.platformOrders || totals.peopleRevenue !== totals.platformRevenue ? <span>تحذير: إجمالي السيلز لا يساوي إجمالي الصفحات.</span> : null}
            {(totals.grandOrders !== null && totals.grandOrders !== totals.platformOrders) || (totals.grandRevenue !== null && totals.grandRevenue !== totals.platformRevenue) ? <span>تحذير: إجمالي الصفحات المحسوب لا يطابق إجمالي اليوم داخل الملف.</span> : null}
          </div>
          <EditablePeopleTable rows={peoplePreview} onChange={setPeoplePreview} />
          <EditablePlatformTable rows={platformPreview} onChange={setPlatformPreview} />
        </div>
      )}
    </section>
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
    <SimpleTable title="Preview: Pages / Platforms" headers={["Page", "Group", "Row type", "Morning Orders", "Morning Value", "Evening Orders", "Evening Value", "Total Orders", "Total Value"]}>
      {rows.map((row, index) => (
        <EditableRow key={row.id} row={row} index={index} onChange={onChange} rows={rows} fields={[
          ["platformName", "text"],
          ["groupType", "text"],
          ["rowType", "text"],
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

const salesPreviewTotals = (people: SalesBySalesperson[], platforms: SalesByPlatform[]) => ({
  peopleOrders: people.reduce((sum, row) => sum + row.totalOrders, 0),
  peopleRevenue: people.reduce((sum, row) => sum + row.totalRevenue, 0),
  morningOrders: people.reduce((sum, row) => sum + row.morningOrders, 0),
  morningRevenue: people.reduce((sum, row) => sum + row.morningRevenue, 0),
  eveningOrders: people.reduce((sum, row) => sum + row.eveningOrders, 0),
  eveningRevenue: people.reduce((sum, row) => sum + row.eveningRevenue, 0),
  platformOrders: normalSalesPlatforms(platforms).reduce((sum, row) => sum + row.totalOrders, 0),
  platformRevenue: normalSalesPlatforms(platforms).reduce((sum, row) => sum + row.totalRevenue, 0),
  grandOrders: platforms.find((row) => row.rowType === "grand_total")?.totalOrders ?? null,
  grandRevenue: platforms.find((row) => row.rowType === "grand_total")?.totalRevenue ?? null
});

const normalizePeopleRows = (rows: SalesBySalesperson[], reportDate: string, brandName: string, sourceFileId: string, createdAt: string) =>
  rows
    .filter((row) => row.salespersonName || row.salespersonCode || row.totalOrders || row.totalRevenue)
    .map((row) => ({
      ...row,
      id: createId(),
      reportDate,
      brandName,
      totalOrders: Number(row.morningOrders) + Number(row.eveningOrders),
      totalRevenue: Number(row.morningRevenue) + Number(row.eveningRevenue),
      sourceFileId,
      createdAt
    }));

const normalizePlatformRows = (rows: SalesByPlatform[], reportDate: string, brandName: string, sourceFileId: string, createdAt: string) =>
  normalSalesPlatforms(rows)
    .filter((row) => row.platformName || row.totalOrders || row.totalRevenue)
    .map((row) => ({
      ...row,
      id: createId(),
      reportDate,
      brandName,
      totalOrders: Number(row.morningOrders) + Number(row.eveningOrders),
      totalRevenue: Number(row.morningRevenue) + Number(row.eveningRevenue),
      sourceFileId,
      createdAt
    }));

// Section 19 revision: the Sales Report (this file's Pages_Input sheet) is
// the only source of Brands now - every unique Page name IS a Brand,
// auto-created here the same additive way new salespeople/platforms
// already are. No manual Settings management, no upload-time selection.
const syncMasterData = (data: AppData, people: SalesBySalesperson[], platforms: SalesByPlatform[]): AppData => {
  const salespersonKeys = new Set(data.salespeople.map((row) => `${row.code}-${row.name}`));
  const platformKeys = new Set(data.platforms.map((row) => row.name.trim().toLowerCase()));
  const settingKeys = new Set(data.platformSettings.map((row) => row.platformName.trim().toLowerCase()));
  const brandKeys = new Set(data.brands.map((row) => brandKey(row.name)));
  return {
    ...data,
    brands: [
      ...data.brands,
      ...platforms
        .filter((row) => {
          const key = brandKey(row.platformName);
          if (!row.platformName || !key || brandKeys.has(key)) return false;
          brandKeys.add(key);
          return true;
        })
        .map((row) => ({ id: createId(), name: row.platformName, active: true }))
    ],
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

const normalSalesPlatforms = (rows: SalesByPlatform[]) =>
  rows.filter((row) => (row.rowType ?? (isTotalName(row.platformName) ? "subtotal" : "normal")) === "normal");

const isTotalName = (name: string) => /اجمالي|إجمالي|total/i.test(name);

const isWorkbookFile = (file: File) => /\.(xlsx|xls|csv)$/i.test(file.name);
