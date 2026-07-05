import type { Capability, Role } from "../../types";

// Section 13 of docs/ARCHITECTURE.md. Proposed defaults - confirm/adjust with
// the Owner before treating this as final; this is the one source of truth
// for what each role can do, referenced by UI (hide/disable, convenience
// only) and meant to be mirrored by RLS policies (the real boundary).
export const ROLE_CAPABILITIES: Record<Role, Capability[]> = {
  owner: [
    "sales_upload.upload",
    "sales_upload.replace",
    "sales_upload.delete_current",
    "sales_upload.purge_version",
    "ads_upload.upload",
    "ads_upload.delete",
    "ads_upload.purge_version",
    "preview.edit",
    "mapping_memory.edit",
    "settings.manage_master_data",
    "settings.manage_users",
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
    "ads_upload.upload",
    "ads_upload.delete",
    "preview.edit",
    "mapping_memory.edit",
    "settings.manage_master_data",
    "reports.view",
    "audit_log.view",
    "file_versions.view",
    "backup.view_history",
    "system_health.view",
    "notifications.view"
  ],
  media_buyer: ["ads_upload.upload", "preview.edit", "mapping_memory.edit", "reports.view", "file_versions.view"],
  sales_manager: [
    "sales_upload.upload",
    "sales_upload.replace",
    "sales_upload.delete_current",
    "preview.edit",
    "mapping_memory.edit",
    "settings.manage_master_data",
    "reports.view",
    "file_versions.view"
  ],
  data_entry: ["sales_upload.upload", "preview.edit", "mapping_memory.edit", "reports.view"],
  viewer: ["reports.view"]
};

export const can = (role: Role | null | undefined, capability: Capability): boolean =>
  Boolean(role && ROLE_CAPABILITIES[role]?.includes(capability));

export const roleLabels: Record<Role, string> = {
  owner: "Owner",
  marketing_manager: "Marketing Manager",
  media_buyer: "Media Buyer",
  sales_manager: "Sales Manager",
  data_entry: "Data Entry",
  viewer: "Viewer"
};
