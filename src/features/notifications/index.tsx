"use client";

import { useEffect, useState } from "react";
import { Bell } from "lucide-react";
import { listNotifications, markNotificationRead } from "../../lib/notifications";
import type { AppNotification } from "../../types";

export function NotificationBell({ userId }: { userId: string | null }) {
  const [items, setItems] = useState<AppNotification[]>([]);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const load = () => void listNotifications().then((rows) => { if (!cancelled) setItems(rows); });
    load();
    const interval = setInterval(load, 60000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, []);

  const unread = items.filter((item) => !item.isRead).length;

  const markRead = (id: string) => {
    void markNotificationRead(id, userId).then(() =>
      setItems((prev) => prev.map((row) => (row.id === id ? { ...row, isRead: true } : row)))
    );
  };

  return (
    <div className="notification-bell">
      <button className="ghost" onClick={() => setOpen((value) => !value)} aria-label="Notifications">
        <Bell size={18} />
        {unread > 0 && <span className="badge-count">{unread}</span>}
      </button>
      {open && (
        <div className="notification-dropdown">
          {items.length === 0 && <p className="status-line">لا توجد إشعارات.</p>}
          {items.map((item) => (
            <div key={item.id} className={`notification-item ${item.severity}`}>
              <strong>{item.title}</strong>
              <p>{item.message}</p>
              {!item.isRead && (
                <button className="ghost" onClick={() => markRead(item.id)}>
                  تمييز كمقروء
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
