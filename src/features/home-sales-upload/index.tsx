"use client";

import { useRef, useState } from "react";
import { AlertTriangle, FileSpreadsheet, Save, Trash2 } from "lucide-react";
import type { HomeAppData, HomeSalesBySalesperson, HomeSalesByPage, HomeSalesRawFile, ShiftType } from "../../types";
import { today } from "../../lib/date";
import { integer, money } from "../../lib/format";
import { Badge, ErrorList, SimpleTable } from "../../lib/ui";
import { parseHomeSalesWorkbook, type HomeParsedWorkbook } from "../../lib/homeWorkbookParser";
import { buildHomeUploadKey, createId, deleteHomeRawFile, saveHomeSalesUpload } from "../../lib/supabase/homeStorage";

// Phase 2 (Home workspace). Deliberately minimal per spec: Report Date,
// Shift Type, Excel File, Upload - no Brand selector, no Ads-platform
// selector, no month/calendar folder navigation (Cosmetics-only patterns).
export function HomeSalesUploadPage({ data, setData }: { data: HomeAppData; setData: (data: HomeAppData) => void }) {
  const [reportDate, setReportDate] = useState(today);
  const [shiftType, setShiftType] = useState<ShiftType>("Morning");
  const [file, setFile] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [parsed, setParsed] = useState<HomeParsedWorkbook | null>(null);
  const [message, setMessage] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  const filesForDate = data.rawFiles.filter((item) => item.reportDate === reportDate && item.isCurrent);
  const existingForSlot = data.rawFiles.find((item) => item.reportDate === reportDate && item.shiftType === shiftType && item.isCurrent);
  const hasErrors = Boolean(parsed && parsed.errors.length > 0);
  const canSave = Boolean(parsed && !hasErrors);

  const reset = (keepMessage = false) => {
    setFile(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
    setParsed(null);
    if (!keepMessage) setMessage("");
  };

  const preview = async () => {
    if (!file) return;
    setMessage("جار قراءة الملف...");
    try {
      const result = await parseHomeSalesWorkbook(file, reportDate, shiftType);
      setParsed(result);
      setMessage(result.errors.length ? "تمت المعاينة مع أخطاء تحتاج مراجعة." : "Preview ready. راجعي البيانات قبل الحفظ.");
    } catch (error) {
      setParsed(null);
      setMessage(error instanceof Error ? error.message : String(error));
    }
  };

  const save = async (mode: "merge" | "replace") => {
    if (!parsed || !canSave || !file) return;
    setIsSaving(true);
    const sourceFileId = createId();
    const now = new Date().toISOString();
    const rawFile: HomeSalesRawFile = {
      id: sourceFileId,
      workspace: "home",
      reportDate,
      shiftType,
      uploadKey: buildHomeUploadKey(reportDate, shiftType),
      fileName: file.name,
      uploadedAt: now,
      createdAt: now,
      version: 1,
      isCurrent: true
    };
    const salespeople: HomeSalesBySalesperson[] = parsed.salespeople.map((row) => ({
      id: createId(),
      workspace: "home",
      reportDate,
      shiftType,
      salespersonCode: row.salespersonCode,
      salespersonName: row.salespersonName,
      teamType: row.teamType,
      orders: row.orders,
      revenue: row.revenue,
      notes: row.notes,
      sourceFileId,
      createdAt: now
    }));
    const pages: HomeSalesByPage[] = parsed.pages.map((row) => ({
      id: createId(),
      workspace: "home",
      reportDate,
      shiftType,
      pageName: row.pageName,
      orders: row.orders,
      revenue: row.revenue,
      notes: row.notes,
      sourceFileId,
      createdAt: now
    }));

    const next = await saveHomeSalesUpload(data, rawFile, salespeople, pages, mode);
    setData(next);
    setIsSaving(false);
    reset(true);
    setMessage(mode === "replace" ? "تم استبدال الشيفت بنجاح." : "تم حفظ الشيفت بنجاح.");
  };

  const deleteFile = async (id: string) => {
    const confirmed = window.confirm("Delete this shift's upload and all its rows?");
    if (!confirmed) return;
    const next = await deleteHomeRawFile(data, id);
    setData(next);
    setMessage("تم حذف الشيفت وبياناته.");
  };

  return (
    <div className="dashboard-stack">
      <section className="panel">
        <div className="section-title">
          <FileSpreadsheet />
          <div>
            <h2>Home Sales Upload</h2>
            <p>One Excel file = one date + one shift. Morning and Evening are uploaded separately.</p>
          </div>
        </div>
        <div className="form-row">
          <label>
            Report Date
            <input type="date" value={reportDate} onChange={(event) => { setReportDate(event.target.value); reset(); }} />
          </label>
          <label>
            Shift Type
            <select value={shiftType} onChange={(event) => { setShiftType(event.target.value as ShiftType); reset(); }}>
              <option value="Morning">Morning</option>
              <option value="Evening">Evening</option>
            </select>
          </label>
        </div>
        <div className="upload-box">
          <input
            ref={fileInputRef}
            accept=".xlsx,.xls"
            type="file"
            onChange={(event) => { setFile(event.target.files?.[0] ?? null); setParsed(null); setMessage(""); }}
          />
          <div className="actions">
            <button className="primary" disabled={!file} onClick={preview}>Preview</button>
          </div>
          {message && <p className="status-line">{message}</p>}
        </div>
      </section>

      {filesForDate.length > 0 && (
        <section className="panel">
          <h2>Uploaded shifts for {reportDate}</h2>
          {filesForDate.map((item) => (
            <span key={item.id} className="file-row">
              <Badge text={item.shiftType} /> {item.fileName}
              <button className="ghost" onClick={() => deleteFile(item.id)}>
                <Trash2 size={16} />
                Delete
              </button>
            </span>
          ))}
        </section>
      )}

      {parsed && (
        <section className="panel">
          <h2>Preview</h2>
          {parsed.errors.length > 0 && <ErrorList errors={parsed.errors} />}
          <div className={hasErrors ? "notice error-note" : "notice success-note"}>
            <span>Date: {parsed.reportDate || reportDate} / Shift: {parsed.shiftType || shiftType}</span>
            <span>Salespeople: {integer(parsed.salespeople.length)} / Pages: {integer(parsed.pages.length)}</span>
            <span>Total Orders: {integer(parsed.totals.salespeopleOrders)} / Total Revenue: {money(parsed.totals.salespeopleRevenue)}</span>
            <span>Orders validation: {parsed.totals.salespeopleOrders === parsed.totals.pagesOrders ? "OK" : "MISMATCH"}</span>
            <span>Revenue validation: {parsed.totals.salespeopleRevenue === parsed.totals.pagesRevenue ? "OK" : "MISMATCH"}</span>
          </div>

          {canSave && existingForSlot && (
            <div className="notice warning-note">
              <AlertTriangle size={18} />
              <strong>This shift already exists for the selected date.</strong>
              <div className="actions">
                <button className="success" disabled={isSaving} onClick={() => save("replace")}>
                  <Save size={18} />
                  Replace existing upload
                </button>
                <button className="ghost" disabled={isSaving} onClick={() => reset()}>Cancel</button>
              </div>
            </div>
          )}

          {canSave && !existingForSlot && (
            <div className="actions">
              <button className="success" disabled={isSaving} onClick={() => save("merge")}>
                <Save size={18} />
                Save Shift Data
              </button>
            </div>
          )}

          {parsed.salespeople.length > 0 && (
            <SimpleTable title="Preview: Salespeople" headers={["Code", "Name", "Team", "Orders", "Revenue", "Notes"]}>
              {parsed.salespeople.map((row, index) => (
                <tr key={index}>
                  <td>{row.salespersonCode}</td>
                  <td>{row.salespersonName}</td>
                  <td>{row.teamType}</td>
                  <td>{integer(row.orders)}</td>
                  <td>{money(row.revenue)}</td>
                  <td>{row.notes}</td>
                </tr>
              ))}
            </SimpleTable>
          )}

          {parsed.pages.length > 0 && (
            <SimpleTable title="Preview: Pages" headers={["Page", "Orders", "Revenue", "Notes"]}>
              {parsed.pages.map((row, index) => (
                <tr key={index}>
                  <td>{row.pageName}</td>
                  <td>{integer(row.orders)}</td>
                  <td>{money(row.revenue)}</td>
                  <td>{row.notes}</td>
                </tr>
              ))}
            </SimpleTable>
          )}
        </section>
      )}
    </div>
  );
}
