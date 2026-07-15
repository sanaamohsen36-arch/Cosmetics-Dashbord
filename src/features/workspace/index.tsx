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
  if (!canAccessWorkspace(role, profile?.workspaces, workspace)) {
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
  const options = availableWorkspaces(role, profile?.workspaces);
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
    <div className="app-shell dark workspace-select-page" dir="rtl">
      <main className="main workspace-select-shell">
        <section className="workspace-select-stack" aria-labelledby="workspace-select-title">
          <div className="workspace-select-heading">
            <span className="workspace-select-kicker">Sales + Ads BI</span>
            <h1 id="workspace-select-title">Choose your workspace</h1>
            <p className="workspace-select-subtitle">اختاري مساحة العمل المناسبة للمتابعة إلى لوحة التحكم.</p>
          </div>
          <div className="workspace-card-grid">
            {options.map((item) => (
              <button key={item.key} className="workspace-card" onClick={() => router.push(`/workspace/${item.key}`)}>
                <span className="workspace-card-emoji">{item.emoji}</span>
                <span className="workspace-card-copy">
                  <strong>{item.label}</strong>
                  <small>Open workspace</small>
                </span>
                <span className="workspace-card-arrow" aria-hidden="true">←</span>
              </button>
            ))}
          </div>
        </section>
      </main>
      <style>{`
        .workspace-select-page {
          grid-template-columns: 1fr;
          min-height: 100vh;
          background:
            radial-gradient(circle at 50% 12%, rgba(56, 189, 248, 0.18), transparent 30rem),
            radial-gradient(circle at 12% 85%, rgba(37, 99, 235, 0.16), transparent 26rem),
            linear-gradient(135deg, #06101d 0%, #0b1630 48%, #071018 100%);
        }

        .workspace-select-page .main {
          background: transparent;
          padding: 32px;
        }

        .workspace-select-shell {
          display: grid;
          place-items: center;
          min-height: 100vh;
          width: 100%;
        }

        .workspace-select-stack {
          width: min(920px, 94vw);
          display: grid;
          gap: 34px;
          text-align: center;
          animation: workspaceFadeIn 0.55s ease both;
        }

        .workspace-select-heading {
          display: grid;
          justify-items: center;
          gap: 10px;
        }

        .workspace-select-kicker {
          border: 1px solid rgba(96, 165, 250, 0.28);
          border-radius: 999px;
          background: rgba(15, 23, 42, 0.58);
          color: #93c5fd;
          padding: 8px 14px;
          font-size: 12px;
          font-weight: 900;
          letter-spacing: 0;
        }

        .workspace-select-stack h1 {
          font-size: clamp(34px, 5vw, 56px);
          line-height: 1.05;
          margin: 0;
          color: #f8fafc;
          letter-spacing: 0;
        }

        .workspace-select-subtitle {
          max-width: 560px;
          margin: 0;
          color: #b6c6dc;
          font-size: clamp(15px, 2vw, 18px);
          line-height: 1.7;
        }

        .workspace-card-grid {
          display: grid;
          grid-template-columns: repeat(2, minmax(260px, 1fr));
          gap: 22px;
          margin-top: 0;
        }

        .workspace-card {
          position: relative;
          overflow: hidden;
          min-height: 220px;
          border: 1px solid rgba(148, 163, 184, 0.18);
          border-radius: 28px;
          background:
            linear-gradient(145deg, rgba(15, 23, 42, 0.88), rgba(13, 33, 62, 0.7)),
            radial-gradient(circle at 20% 15%, rgba(56, 189, 248, 0.18), transparent 18rem);
          backdrop-filter: blur(18px);
          padding: 34px;
          display: grid;
          grid-template-rows: auto 1fr auto;
          gap: 18px;
          justify-items: center;
          align-items: center;
          color: #e2e8f0;
          font-size: 20px;
          font-weight: 800;
          box-shadow: 0 24px 70px rgba(0, 0, 0, 0.28);
          transition: transform 0.22s ease, border-color 0.22s ease, box-shadow 0.22s ease, background 0.22s ease;
        }

        .workspace-card::before {
          content: "";
          position: absolute;
          inset: 1px;
          border-radius: 27px;
          background: linear-gradient(135deg, rgba(255, 255, 255, 0.12), transparent 38%);
          pointer-events: none;
        }

        .workspace-card:hover {
          transform: translateY(-8px) scale(1.025);
          border-color: rgba(56, 189, 248, 0.72);
          box-shadow: 0 32px 86px rgba(14, 165, 233, 0.24);
        }

        .workspace-card-emoji {
          position: relative;
          z-index: 1;
          width: 78px;
          height: 78px;
          border-radius: 24px;
          display: grid;
          place-items: center;
          background: linear-gradient(135deg, rgba(37, 99, 235, 0.26), rgba(14, 165, 233, 0.18));
          border: 1px solid rgba(125, 211, 252, 0.24);
          font-size: 42px;
          line-height: 1;
        }

        .workspace-card-copy {
          position: relative;
          z-index: 1;
          display: grid;
          gap: 8px;
        }

        .workspace-card-copy strong {
          color: #f8fafc;
          font-size: clamp(24px, 3vw, 32px);
          line-height: 1.1;
        }

        .workspace-card-copy small {
          color: #93c5fd;
          font-size: 13px;
          font-weight: 800;
        }

        .workspace-card-arrow {
          position: relative;
          z-index: 1;
          width: 38px;
          height: 38px;
          border-radius: 999px;
          display: grid;
          place-items: center;
          background: rgba(56, 189, 248, 0.14);
          color: #bfdbfe;
          border: 1px solid rgba(125, 211, 252, 0.22);
          transition: transform 0.22s ease, background 0.22s ease;
        }

        .workspace-card:hover .workspace-card-arrow {
          transform: translateX(-4px);
          background: rgba(56, 189, 248, 0.22);
        }

        @keyframes workspaceFadeIn {
          from {
            opacity: 0;
            transform: translateY(16px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }

        @media (max-width: 760px) {
          .workspace-select-page .main {
            padding: 20px;
          }

          .workspace-card-grid {
            grid-template-columns: 1fr;
          }

          .workspace-card {
            min-height: 190px;
            padding: 28px 22px;
          }
        }
      `}</style>
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
