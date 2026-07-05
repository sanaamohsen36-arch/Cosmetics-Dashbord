import type { BackupDestination, BackupObjectMeta } from "./types";
import { supabase } from "../supabase/client";

const BUCKET = process.env.BACKUP_BUCKET || "dashboard-backups";

// Primary implementation - no new vendor needed to satisfy "should work with
// Supabase". A second destination (Google Drive, S3, GCS) can be added later
// as a true off-project redundant copy by implementing the same interface.
export class SupabaseStorageDestination implements BackupDestination {
  readonly id = "supabase-storage";

  async upload(objectKey: string, data: Buffer, contentType: string): Promise<{ locationRef: string }> {
    if (!supabase) throw new Error("Supabase is not configured.");
    const { error } = await supabase.storage.from(BUCKET).upload(objectKey, data, { contentType, upsert: true });
    if (error) throw error;
    return { locationRef: objectKey };
  }

  async list(prefix: string): Promise<BackupObjectMeta[]> {
    if (!supabase) return [];
    const { data, error } = await supabase.storage.from(BUCKET).list(prefix);
    if (error) throw error;
    return (data ?? []).map((item) => ({
      locationRef: `${prefix}/${item.name}`,
      sizeBytes: item.metadata?.size ?? 0,
      createdAt: item.created_at ?? new Date().toISOString()
    }));
  }

  async download(locationRef: string): Promise<Buffer> {
    if (!supabase) throw new Error("Supabase is not configured.");
    const { data, error } = await supabase.storage.from(BUCKET).download(locationRef);
    if (error) throw error;
    return Buffer.from(await data.arrayBuffer());
  }

  async delete(locationRef: string): Promise<void> {
    if (!supabase) return;
    const { error } = await supabase.storage.from(BUCKET).remove([locationRef]);
    if (error) throw error;
  }
}
