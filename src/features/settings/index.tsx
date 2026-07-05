"use client";

import { useEffect, useState } from "react";
import { Activity, Archive, History, Lock } from "lucide-react";
import type { AppData, BackupRun, Profile, Role, SystemHealthStatus, AuditLogEntry } from "../../types";
import { createId } from "../../lib/supabase";
import { Badge } from "../../lib/ui";
import { isAuthEnabled, listProfiles, updateProfileRole } from "../../lib/auth";
import { can, roleLabels } from "../../lib/permissions";
import { listAuditLog } from "../../lib/audit";
import { listHealthStatus } from "../../lib/health";
import { listBackupRuns } from "../../lib/backup";

const allRoles: Role[] = ["owner", "marketing_manager", "media_buyer", "sales_manager", "data_entry", "viewer"];

// Local-fallback mode (no Supabase) has no auth at all, so every visitor
// keeps full access - same convention as every other Supabase-only feature
// in this codebase. Once Supabase Auth is configured, real roles apply.
const effectiveRole = (profile: Profile | null): Role | null => (isAuthEnabled ? profile?.role ?? null : "owner");

export function SettingsPage({
  data,
  commitData,
  profile
}: {
  data: AppData;
  commitData: (data: AppData) => Promise<void>;
  profile: Profile | null;
}) {
  const [platformName, setPlatformName] = useState("");
  const [salespersonName, setSalespersonName] = useState("");
  const [salespersonCode, setSalespersonCode] = useState("");
  const role = effectiveRole(profile);

  const addPlatform = async () => {
    if (!platformName.trim()) return;
    await commitData({
      ...data,
      platformSettings: [...data.platformSettings, { id: createId(), platformName: platformName.trim(), isActive: true, createdAt: new Date().toISOString() }],
      platforms: [...data.platforms, { id: createId(), name: platformName.trim(), aliases: [platformName.trim()], active: true }]
    });
    setPlatformName("");
  };

  const addSalesperson = async () => {
    if (!salespersonName.trim() && !salespersonCode.trim()) return;
    await commitData({
      ...data,
      salespeople: [...data.salespeople, { id: createId(), code: salespersonCode.trim(), name: salespersonName.trim(), active: true }]
    });
    setSalespersonName("");
    setSalespersonCode("");
  };

  return (
    <div className="content-grid">
      <section className="panel">
        <h2>Manage page/platform names</h2>
        <div className="form-row">
          <label>
            Platform name
            <input value={platformName} onChange={(event) => setPlatformName(event.target.value)} />
          </label>
          <button className="primary" onClick={addPlatform}>Add</button>
        </div>
        <ul className="settings-list">{data.platformSettings.map((item) => <li key={item.id}>{item.platformName}</li>)}</ul>
      </section>
      <section className="panel">
        <h2>Manage salesperson names and codes</h2>
        <div className="form-row">
          <label>
            Name
            <input value={salespersonName} onChange={(event) => setSalespersonName(event.target.value)} />
          </label>
          <label>
            Code
            <input value={salespersonCode} onChange={(event) => setSalespersonCode(event.target.value)} />
          </label>
          <button className="primary" onClick={addSalesperson}>Add</button>
        </div>
        <ul className="settings-list">{data.salespeople.map((item) => <li key={item.id}>{item.name} {item.code ? `(${item.code})` : ""}</li>)}</ul>
      </section>
      <section className="panel wide">
        <h2>Ads platform mapping</h2>
        <p className="status-line">النسخة الحالية تستخدم Meta و TikTok مباشرة، ويمكن إضافة mapping لاحقا بدون تغيير البيانات.</p>
      </section>
      <RolesPanel role={role} />
      {can(role, "audit_log.view") && <AuditLogPanel />}
      {(can(role, "backup.view_history") || can(role, "backup.run_manual")) && <BackupPanel role={role} />}
      {can(role, "system_health.view") && <HealthPanel />}
    </div>
  );
}

function RolesPanel({ role }: { role: Role | null }) {
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const manageUsers = can(role, "settings.manage_users");

  useEffect(() => {
    if (!isAuthEnabled) return;
    void listProfiles().then(setProfiles);
  }, []);

  const changeRole = async (profileId: string, newRole: Role) => {
    await updateProfileRole(profileId, newRole);
    setProfiles((prev) => prev.map((item) => (item.id === profileId ? { ...item, role: newRole } : item)));
  };

  return (
    <section className="panel wide">
      <div className="section-title">
        <Lock />
        <div>
          <h2>Roles &amp; Permissions</h2>
          <p>
            {isAuthEnabled
              ? "أدوار المستخدمين الفعلية - يتحكم بها Owner فقط."
              : "لا يوجد Supabase Auth مفعّل حاليًا - كل من يفتح اللوحة لديه صلاحية كاملة (Local mode)."}
          </p>
        </div>
      </div>
      {isAuthEnabled ? (
        profiles.length ? (
          <ul className="settings-list">
            {profiles.map((item) => (
              <li key={item.id} className="role-row">
                <span>{item.displayName}</span>
                {manageUsers ? (
                  <select value={item.role} onChange={(event) => void changeRole(item.id, event.target.value as Role)}>
                    {allRoles.map((option) => <option key={option} value={option}>{roleLabels[option]}</option>)}
                  </select>
                ) : (
                  <Badge text={roleLabels[item.role]} />
                )}
              </li>
            ))}
          </ul>
        ) : (
          <p className="status-line">لا يوجد مستخدمون بعد.</p>
        )
      ) : (
        <div className="role-placeholder-grid">
          {allRoles.map((item) => (
            <div key={item} className="role-placeholder-card">
              <strong>{roleLabels[item]}</strong>
              <Badge text="Local mode - full access" />
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

function AuditLogPanel() {
  const [entries, setEntries] = useState<AuditLogEntry[]>([]);

  useEffect(() => {
    void listAuditLog(50).then(setEntries);
  }, []);

  return (
    <section className="panel wide">
      <div className="section-title">
        <History />
        <div>
          <h2>Audit Log</h2>
          <p>سجل كل عمليات الحفظ والحذف - للقراءة فقط، لا يمكن تعديله أو حذفه.</p>
        </div>
      </div>
      {entries.length ? (
        <ul className="settings-list">
          {entries.map((entry) => (
            <li key={entry.id}>
              <strong>{entry.action}</strong> {entry.entityType} - {new Date(entry.createdAt).toLocaleString("ar-EG")}
            </li>
          ))}
        </ul>
      ) : (
        <p className="status-line">لا يوجد سجل بعد.</p>
      )}
    </section>
  );
}

function BackupPanel({ role }: { role: Role | null }) {
  const [runs, setRuns] = useState<BackupRun[]>([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  const refresh = () => void listBackupRuns(10).then(setRuns);
  useEffect(refresh, []);

  const triggerBackup = async () => {
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch("/api/backup/run", { method: "POST" });
      if (!response.ok) throw new Error(await response.text());
      setMessage("تم بدء النسخ الاحتياطي.");
      refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "فشل النسخ الاحتياطي.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="panel wide">
      <div className="section-title">
        <Archive />
        <div>
          <h2>Backup &amp; Restore</h2>
          <p>نسخ احتياطي كامل لكل الجداول، ويُستخدم فقط عند فقدان البيانات - وليس بديلاً عن استعادة نسخة ملف (Section 15).</p>
        </div>
      </div>
      {can(role, "backup.run_manual") && (
        <button className="primary" disabled={busy} onClick={triggerBackup}>
          {busy ? "جارٍ التنفيذ..." : "Run backup now"}
        </button>
      )}
      {message && <p className="status-line">{message}</p>}
      {runs.length ? (
        <ul className="settings-list">
          {runs.map((run) => (
            <li key={run.id}>
              <Badge text={run.status} /> {run.destination} - {new Date(run.startedAt).toLocaleString("ar-EG")}
              {run.errorMessage ? ` - ${run.errorMessage}` : ""}
            </li>
          ))}
        </ul>
      ) : (
        <p className="status-line">لا يوجد نسخ احتياطي بعد.</p>
      )}
    </section>
  );
}

function HealthPanel() {
  const [components, setComponents] = useState<SystemHealthStatus[]>([]);

  useEffect(() => {
    void listHealthStatus().then(setComponents);
  }, []);

  return (
    <section className="panel wide">
      <div className="section-title">
        <Activity />
        <div>
          <h2>System Health</h2>
          <p>حالة كل مكوّن يعتمد على خدمة خارجية (OCR، النسخ الاحتياطي، الرفع).</p>
        </div>
      </div>
      {components.length ? (
        <ul className="settings-list">
          {components.map((item) => (
            <li key={item.component}>
              <Badge text={item.status} /> {item.component}
              {item.lastErrorMessage ? ` - ${item.lastErrorMessage}` : ""}
            </li>
          ))}
        </ul>
      ) : (
        <p className="status-line">لا توجد بيانات صحة النظام بعد.</p>
      )}
    </section>
  );
}
