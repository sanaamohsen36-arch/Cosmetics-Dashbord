"use client";

import { Settings as SettingsIcon } from "lucide-react";
import type { HomeAppData } from "../../types";
import { getEffectiveHomePageNames } from "../../lib/homeMetrics";

// Phase 3 (Home Settings). Scoped entirely to workspace=home data - no
// Cosmetics Brands ever appear here. Home's Pages/Salespeople/Team Types are
// derived from Home Sales uploads (same additive, no-manual-management model
// Home Sales Upload already uses), so this is read-only, mirroring the
// Cosmetics Settings page's Brands panel.
export function HomeSettingsPage({ data }: { data: HomeAppData }) {
  const pages = getEffectiveHomePageNames(data);
  const salespeople = [...new Set(data.salespeople.map((row) => row.salespersonName).filter(Boolean))].sort();
  const teamTypes = [...new Set(data.salespeople.map((row) => row.teamType).filter(Boolean))].sort();

  return (
    <div className="content-grid">
      <section className="panel">
        <div className="section-title">
          <SettingsIcon />
          <div>
            <h2>Home Settings</h2>
            <p>تُقرأ Pages/Salespeople/Team Types تلقائيًا من رفعات Home Sales - لا توجد إدارة يدوية، ولا تظهر Brands الخاصة بـ Cosmetics هنا.</p>
          </div>
        </div>
      </section>
      <section className="panel">
        <h2>Pages</h2>
        <ul className="settings-list">{pages.map((name) => <li key={name}>{name}</li>)}</ul>
      </section>
      <section className="panel">
        <h2>Salespeople</h2>
        <ul className="settings-list">{salespeople.map((name) => <li key={name}>{name}</li>)}</ul>
      </section>
      <section className="panel">
        <h2>Team Types</h2>
        <ul className="settings-list">{teamTypes.map((name) => <li key={name}>{name}</li>)}</ul>
      </section>
    </div>
  );
}
