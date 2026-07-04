"use client";

import { useState } from "react";
import type { AppData } from "../../types";
import { createId } from "../../lib/supabase";

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
    </div>
  );
}
