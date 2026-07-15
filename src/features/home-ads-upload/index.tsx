"use client";

import { useState } from "react";
import { FileSpreadsheet, FolderOpen, Save, Trash2 } from "lucide-react";
import type { AdsPlatform, HomeAdsRawFile, HomeAdsRow, HomeAppData } from "../../types";
import { firstDayOfMonth, monthKey, today } from "../../lib/date";
import { ErrorList, CalendarMonth, MonthFolderList, SimpleTable } from "../../lib/ui";
import { createId, deleteHomeAdsRawFile, saveHomeAdsUpload } from "../../lib/supabase/homeStorage";
import { parseAdsWorkbook } from "../../lib/workbookParsers";
import { getEffectiveHomePageNames } from "../../lib/homeMetrics";

// Phase 3 (Home Ads Upload). Mirrors Cosmetics' ads-upload feature
// structure/workflow exactly (same parser, same Preview/Save/Delete flow),
// with Cosmetics' Brand replaced by Home's own Page name - Home has no
// Brand concept, so Ads are tagged with the Page they belong to instead,
// matching Home Sales' Page_Name so Dashboard filters line up.
export function HomeAdsFolderPage({ data, setData }: { data: HomeAppData; setData: (data: HomeAppData) => void }) {
  const knownPages = getEffectiveHomePageNames(data);
  const [page, setPage] = useState(knownPages[0] || "");
  const [adsPlatform, setAdsPlatform] = useState<AdsPlatform>("Meta");
  const [selectedDate, setSelectedDate] = useState(today);
  const [statusMessage, setStatusMessage] = useState("");

  const filesForPage = data.adsRawFiles.filter((file) => file.pageName === page);
  const uploadedDates = new Set(filesForPage.map((file) => file.reportDate));
  const monthsWithUploads = new Set(filesForPage.map((file) => monthKey(file.reportDate)));
  const selectedMonth = monthKey(selectedDate);
  const filesForSelection = filesForPage.filter((file) => file.reportDate === selectedDate);
  const deleteAdsFile = async (fileId: string) => {
    const confirmed = window.confirm("Delete this ads file and only its imported rows?");
    if (!confirmed) return;
    const next = await deleteHomeAdsRawFile(data, fileId);
    setData(next);
    setStatusMessage("تم حذف ملف الإعلانات والصفوف المرتبطة به فقط.");
  };

  return (
    <div className="dashboard-stack">
      <section className="panel">
        <div className="section-title">
          <FolderOpen />
          <div>
            <h2>Home Ads Upload</h2>
            <p>اختاري Page أولاً، ثم الشهر واليوم. يمكن رفع أكثر من ملف إعلانات لنفس اليوم لنفس الـ Page.</p>
          </div>
        </div>
        {knownPages.length === 0 ? (
          <p className="status-line">لا توجد Pages بعد - يجب رفع بيانات المبيعات أولاً لإنشاء Page.</p>
        ) : (
          <div className="form-row">
            <label>
              Page
              <select value={page} onChange={(event) => setPage(event.target.value)}>
                {knownPages.map((item) => <option key={item}>{item}</option>)}
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
        <h2>{page}</h2>
        <CalendarMonth selectedDate={selectedDate} uploadedDates={uploadedDates} onSelect={setSelectedDate} />
      </section>
      <section className="panel">
        {filesForSelection.length ? (
          <div className="notice success-note">
            <strong>Uploaded for {page} / {selectedDate}</strong>
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
          <p className="status-line">لا توجد بيانات لهذا الـ Page في اليوم المختار.</p>
        )}
        {statusMessage && <p className="status-line">{statusMessage}</p>}
        {page && (
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
            <HomeAdsUploadCard data={data} setData={setData} platform={adsPlatform} fixedDate={selectedDate} pageName={page} />
          </>
        )}
      </section>
    </div>
  );
}

function HomeAdsUploadCard({
  data,
  setData,
  platform,
  fixedDate,
  pageName
}: {
  data: HomeAppData;
  setData: (data: HomeAppData) => void;
  platform: AdsPlatform;
  fixedDate?: string;
  pageName: string;
}) {
  // Multiple files can be selected together (one platform can have multiple
  // ad accounts, each exported to its own file) - all are parsed and their
  // rows combined into one preview/save batch, never one silently replacing
  // another.
  const [files, setFiles] = useState<File[]>([]);
  const [reportDate, setReportDate] = useState(fixedDate || today);
  const [rows, setRows] = useState<HomeAdsRow[]>([]);
  const [errors, setErrors] = useState<string[]>([]);
  const [message, setMessage] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const activeDate = fixedDate || reportDate;
  const preview = async () => {
    if (!files.length) return;
    setMessage(files.length > 1 ? `جار قراءة ${files.length} ملفات إعلانات...` : "جار قراءة ملف الإعلانات...");
    const combinedRows: HomeAdsRow[] = [];
    const combinedErrors: string[] = [];
    for (const currentFile of files) {
      const parsed = await parseAdsWorkbook(currentFile, platform, activeDate, createId());
      combinedRows.push(
        ...parsed.rows.map((row) => ({
          ...row,
          workspace: "home" as const,
          pageName,
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
    const rawFile: HomeAdsRawFile = {
      id: sourceFileId,
      workspace: "home",
      fileName: combinedFileName,
      filePath: combinedFileName,
      uploadedAt: now,
      reportDate: activeDate,
      adsPlatform: platform,
      pageName,
      parsingStatus: "success",
      createdAt: now,
      version: 1,
      isCurrent: true
    };
    const normalizedRows = rows.map((row) => ({
      ...row,
      id: createId(),
      workspace: "home" as const,
      reportDate: activeDate,
      adsPlatform: platform,
      sourceFileId,
      createdAt: now,
      pageName
    }));
    const next = await saveHomeAdsUpload(data, rawFile, normalizedRows, platform, "merge");
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
          <p>{pageName} / {activeDate} - Excel أو CSV مع معاينة قبل الحفظ.</p>
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
      {rows.length > 0 && <EditableHomeAdsTable platform={platform} rows={rows} onChange={setRows} />}
    </section>
  );
}

function EditableHomeAdsTable({ platform, rows, onChange }: { platform: AdsPlatform; rows: HomeAdsRow[]; onChange: (rows: HomeAdsRow[]) => void }) {
  const headers =
    platform === "Meta"
      ? ["Campaign", "Ad set", "Ad", "Spend", "Messages", "Comments", "Results", "Cost / Result", "Impressions", "Reach", "Clicks", "CTR", "CPC", "CPM"]
      : ["Campaign", "Ad group", "Ad", "Spend", "Messages", "Comments", "Results", "Cost / Result", "Impressions", "Clicks", "CTR", "CPC", "CPM"];
  return (
    <SimpleTable title={`Preview: ${platform} Ads`} headers={headers}>
      {rows.map((row, index) => {
        const update = (field: keyof HomeAdsRow, value: string) => {
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

const numericAdsFields = new Set<keyof HomeAdsRow>(["spend", "impressions", "reach", "clicks", "ctr", "cpc", "cpm", "leads", "purchases", "purchaseValue", "messagesCount", "commentsCount", "resultsCount", "costPerResult"]);
