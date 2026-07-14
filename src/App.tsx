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
import type { AppData, Capability, DateRange, HomeAppData, PageKey, Profile, Workspace } from "./types";
import { makePeriodRange, today } from "./lib/date";
import { DateFilters } from "./lib/ui";
import { emptyData, getStorageMode, loadData, saveData, subscribeToDataChanges } from "./lib/supabase";
import { emptyHomeData, loadHomeData, subscribeToHomeDataChanges } from "./lib/supabase/homeStorage";
import { isAuthEnabled } from "./lib/auth";
import { useAuthGate } from "./lib/auth/useAuthGate";
import { can, effectiveRole, roleLabels } from "./lib/permissions";
import { workspaceConfig } from "./lib/workspaces";
import { LoginForm, SignOutButton } from "./features/auth";
import { NotificationBell } from "./features/notifications";
import { ForbiddenPage } from "./features/forbidden";
import { ComingSoonPage } from "./features/workspace";
import { SalesFolderPage } from "./features/sales-upload";
import { AdsFolderPage } from "./features/ads-upload";
import { DashboardPage } from "./features/dashboard";
import { SalesReportsPage } from "./features/sales-report";
import { PageReportPage } from "./features/page-report";
import { SettingsPage } from "./features/settings";
import { UsersPage } from "./features/users";
import { HomeSalesUploadPage } from "./features/home-sales-upload";
import { HomeDashboardPage } from "./features/home-dashboard";
import { HomeSalesReportPage } from "./features/home-sales-report";
import { HomePageReportPage } from "./features/home-page-report";

// Pages with a real Home implementation so far (Phase 2) - anything else
// (Ads Upload, Settings, and any future workspace entirely) falls back to
// ComingSoonPage. Never branch on a workspace name directly elsewhere.
const HOME_IMPLEMENTED_PAGES = new Set<PageKey>(["dashboard", "sales-upload", "sales-report", "page-report"]);

const navItems: Array<{ key: PageKey; label: string; icon: ReactNode; capability: Capability }> = [
  { key: "dashboard", label: "Home Dashboard", icon: <LayoutDashboard size={18} />, capability: "dashboard.view" },
  { key: "sales-upload", label: "Sales Upload", icon: <UploadCloud size={18} />, capability: "sales_upload.view" },
  { key: "ads-upload", label: "Ads Upload", icon: <FolderOpen size={18} />, capability: "ads_upload.view" },
  { key: "sales-report", label: "Sales Report", icon: <Users size={18} />, capability: "reports.view" },
  { key: "page-report", label: "Page Report", icon: <BarChart3 size={18} />, capability: "reports.view" },
  { key: "settings", label: "Settings", icon: <Settings size={18} />, capability: "settings.view" },
  { key: "users", label: "Users", icon: <UserCog size={18} />, capability: "users.view" }
];

// Section 20 (Multi-Workspace): this component is the shell for a single
// active workspace, mounted at /workspace/[workspace] once WorkspaceGuard
// has confirmed access. Cosmetics keeps every existing page unchanged;
// any other workspace (Home today, more later) shows the same sidebar/nav
// but a placeholder body per page - no workspace name is ever branched on
// directly, only `workspace === "cosmetics"` vs. not.
export default function DashboardApp({ workspace }: { workspace: Workspace }) {
  const [data, setData] = useState<AppData>(() => emptyData());
  const [homeData, setHomeData] = useState<HomeAppData>(() => emptyHomeData());
  const [page, setPage] = useState<PageKey>("dashboard");
  const [range, setRange] = useState<DateRange>({ from: today, to: today });
  const [periodMode, setPeriodMode] = useState<"day" | "week" | "month">("day");
  const [theme, setTheme] = useState<"dark" | "light">("dark");
  const { profile, authChecked, authError, setProfile } = useAuthGate();
  const isCosmetics = workspace === "cosmetics";
  const isHome = workspace === "home";

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

  // Home's own dataset - entirely separate load/subscribe from Cosmetics'
  // above, only fetched when this instance is actually the Home workspace.
  useEffect(() => {
    if (!isHome) return;
    void loadHomeData().then(setHomeData);
    return subscribeToHomeDataChanges(() => void loadHomeData().then(setHomeData));
  }, [isHome]);

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
          <div className="brand-mark">
            <img src="/company-logo.svg" alt="Regenix Dermal" style={{ width: "100%", height: "100%", objectFit: "contain", display: "block" }} />
          </div>
          <div>
            <strong>تقارير البيع</strong>
            <small>Sales + Ads BI - {workspaceConfig(workspace).emoji} {workspaceConfig(workspace).label}</small>
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
        {/* Users management is cross-workspace (an Owner assigns workspaces
            from any one). Cosmetics keeps every real page as before. Home
            (Phase 2) gets real Dashboard/Sales Upload/Sales Report/Page
            Report over its own data; Ads Upload/Settings and any future
            workspace's unbuilt pages fall back to the same placeholder. */}
        {hasPageAccess && page === "users" && <UsersPage currentUserId={profile?.id ?? null} />}
        {hasPageAccess && isCosmetics && page === "dashboard" && <DashboardPage data={data} range={range} />}
        {hasPageAccess && isCosmetics && page === "sales-upload" && <SalesFolderPage data={data} setData={setData} />}
        {hasPageAccess && isCosmetics && page === "ads-upload" && <AdsFolderPage data={data} setData={setData} />}
        {hasPageAccess && isCosmetics && page === "sales-report" && <SalesReportsPage data={data} range={range} setRange={setRange} />}
        {hasPageAccess && isCosmetics && page === "page-report" && <PageReportPage data={data} range={range} setRange={setRange} />}
        {hasPageAccess && isCosmetics && page === "settings" && <SettingsPage data={data} commitData={commitData} profile={profile} />}
        {hasPageAccess && isHome && page === "dashboard" && <HomeDashboardPage data={homeData} range={range} />}
        {hasPageAccess && isHome && page === "sales-upload" && <HomeSalesUploadPage data={homeData} setData={setHomeData} />}
        {hasPageAccess && isHome && page === "sales-report" && <HomeSalesReportPage data={homeData} range={range} setRange={setRange} />}
        {hasPageAccess && isHome && page === "page-report" && <HomePageReportPage data={homeData} range={range} setRange={setRange} />}
        {hasPageAccess &&
          page !== "users" &&
          !isCosmetics &&
          !(isHome && HOME_IMPLEMENTED_PAGES.has(page)) && <ComingSoonPage pageLabel={activeNavItem?.label ?? page} workspace={workspace} />}
      </main>
    </div>
  );
}