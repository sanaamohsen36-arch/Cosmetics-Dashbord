"use client";

import { useState } from "react";
import type { MappableField } from "../../types";
import { mappableFieldLabels, mappableFields } from "../../lib/mapping-memory";

// Shown when neither a learned mapping nor alias-based detection could
// recognize a file's columns. Lets the user assign each field once; on
// confirmation the caller persists the mapping (keyed by header signature)
// so the same file structure is recognized automatically next time -
// the parser "learns" instead of only ever depending on hardcoded aliases.
export function MappingWizard({
  headers,
  onConfirm,
  onCancel
}: {
  headers: string[];
  onConfirm: (fields: Partial<Record<MappableField, number>>) => void;
  onCancel: () => void;
}) {
  const [assignments, setAssignments] = useState<Partial<Record<MappableField, number>>>({});

  const setField = (field: MappableField, value: string) => {
    setAssignments((previous) => {
      const next = { ...previous };
      if (value === "") delete next[field];
      else next[field] = Number(value);
      return next;
    });
  };

  const hasAnyMapping = Object.keys(assignments).length > 0;

  return (
    <div className="notice warning-note mapping-wizard">
      <strong>لم يتم التعرف على أعمدة هذا الملف تلقائيًا</strong>
      <p>
        الأعمدة الموجودة في الملف: {headers.map((header, index) => header || `عمود ${index + 1}`).join("، ") || "لا يوجد"}
      </p>
      <p>عيّني كل حقل بالعمود المطابق له في الملف. سيتم حفظ هذا التعيين، وسيتم التعرف على نفس شكل الملف تلقائيًا في المرة القادمة.</p>
      <div className="mapping-wizard-grid">
        {mappableFields.map((field) => (
          <label key={field}>
            {mappableFieldLabels[field]}
            <select value={assignments[field] ?? ""} onChange={(event) => setField(field, event.target.value)}>
              <option value="">-- غير موجود --</option>
              {headers.map((header, index) => (
                <option key={index} value={index}>
                  {header || `عمود ${index + 1}`}
                </option>
              ))}
            </select>
          </label>
        ))}
      </div>
      <div className="actions">
        <button className="primary" disabled={!hasAnyMapping} onClick={() => onConfirm(assignments)}>
          تأكيد التعيين وحفظه
        </button>
        <button className="ghost" onClick={onCancel}>
          إلغاء
        </button>
      </div>
    </div>
  );
}
