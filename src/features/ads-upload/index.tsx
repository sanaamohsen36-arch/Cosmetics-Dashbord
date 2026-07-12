"use client";

import { useState } from "react";
import { FileSpreadsheet, FolderOpen, Save, Trash2 } from "lucide-react";
import type { AdsPlatform, AdsRawFile, AdsRow, AppData } from "../../types";
import { firstDayOfMonth, monthKey, today } from "../../lib/date";
import { ErrorList, CalendarMonth, MonthFolderList, SimpleTable } from "../../lib/ui";
import { createId, deleteRawFile, saveAdsUpload } from "../../lib/supabase";
import { parseAdsWorkbook } from "../../lib/workbookParsers";
import { getEffectiveBrandNames } from "../../lib/brands";

// Section 19 revision: Brand is the only business entity now - no parent
// Brand with Facebook/Instagram/TikTok children. The uploader picks ONE
// Brand (same list Sales pages populate), then uploads however many Ads
// files belong to it; Meta vs TikTok is only which column template to
// parse with, not a folder/dashboard structure.
export function AdsFolderPage({ data, setData }: { data: AppData; setData: (data: AppData) => void }) {
  const knownBrands = getEffectiveBrandNames(data);
  const [brand, setBrand] = useState(knownBrands[0] || "");
  const [adsPlatform, setAdsPlatform] = useState<AdsPlatform>("Meta");
  const [selectedDate, setSelectedDate] = useState(today);
  const [statusMessage, setStatusMessage] = useState("");

  const filesForBrand = data.adsRawFiles.filter((file) => file.salesPlatformName === brand);
  const uploadedDates = new Set(filesForBrand.map((file) => file.reportDate));
  const monthsWithUploads = new Set(filesForBrand.map((file) => monthKey(file.reportDate)));
  const selectedMonth = monthKey(selectedDate);
  const filesForSelection = filesForBrand.filter((file) => file.reportDate === selectedDate);
  const deleteAdsFile = async (fileId: string) => {
    const confirmed = window.confirm("Delete this ads file and only its imported rows?");
    if (!confirmed) return;
    const next = await deleteRawFile(data, fileId);
    setData(next);
    setStatusMessage("تم حذف ملف الإعلانات والصفوف المرتبطة به فقط.");
  };

  return (
    <div className="dashboard-stack">
      <section className="panel">
        <div className="section-title">
          <FolderOpen />
          <div>
            <h2>Ads / الإعلانات</h2>
            <p>اختاري Brand أولاً، ثم الشهر واليوم. يمكن رفع أكثر من ملف إعلانات لنفس اليوم لنفس الـ Brand.</p>
          </div>
        </div>
        {knownBrands.length === 0 ? (
          <p className="status-line">لا توجد Brands بعد - يجب رفع بيانات المبيعات أولاً لإنشاء Brand.</p>
        ) : (
          <div className="form-row">
            <label>
              Brand
              <select value={brand} onChange={(event) => setBrand(event.target.value)}>
                {knownBrands.map((item) => <option key={item}>{item}</option>)}
              </select>
            </label>
          </div>
        )}
        <MonthFolderList
          selectedMonth={selectedMonth}
          onSelect={(month) => setSelectedDate(firstDayOfMonth(month))}
          isMonthUploaded={(month) => monthsWithUploads.has(month)}
        />
      </section>
      <section className="panel">
        <h2>{brand}</h2>
        <CalendarMonth selectedDate={selectedDate} uploadedDates={uploadedDates} onSelect={setSelectedDate} />
      </section>
      <section className="panel">
        {filesForSelection.length ? (
          <div className="notice success-note">
            <strong>Uploaded for {brand} / {selectedDate}</strong>
            {filesForSelection.map((file) => (
              <span key={file.id} className="file-row">
                {file.fileName} - {new Date(file.uploadedAt).toLocaleString("ar-EG")}
                <button className="ghost" onClick={() => deleteAdsFile(file.id)}>
                  <Trash2 size={16} />
                  Delete
                </button>
              </span>
            ))}
          </div>
        ) : (
          <p className="status-line">لا توجد بيانات لهذا الـ Brand في اليوم المختار.</p>
        )}
        {statusMessage && <p className="status-line">{statusMessage}</p>}
        {brand && (
          <>
            <div className="form-row">
              <label>
                File type (لتحديد الأعمدة الصحيحة فقط)
                <select value={adsPlatform} onChange={(event) => setAdsPlatform(event.target.value as AdsPlatform)}>
                  <option value="Meta">Meta (Facebook / Instagram)</option>
                  <option value="TikTok">TikTok</option>
                </select>
              </label>
            </div>
            <AdsUploadCard data={data} setData={setData} platform={adsPlatform} fixedDate={selectedDate} brandName={brand} />
          </>
        )}
      </section>
    </div>
  );
}

function AdsUploadCard({
  data,
  setData,
  platform,
  fixedDate,
  brandName
}: {
  data: AppData;
  setData: (data: AppData) => void;
  platform: AdsPlatform;
  fixedDate?: string;
  brandName: string;
}) {
  // Multiple files can be selected together (one platform can have multiple
  // ad accounts, each exported to its own file) - all are parsed and their
  // rows combined into one preview/save batch, never one silently replacing
  // another.
  const [files, setFiles] = useState<File[]>([]);
  const [reportDate, setReportDate] = useState(fixedDate || today);
  const [rows, setRows] = useState<AdsRow[]>([]);
  const [errors, setErrors] = useState<string[]>([]);
  const [message, setMessage] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const activeDate = fixedDate || reportDate;
  const preview = async () => {
    if (!files.length) return;
    setMessage(files.length > 1 ? `جار قراءة ${files.length} ملفات إعلانات...` : "جار قراءة ملف الإعلانات...");
    const combinedRows: AdsRow[] = [];
    const combinedErrors: string[] = [];
    for (const currentFile of files) {
      const parsed = await parseAdsWorkbook(currentFile, platform, activeDate, createId());
      combinedRows.push(
        ...parsed.rows.map((row) => ({
          ...row,
          salesPlatformName: brandName,
          adAccountName: platform,
          // Resolve the "results" style column (messages/leads/purchases) once, here,
          // so the preview table shows the real value and is editable like any other field.
          leads: Number(row.resultsCount) || row.leads || row.purchases || 0,
          cpc: Number(row.costPerResult) || row.cpc || 0
        }))
      );
      combinedErrors.push(...parsed.errors.map((error) => (files.length > 1 ? `${currentFile.name}: ${error}` : error)));
    }
    setRows(combinedRows);
    setErrors(combinedErrors);
    setMessage(combinedErrors.length ? "تمت المعاينة مع أخطاء تحتاج مراجعة." : "Preview ready. راجعي البيانات قبل الحفظ.");
  };

  const save = async () => {
    if (!files.length || errors.length) return;
    setIsSaving(true);
    const sourceFileId = createId();
    const now = new Date().toISOString();
    const combinedFileName = files.map((item) => item.name).join(", ");
    const rawFile: AdsRawFile = {
      id: sourceFileId,
      fileName: combinedFileName,
      filePath: combinedFileName,
      uploadedAt: now,
      reportDate: activeDate,
      adsPlatform: platform,
      salesPlatformName: brandName,
      adAccountName: platform,
      parsingStatus: "success",
      createdAt: now,
      version: 1,
      isCurrent: true
    };
    const normalizedRows = rows.map((row) => ({
      ...row,
      id: createId(),
      reportDate: activeDate,
      adsPlatform: platform,
      sourceFileId,
      createdAt: now,
      salesPlatformName: brandName,
      adAccountName: platform
    }));
    const next = await saveAdsUpload(data, rawFile, normalizedRows, platform, "merge");
    setData(next);
    setMessage(`تم حفظ بيانات ${platform} (${files.length} ملف) بدون حذف الملفات الأخرى لنفس اليوم.`);
    setIsSaving(false);
  };

  return (
    <section className="panel upload-card">
      <div className="section-title">
        <FileSpreadsheet />
        <div>
          <h2>{platform} Ads Upload</h2>
          <p>{brandName} / {activeDate} - Excel أو CSV مع معاينة قبل الحفظ.</p>
        </div>
      </div>
      <div className="upload-box">
        <input accept=".xlsx,.xls,.csv" type="file" multiple onChange={(event) => setFiles(Array.from(event.target.files ?? []))} />
        {files.length > 1 && <p className="status-line">{files.length} ملفات محددة: {files.map((item) => item.name).join(", ")}</p>}
        {!fixedDate && (
          <label>
            Select Report Date
            <input type="date" value={reportDate} onChange={(event) => setReportDate(event.target.value)} />
          </label>
        )}
        <div className="actions">
          <button className="primary" disabled={!files.length} onClick={preview}>Preview</button>
          {rows.length > 0 ? (
            <button className="success" disabled={isSaving || errors.length > 0} onClick={save}>
              <Save size={18} />
              Save Platform Data
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

function EditableAdsTable({ platform, rows, onChange }: { platform: AdsPlatform; rows: AdsRow[]; onChange: (rows: AdsRow[]) => void }) {
  const headers =
    platform === "Meta"
      ? ["Campaign", "Ad set", "Ad", "Spend", "Messages", "Comments", "Results", "Cost / Result", "Impressions", "Reach", "Clicks", "CTR", "CPC", "CPM"]
      : ["Campaign", "Ad group", "Ad", "Spend", "Messages", "Comments", "Results", "Cost / Result", "Impressions", "Clicks", "CTR", "CPC", "CPM"];
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
            <td><input type="number" value={row.messagesCount ?? 0} onChange={(event) => update("messagesCount", event.target.value)} /></td>
            <td><input type="number" value={row.commentsCount ?? 0} onChange={(event) => update("commentsCount", event.target.value)} /></td>
            <td><input type="number" value={row.resultsCount ?? 0} onChange={(event) => update("resultsCount", event.target.value)} /></td>
            <td><input type="number" value={row.costPerResult ?? 0} onChange={(event) => update("costPerResult", event.target.value)} /></td>
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

const numericAdsFields = new Set<keyof AdsRow>(["spend", "impressions", "reach", "clicks", "ctr", "cpc", "cpm", "leads", "purchases", "purchaseValue", "messagesCount", "commentsCount", "resultsCount", "costPerResult"]);

const adsPlatformKind = (platformName: string): AdsPlatform => (/tiktok/i.test(platformName) || /تيك/.test(platformName) ? "TikTok" : "Meta");
