import type { AuditLogEntry, Role } from "../../types";
import { supabase } from "../supabase/client";

// Section 14: append-only action log. RLS grants insert only - no
// update/delete policy exists at all, so no application code path (not even
// an Owner's) can alter or erase history. No-ops gracefully when Supabase
// isn't configured (local-fallback mode has no audit trail, same as it has
// no auth).
export const logAction = async (
  userId: string | null,
  userRole: Role | null,
  action: string,
  entityType: string,
  options?: { entityId?: string; previousValue?: unknown; newValue?: unknown; metadata?: Record<string, unknown> }
): Promise<void> => {
  if (!supabase || !userId || !userRole) return;
  const { error } = await supabase.from("audit_log").insert({
    user_id: userId,
    user_role: userRole,
    action,
    entity_type: entityType,
    entity_id: options?.entityId ?? null,
    previous_value: options?.previousValue ?? null,
    new_value: options?.newValue ?? null,
    metadata: options?.metadata ?? null
  });
  // Never throw from logging - a failed audit write must not block the
  // actual user-facing action it was describing.
  if (error) console.error("logAction failed", action, entityType, error.message);
};

const fromRow = (row: any): AuditLogEntry => ({
  id: row.id,
  userId: row.user_id,
  userRole: row.user_role,
  action: row.action,
  entityType: row.entity_type,
  entityId: row.entity_id,
  previousValue: row.previous_value,
  newValue: row.new_value,
  metadata: row.metadata,
  createdAt: row.created_at
});

export const listAuditLog = async (limit = 100): Promise<AuditLogEntry[]> => {
  if (!supabase) return [];
  const { data, error } = await supabase.from("audit_log").select("*").order("created_at", { ascending: false }).limit(limit);
  if (error) return [];
  return (data ?? []).map(fromRow);
};
