import type { Capability, Profile, Role } from "../../types";

// Section 13 of docs/ARCHITECTURE.md. Proposed defaults - confirm/adjust with
// the Owner before treating this as final; this is the one source of truth
// for what each role can do, referenced by UI (hide/disable, convenience
// only) and meant to be mirrored by RLS policies (the real boundary).
//
// "*.view" capabilities gate whether a page is reachable at all (checked in
// App.tsx before a page renders - unauthorized shows Forbidden, not just a
// hidden button); the rest gate specific actions within a page a user can
// already view.
export const ROLE_CAPABILITIES: Record<Role, Capability[]> = {
  owner: [
    "dashboard.view",
    "sales_upload.view",
    "sales_upload.upload",
    "sales_upload.replace",
    "sales_upload.delete_current",
    "sales_upload.purge_version",
    "ads_upload.view",
    "ads_upload.upload",
    "ads_upload.delete",
    "ads_upload.purge_version",
    "preview.edit",
    "mapping_memory.edit",
    "settings.view",
    "settings.manage_master_data",
    "settings.manage_users",
    "users.view",
    "users.manage",
    "reports.view",
    "audit_log.view",
    "file_versions.view",
    "file_versions.restore",
    "backup.run_manual",
    "backup.restore",
    "backup.view_history",
    "system_health.view",
    "notifications.view"
  ],
  // Full operational control, same as Owner, except user management - the
  // Users page and account-management actions stay Owner-exclusive.
  admin: [
    "dashboard.view",
    "sales_upload.view",
    "sales_upload.upload",
    "sales_upload.replace",
    "sales_upload.delete_current",
    "sales_upload.purge_version",
    "ads_upload.view",
    "ads_upload.upload",
    "ads_upload.delete",
    "ads_upload.purge_version",
    "preview.edit",
    "mapping_memory.edit",
    "settings.view",
    "settings.manage_master_data",
    "reports.view",
    "audit_log.view",
    "file_versions.view",
    "file_versions.restore",
    "backup.run_manual",
    "backup.restore",
    "backup.view_history",
    "system_health.view",
    "notifications.view"
  ],
  marketing_manager: [
    "dashboard.view",
    "ads_upload.view",
    "ads_upload.upload",
    "ads_upload.delete",
    "preview.edit",
    "mapping_memory.edit",
    "settings.view",
    "settings.manage_master_data",
    "reports.view",
    "audit_log.view",
    "file_versions.view",
    "backup.view_history",
    "system_health.view",
    "notifications.view"
  ],
  media_buyer: [
    "dashboard.view",
    "ads_upload.view",
    "ads_upload.upload",
    "preview.edit",
    "mapping_memory.edit",
    "reports.view",
    "file_versions.view"
  ],
  sales_manager: [
    "dashboard.view",
    "sales_upload.view",
    "sales_upload.upload",
    "sales_upload.replace",
    "sales_upload.delete_current",
    "preview.edit",
    "mapping_memory.edit",
    "settings.view",
    "settings.manage_master_data",
    "reports.view",
    "file_versions.view"
  ],
  data_entry: ["dashboard.view", "sales_upload.view", "sales_upload.upload", "preview.edit", "mapping_memory.edit", "reports.view"],
  viewer: ["dashboard.view", "reports.view"]
};

export const can = (role: Role | null | undefined, capability: Capability): boolean =>
  Boolean(role && ROLE_CAPABILITIES[role]?.includes(capability));

// Local-fallback mode (no Supabase Auth configured) has no login at all, so
// every visitor keeps full access - same convention as every other
// Supabase-only feature in this codebase. Once auth is enabled, the real
// profile role applies.
export const effectiveRole = (profile: Profile | null, authEnabled: boolean): Role | null =>
  authEnabled ? profile?.role ?? null : "owner";

export const roleLabels: Record<Role, string> = {
  owner: "Owner",
  admin: "Admin",
  marketing_manager: "Marketing Manager",
  media_buyer: "Media Buyer",
  sales_manager: "Sales Manager",
  data_entry: "Data Entry",
  viewer: "Viewer"
};

export const allRoles: Role[] = ["owner", "admin", "marketing_manager", "media_buyer", "sales_manager", "data_entry", "viewer"];
