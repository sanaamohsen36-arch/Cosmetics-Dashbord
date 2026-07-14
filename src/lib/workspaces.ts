import type { Role, Workspace } from "../types";

// Section 20 (Multi-Workspace). Single source of truth for what workspaces
// exist - adding a future workspace (Real Estate, Clinics, ...) is one new
// entry here plus a database record, never a rewrite of routing/pages.
export interface WorkspaceConfig {
  key: Workspace;
  label: string;
  emoji: string;
}

export const WORKSPACES: WorkspaceConfig[] = [
  { key: "cosmetics", label: "Cosmetics", emoji: "💄" },
  { key: "home", label: "Home", emoji: "🏠" }
];

export const isValidWorkspace = (value: string | undefined | null): value is Workspace =>
  WORKSPACES.some((item) => item.key === value);

export const workspaceConfig = (key: Workspace): WorkspaceConfig =>
  WORKSPACES.find((item) => item.key === key) ?? WORKSPACES[0];

// Owner bypasses the workspace assignment entirely; everyone else may only
// enter the single workspace their profile belongs to. Never hardcode
// "cosmetics"/"home" in a check - always compare against this.
export const canAccessWorkspace = (role: Role | null, profileWorkspace: Workspace | null | undefined, workspace: Workspace): boolean =>
  role === "owner" || profileWorkspace === workspace;

// Workspaces a given profile may open the selector for - owner gets every
// configured workspace, everyone else gets only their assigned one.
export const availableWorkspaces = (role: Role | null, profileWorkspace: Workspace | null | undefined): WorkspaceConfig[] =>
  role === "owner" ? WORKSPACES : WORKSPACES.filter((item) => item.key === profileWorkspace);
