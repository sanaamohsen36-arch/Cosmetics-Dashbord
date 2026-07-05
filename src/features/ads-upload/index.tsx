"use client";

import { useState } from "react";
import { FileSpreadsheet, FolderOpen, Save, Trash2 } from "lucide-react";
import type { AdsPlatform, AdsRawFile, AdsRow, AppData } from "../../types";
import { firstDayOfMonth, monthKey, today } from "../../lib/date";
import { adsPlatformOptions, brandOptions } from "../../lib/constants";
import { ErrorList, CalendarMonth, MonthFolderList, SimpleTable } from "../../lib/ui";
import { createId, deleteRawFile, saveAdsUpload } from "../../lib/supabase";
import { parseAdsWorkbook } from "../../lib/workbookParsers";

export function AdsFolderPage({ data, setData }: { data: AppData; setData: (data: AppData) => void }) {
  // Platform is the primary folder structure (Facebook Ads, Instagram Ads,
  // WhatsApp Ads, TikTok Ads, WhatsApp TikTok Ads, Other); brand is a
  // secondary selector within a platform, not the top-level nav.
  const [platformName, setPlatformName] = useState(adsPlatformOptions[0]);
  const knownBrands = [...new Set([...brandOptions, ...data.adsRawFiles.map((file) => file.salesPlatformName).filter(Boolean)])];
  const [brand, setBrand] = useState(knownBrands[0] || brandOptions[0]);
  const [selectedDate, setSelectedDate] = useState(today);
  const [statusMessage, setStatusMessage] = useState("");

  const filesForPlatformAndBrand = data.adsRawFiles.filter(
    (file) => file.adAccountName === platformName && file.salesPlatformName === brand
  );
  const uploadedDates = new Set(filesForPlatformAndBrand.map((file) => file.reportDate));
  const monthsWithUploads = new Set(filesForPlatformAndBrand.map((file) => monthKey(file.reportDate)));
  const selectedMonth = monthKey(selectedDate);
  const filesForSelection = filesForPlatformAndBrand.filter((file) => file.reportDate === selectedDate);
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
            <p>اختاري منصة الإعلان أولاً، ثم Brand، ثم الشهر واليوم. يمكن رفع أكثر من ملف CSV لنفس اليوم.</p>
          </div>
        </div>
        <div className="folder-tabs">
          {adsPlatformOptions.map((item) => (
            <button key={item} className={platformName === item ? "primary" : ""} onClick={() => setPlatformName(item)}>{item}</button>
          ))}
        </div>
      </section>
      <section className="panel">
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
        <h2>{platformName} — {brand}</h2>
        <CalendarMonth selectedDate={selectedDate} uploadedDates={uploadedDates} onSelect={setSelectedDate} />
      </section>
      <section className="panel">
        {filesForSelection.length ? (
          <div className="notice success-note">
            <strong>Uploaded for {brand} / {selectedDate} / {platformName}</strong>
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
          <p className="status-line">لا توجد بيانات لهذه المنصة في اليوم المختار.</p>
        )}
        {statusMessage && <p className="status-line">{statusMessage}</p>}
        <AdsUploadCard data={data} setData={setData} platform={adsPlatformKind(platformName)} fixedDate={selectedDate} brandName={brand} selectedAdsPlatform={platformName} />
      </section>
    </div>
  );
}

function AdsUploadCard({
  data,
  setData,
  platform,
  fixedDate,
  brandName = "عام",
  selectedAdsPlatform = platform
}: {
  data: AppData;
  setData: (data: AppData) => void;
  platform: AdsPlatform;
  fixedDate?: string;
  brandName?: string;
  selectedAdsPlatform?: string;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [reportDate, setReportDate] = useState(fixedDate || today);
  const [rows, setRows] = useState<AdsRow[]>([]);
  const [errors, setErrors] = useState<string[]>([]);
  const [message, setMessage] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const activeDate = fixedDate || reportDate;
  const preview = async () => {
    if (!file) return;
    setMessage("جار قراءة ملف الإعلانات...");
    const parsed = await parseAdsWorkbook(file, platform, activeDate, createId());
    setRows(
      parsed.rows.map((row) => ({
        ...row,
        salesPlatformName: brandName,
        adAccountName: selectedAdsPlatform,
        // Resolve the "results" style column (messages/leads/purchases) once, here,
        // so the preview table shows the real value and is editable like any other field.
        leads: Number(row.resultsCount) || row.leads || row.purchases || 0,
        cpc: Number(row.costPerResult) || row.cpc || 0
      }))
    );
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
      reportDate: activeDate,
      adsPlatform: platform,
      salesPlatformName: brandName,
      adAccountName: selectedAdsPlatform,
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
      adAccountName: selectedAdsPlatform
    }));
    const next = await saveAdsUpload(data, rawFile, normalizedRows, platform, "merge");
    setData(next);
    setMessage(`تم حفظ ملف ${selectedAdsPlatform} بدون حذف الملفات الأخرى لنفس اليوم.`);
    setIsSaving(false);
  };

  return (
    <section className="panel upload-card">
      <div className="section-title">
        <FileSpreadsheet />
        <div>
          <h2>{selectedAdsPlatform} Upload</h2>
          <p>{brandName} / {activeDate} - Excel أو CSV مع معاينة قبل الحفظ.</p>
        </div>
      </div>
      <div className="upload-box">
        <input accept=".xlsx,.xls,.csv" type="file" onChange={(event) => setFile(event.target.files?.[0] ?? null)} />
        {!fixedDate && (
          <label>
            Select Report Date
            <input type="date" value={reportDate} onChange={(event) => setReportDate(event.target.value)} />
          </label>
        )}
        <div className="actions">
          <button className="primary" disabled={!file} onClick={preview}>Preview</button>
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
