"use client";

import { useState } from "react";
import { Lock } from "lucide-react";
import type { AppData } from "../../types";
import { createId } from "../../lib/supabase";
import { Badge } from "../../lib/ui";

// Matches docs/ARCHITECTURE.md section 13 (User Roles & Permissions).
// Display only - no auth, no capability enforcement, nothing here changes
// what any user can currently do. Do not wire this to real access control
// until Supabase Auth + RLS (section 13) is actually implemented.
const plannedRoles = ["Owner", "Marketing Manager", "Media Buyer", "Sales Manager", "Data Entry", "Viewer"];

export function SettingsPage({ data, commitData }: { data: AppData; commitData: (data: AppData) => Promise<void> }) {
  const [platformName, setPlatformName] = useState("");
  const [salespersonName, setSalespersonName] = useState("");
  const [salespersonCode, setSalespersonCode] = useState("");

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
      <section className="panel wide">
        <div className="section-title">
          <Lock />
          <div>
            <h2>Roles &amp; Permissions</h2>
            <p>
              مخطط له في معمارية النظام وغير مفعّل بعد. كل من يفتح هذا الرابط لديه صلاحية كاملة حاليًا
              (Admin) - لا يوجد تسجيل دخول أو صلاحيات فعلية حتى الآن.
            </p>
          </div>
        </div>
        <div className="role-placeholder-grid">
          {plannedRoles.map((role) => (
            <div key={role} className="role-placeholder-card">
              <strong>{role}</strong>
              <Badge text="Planned - not active" />
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
