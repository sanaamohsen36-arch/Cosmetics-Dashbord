"use client";

import { useEffect, useState } from "react";
import type { ReactNode } from "react";
import {
  BarChart3,
  FolderOpen,
  LayoutDashboard,
  Settings,
  UploadCloud,
  UserCircle,
  UserCog,
  Users
} from "lucide-react";
import type { AppData, Capability, DateRange, PageKey, Profile } from "./types";
import { makePeriodRange, today } from "./lib/date";
import { DateFilters } from "./lib/ui";
import { emptyData, getStorageMode, loadData, saveData, subscribeToDataChanges } from "./lib/supabase";
import { isAuthEnabled, getCurrentProfile, onAuthStateChange } from "./lib/auth";
import { can, effectiveRole, roleLabels } from "./lib/permissions";
import { LoginForm, SignOutButton } from "./features/auth";
import { NotificationBell } from "./features/notifications";
import { ForbiddenPage } from "./features/forbidden";
import { SalesFolderPage } from "./features/sales-upload";
import { AdsFolderPage } from "./features/ads-upload";
import { DashboardPage } from "./features/dashboard";
import { SalesReportsPage } from "./features/sales-report";
import { PageReportPage } from "./features/page-report";
import { SettingsPage } from "./features/settings";
import { UsersPage } from "./features/users";

const navItems: Array<{ key: PageKey; label: string; icon: ReactNode; capability: Capability }> = [
  { key: "dashboard", label: "Home Dashboard", icon: <LayoutDashboard size={18} />, capability: "dashboard.view" },
  { key: "sales-upload", label: "Sales Upload", icon: <UploadCloud size={18} />, capability: "sales_upload.view" },
  { key: "ads-upload", label: "Ads Upload", icon: <FolderOpen size={18} />, capability: "ads_upload.view" },
  { key: "sales-report", label: "Sales Report", icon: <Users size={18} />, capability: "reports.view" },
  { key: "page-report", label: "Page Report", icon: <BarChart3 size={18} />, capability: "reports.view" },
  { key: "settings", label: "Settings", icon: <Settings size={18} />, capability: "settings.view" },
  { key: "users", label: "Users", icon: <UserCog size={18} />, capability: "users.view" }
];

export default function DashboardApp() {
  const [data, setData] = useState<AppData>(() => emptyData());
  const [page, setPage] = useState<PageKey>("dashboard");
  const [range, setRange] = useState<DateRange>({ from: today, to: today });
  const [periodMode, setPeriodMode] = useState<"day" | "week" | "month">("day");
  const [theme, setTheme] = useState<"dark" | "light">("dark");
  const [profile, setProfile] = useState<Profile | null>(null);
  const [authChecked, setAuthChecked] = useState(!isAuthEnabled);
  const [authError, setAuthError] = useState("");

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem("dashboard-theme", theme);
  }, [theme]);

  useEffect(() => {
    const savedTheme = localStorage.getItem("dashboard-theme");
    if (savedTheme === "light" || savedTheme === "dark") setTheme(savedTheme);
    void loadData().then(setData);
    return subscribeToDataChanges(() => void loadData().then(setData));
  }, []);

  useEffect(() => {
    if (!isAuthEnabled) return;
    const loadProfile = () =>
      getCurrentProfile()
        .then((current) => {
          setProfile(current);
          setAuthError("");
        })
        .catch((error) => setAuthError(error instanceof Error ? error.message : String(error)))
        .finally(() => setAuthChecked(true));

    void loadProfile();
    // Single source of truth for post-login profile fetch - avoids racing
    // with LoginForm's own onSignedIn callback, which used to fetch too and
    // could hit a unique-violation on the profiles insert.
    return onAuthStateChange((userId) => {
      if (!userId) {
        setProfile(null);
        return;
      }
      void loadProfile();
    });
  }, []);

  if (isAuthEnabled && !authChecked) return null;
  if (isAuthEnabled && !profile) {
    return <LoginForm errorMessage={authError} onSignedIn={() => undefined} />;
  }

  const commitData = async (next: AppData) => {
    setData(next);
    await saveData(next);
  };

  // Real access boundary: computed once per render, used both to hide
  // sidebar entries (convenience) and to gate what actually renders below
  // (the boundary that matters - visiting a hidden page still hits this).
  const role = effectiveRole(profile, isAuthEnabled);
  const visibleNavItems = navItems.filter((item) => can(role, item.capability));
  const activeNavItem = navItems.find((item) => item.key === page);
  const hasPageAccess = activeNavItem ? can(role, activeNavItem.capability) : false;

  return (
    <div className={`app-shell ${theme}`} dir="rtl">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-mark">DR</div>
          <div>
            <strong>تقارير البيع</strong>
            <small>Sales + Ads BI</small>
          </div>
        </div>
        <nav>
          {visibleNavItems.map((item) => (
            <button key={item.key} className={page === item.key ? "active" : ""} onClick={() => setPage(item.key)}>
              {item.icon}
              {item.label}
            </button>
          ))}
        </nav>
        <div className="admin-box">
          <UserCircle size={20} />
          <span>{profile ? `${profile.displayName} - ${roleLabels[profile.role]}` : "Admin"}</span>
          {isAuthEnabled && profile && <SignOutButton onSignedOut={() => setProfile(null)} />}
          <button className="theme-toggle" onClick={() => setTheme(theme === "dark" ? "light" : "dark")}>
            {theme === "dark" ? "Light" : "Dark"}
          </button>
        </div>
      </aside>

      <main className="main">
        <header className="topbar">
          <div>
            <p className="eyebrow">{getStorageMode()} Live</p>
            <h1>{activeNavItem?.label}</h1>
            <p className="sync-status">متصل بقاعدة البيانات، وأي حفظ جديد ينعكس على اللوحة.</p>
          </div>
          <div className="topbar-actions">
            <NotificationBell userId={profile?.id ?? null} />
            {page === "dashboard" && (
              <DateFilters range={range} mode={periodMode} onRangeChange={setRange} onModeChange={(mode) => {
                setPeriodMode(mode);
                setRange(makePeriodRange(range.from, mode));
              }} />
            )}
          </div>
        </header>

        {!hasPageAccess && <ForbiddenPage pageLabel={activeNavItem?.label ?? page} />}
        {hasPageAccess && page === "dashboard" && <DashboardPage data={data} range={range} />}
        {hasPageAccess && page === "sales-upload" && <SalesFolderPage data={data} setData={setData} />}
        {hasPageAccess && page === "ads-upload" && <AdsFolderPage data={data} setData={setData} />}
        {hasPageAccess && page === "sales-report" && <SalesReportsPage data={data} range={range} setRange={setRange} />}
        {hasPageAccess && page === "page-report" && <PageReportPage data={data} range={range} setRange={setRange} />}
        {hasPageAccess && page === "settings" && <SettingsPage data={data} commitData={commitData} profile={profile} />}
        {hasPageAccess && page === "users" && <UsersPage currentUserId={profile?.id ?? null} />}
      </main>
    </div>
  );
}
