"use client";

import { createContext, useContext, useEffect } from "react";
import type { ReactNode } from "react";
import { useRouter } from "next/navigation";
import type { Workspace } from "../../types";
import { isAuthEnabled } from "../../lib/auth";
import { useAuthGate } from "../../lib/auth/useAuthGate";
import { effectiveRole } from "../../lib/permissions";
import { availableWorkspaces, canAccessWorkspace, workspaceConfig } from "../../lib/workspaces";
import { LoginForm } from "../auth";
import { ForbiddenPage } from "../forbidden";

// Section 20 (Multi-Workspace). The active workspace, available globally to
// any component via useWorkspace() - never prop-drilled.
const WorkspaceContext = createContext<Workspace | null>(null);

export function WorkspaceProvider({ workspace, children }: { workspace: Workspace; children: ReactNode }) {
  return <WorkspaceContext.Provider value={workspace}>{children}</WorkspaceContext.Provider>;
}

export function useWorkspace(): Workspace {
  const workspace = useContext(WorkspaceContext);
  if (!workspace) throw new Error("useWorkspace must be used within a WorkspaceProvider");
  return workspace;
}

// The real access boundary for /workspace/[workspace]: owner passes for
// every workspace, everyone else only for their own assigned one - anything
// else renders the same 403 page App.tsx already uses for capability
// violations, never just a hidden link.
export function WorkspaceGuard({ workspace, children }: { workspace: Workspace; children: ReactNode }) {
  const { profile, authChecked, authError } = useAuthGate();

  if (isAuthEnabled && !authChecked) return null;
  if (isAuthEnabled && !profile) return <LoginForm errorMessage={authError} onSignedIn={() => undefined} />;

  const role = effectiveRole(profile, isAuthEnabled);
  if (!canAccessWorkspace(role, profile?.workspace, workspace)) {
    return <ForbiddenPage pageLabel={`${workspaceConfig(workspace).label} workspace`} />;
  }

  return <WorkspaceProvider workspace={workspace}>{children}</WorkspaceProvider>;
}

// Post-login landing screen - shown instead of jumping straight into a
// dashboard. Owner ALWAYS sees this screen and picks a workspace manually,
// every time, with no auto-navigation - never assume which one they want.
// A non-owner has exactly one available workspace, so there is nothing to
// choose: they are sent straight there instead of clicking their only card.
export function WorkspaceSelector() {
  const { profile, authChecked, authError } = useAuthGate();
  const router = useRouter();
  const role = effectiveRole(profile, isAuthEnabled);
  const options = availableWorkspaces(role, profile?.workspace);
  const isOwner = role === "owner";

  useEffect(() => {
    if (isAuthEnabled && !authChecked) return;
    if (isAuthEnabled && !profile) return;
    if (!isOwner && options.length === 1) router.replace(`/workspace/${options[0].key}`);
  }, [authChecked, profile, isOwner, options, router]);

  if (isAuthEnabled && !authChecked) return null;
  if (isAuthEnabled && !profile) return <LoginForm errorMessage={authError} onSignedIn={() => undefined} />;
  if (!isOwner && options.length === 1) return null;

  return (
    <div className="app-shell dark" dir="rtl">
      <main className="main workspace-select-shell">
        <div className="workspace-select-stack">
          <h1>اختاري مساحة العمل</h1>
          <p className="sync-status">Choose a workspace to continue</p>
          <div className="workspace-card-grid">
            {options.map((item) => (
              <button key={item.key} className="workspace-card" onClick={() => router.push(`/workspace/${item.key}`)}>
                <span className="workspace-card-emoji">{item.emoji}</span>
                <strong>{item.label}</strong>
              </button>
            ))}
          </div>
        </div>
      </main>
    </div>
  );
}

// Phase 1 placeholder body for any workspace besides Cosmetics - same
// sidebar/nav/layout as every real page (rendered by App.tsx in place of
// the real page component), no upload/report logic implemented yet.
export function ComingSoonPage({ pageLabel, workspace }: { pageLabel: string; workspace: Workspace }) {
  const config = workspaceConfig(workspace);
  return (
    <div className="dashboard-stack">
      <section className="panel">
        <div className="section-title">
          <span style={{ fontSize: 28, lineHeight: 1 }}>{config.emoji}</span>
          <div>
            <h2>{config.label} - {pageLabel}</h2>
            <p>سيتم تفعيل هذه الصفحة لمساحة {config.label} في المرحلة القادمة.</p>
          </div>
        </div>
      </section>
    </div>
  );
}
