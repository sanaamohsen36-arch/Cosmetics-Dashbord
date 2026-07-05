import type { BackupRun } from "../../types";
import { supabase } from "../supabase/client";
import { exportAllTablesForBackup, restoreTablesFromBackup } from "../supabase/storage";
import { reportHealth } from "../health";
import { notify } from "../notifications";
import type { BackupDestination } from "./types";
import { SupabaseStorageDestination } from "./supabaseStorageDestination";

export type { BackupDestination, BackupObjectMeta } from "./types";

// Mirrors getOcrProvider() (lib/ocr/index.ts). Adding Google Drive/S3/GCS
// later is one new file implementing BackupDestination + one case here.
export const getBackupDestination = (): BackupDestination => {
  const id = (process.env.BACKUP_STORAGE_PROVIDER || "supabase-storage").toLowerCase();
  switch (id) {
    case "supabase-storage":
      return new SupabaseStorageDestination();
    default:
      throw new Error(`Unknown BACKUP_STORAGE_PROVIDER "${id}".`);
  }
};

const recordBackupRun = async (run: Partial<BackupRun> & { id: string }) => {
  if (!supabase) return;
  await supabase.from("backup_runs").upsert({
    id: run.id,
    started_at: run.startedAt,
    completed_at: run.completedAt ?? null,
    status: run.status,
    destination: run.destination,
    location_ref: run.locationRef ?? null,
    table_row_counts: run.tableRowCounts ?? null,
    file_count: run.fileCount ?? 0,
    triggered_by: run.triggeredBy,
    error_message: run.errorMessage ?? null
  });
};

export const runBackup = async (triggeredBy: string): Promise<BackupRun> => {
  const id = crypto.randomUUID();
  const startedAt = new Date().toISOString();
  const destination = getBackupDestination();

  try {
    const snapshot = await exportAllTablesForBackup();
    const tableRowCounts = Object.fromEntries(Object.entries(snapshot).map(([table, rows]) => [table, rows.length]));
    const body = Buffer.from(JSON.stringify(snapshot), "utf-8");
    const objectKey = `snapshots/${startedAt.replace(/[:.]/g, "-")}.json`;
    const { locationRef } = await destination.upload(objectKey, body, "application/json");

    const completedAt = new Date().toISOString();
    const run: BackupRun = {
      id,
      startedAt,
      completedAt,
      status: "success",
      destination: destination.id,
      locationRef,
      tableRowCounts,
      fileCount: 0,
      triggeredBy
    };
    await recordBackupRun(run);
    await reportHealth("backup", "ok");
    return run;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const run: BackupRun = {
      id,
      startedAt,
      completedAt: new Date().toISOString(),
      status: "failed",
      destination: destination.id,
      triggeredBy,
      errorMessage: message
    };
    await recordBackupRun(run);
    await reportHealth("backup", "down", message);
    await notify("backup", "critical", "Daily backup failed", message);
    throw error;
  }
};

// Owner-gated, disaster-recovery only (docs/ARCHITECTURE.md section 16).
// Routine "I made a mistake" recovery is file versioning (section 15),
// self-service - this is for a lost/corrupted project or a bad migration.
export const restoreBackup = async (locationRef: string, restoredBy: string): Promise<void> => {
  const destination = getBackupDestination();
  const buffer = await destination.download(locationRef);
  const snapshot = JSON.parse(buffer.toString("utf-8")) as Record<string, unknown[]>;
  await restoreTablesFromBackup(snapshot);
  await notify("system", "warning", "Database restored from backup", `Restored ${locationRef} by ${restoredBy}`);
};

export const listBackupRuns = async (limit = 20): Promise<BackupRun[]> => {
  if (!supabase) return [];
  const { data, error } = await supabase.from("backup_runs").select("*").order("started_at", { ascending: false }).limit(limit);
  if (error) return [];
  return (data ?? []).map((row: any) => ({
    id: row.id,
    startedAt: row.started_at,
    completedAt: row.completed_at,
    status: row.status,
    destination: row.destination,
    locationRef: row.location_ref,
    tableRowCounts: row.table_row_counts,
    fileCount: row.file_count,
    triggeredBy: row.triggered_by,
    errorMessage: row.error_message
  }));
};
