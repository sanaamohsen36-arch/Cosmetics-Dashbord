import type { AppNotification, NotificationCategory, NotificationSeverity } from "../../types";
import { supabase } from "../supabase/client";

// Section 18. Deliberately distinct from audit_log (section 14): this is an
// ephemeral, markable-as-read inbox of things needing attention, not a
// permanent record of actions taken.
export interface NotificationChannel {
  readonly id: string;
  send(notification: { severity: NotificationSeverity; category: NotificationCategory; title: string; message: string }): Promise<void>;
}

// The only channel today. Telegram (docs/ARCHITECTURE.md section 19) becomes
// a second one later via the same interface - notify() below fans out to
// every configured channel, so adding one is additive, not a rewrite.
const inAppChannel: NotificationChannel = {
  id: "in-app",
  async send(notification) {
    if (!supabase) return;
    const { error } = await supabase.from("notifications").insert({
      severity: notification.severity,
      category: notification.category,
      title: notification.title,
      message: notification.message
    });
    if (error) console.error("notify (in-app) failed", error.message);
  }
};

const channels: NotificationChannel[] = [inAppChannel];

export const notify = async (
  category: NotificationCategory,
  severity: NotificationSeverity,
  title: string,
  message: string
): Promise<void> => {
  await Promise.all(channels.map((channel) => channel.send({ severity, category, title, message })));
};

const fromRow = (row: any): AppNotification => ({
  id: row.id,
  severity: row.severity,
  category: row.category,
  title: row.title,
  message: row.message,
  relatedEntityType: row.related_entity_type,
  relatedEntityId: row.related_entity_id,
  isRead: Boolean(row.is_read),
  readAt: row.read_at,
  readBy: row.read_by,
  createdAt: row.created_at
});

export const listNotifications = async (): Promise<AppNotification[]> => {
  if (!supabase) return [];
  const { data, error } = await supabase.from("notifications").select("*").order("created_at", { ascending: false }).limit(50);
  if (error) return [];
  return (data ?? []).map(fromRow);
};

export const markNotificationRead = async (id: string, userId: string | null): Promise<void> => {
  if (!supabase) return;
  await supabase.from("notifications").update({ is_read: true, read_at: new Date().toISOString(), read_by: userId }).eq("id", id);
};
