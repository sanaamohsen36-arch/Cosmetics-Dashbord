import type { SystemHealthStatus } from "../../types";
import { supabase } from "../supabase/client";

// Section 17: current-status row per monitored component (upsert, not an
// append-only log - audit_log/notifications already cover history). A
// transition to "down"/"degraded" is the trigger notify() (lib/notifications)
// uses to raise an alert, so the two systems don't separately detect the
// same failure.
export const reportHealth = async (component: string, status: SystemHealthStatus["status"], errorMessage?: string): Promise<void> => {
  if (!supabase) return;
  const now = new Date().toISOString();
  const patch: Record<string, unknown> = { component, status, updated_at: now };
  if (status === "ok") patch.last_success_at = now;
  else patch.last_failure_at = now;
  if (errorMessage) patch.last_error_message = errorMessage;

  const { error } = await supabase.from("system_health_status").upsert(patch, { onConflict: "component" });
  if (error) console.error("reportHealth failed", component, error.message);
};

const fromRow = (row: any): SystemHealthStatus => ({
  component: row.component,
  status: row.status,
  lastSuccessAt: row.last_success_at,
  lastFailureAt: row.last_failure_at,
  lastErrorMessage: row.last_error_message,
  updatedAt: row.updated_at
});

export const listHealthStatus = async (): Promise<SystemHealthStatus[]> => {
  if (!supabase) return [];
  const { data, error } = await supabase.from("system_health_status").select("*");
  if (error) return [];
  return (data ?? []).map(fromRow);
};
