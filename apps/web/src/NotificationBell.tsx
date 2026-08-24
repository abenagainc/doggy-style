import { useCallback, useEffect, useRef, useState } from "react";
import { listNotifications, markAllRead, unreadCount, type NotificationItem } from "./notificationsData.js";
import { Icon } from "./IconButton.js";

/** Header bell with unread badge and dropdown panel. Polls every 8s (cheap). */
export function NotificationBell() {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<NotificationItem[]>([]);
  const [unread, setUnread] = useState(0);
  const panelRef = useRef<HTMLDivElement | null>(null);

  const refresh = useCallback(async () => {
    try {
      setUnread(await unreadCount());
      if (open) setItems(await listNotifications());
    } catch { /* transient */ }
  }, [open]);

  useEffect(() => { void refresh(); }, [refresh]);
  useEffect(() => {
    const interval = setInterval(() => { if (document.visibilityState === "visible") void refresh(); }, 8000);
    return () => clearInterval(interval);
  }, [refresh]);

  // Close on outside click.
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => { if (panelRef.current && !panelRef.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  const toggle = async () => {
    const next = !open;
    setOpen(next);
    if (next) {
      setItems(await listNotifications());
      await markAllRead();
      setUnread(0);
    }
  };

  const describe = (n: NotificationItem): { text: string; route?: () => void } => {
    const p = n.payload as Record<string, string>;
    switch (n.type) {
      case "INTEREST_RECEIVED":
        return { text: `${p.fromDogName} sent your dog interest${p.strength === "STRONG" ? " (strong)" : ""}.`, route: () => window.dispatchEvent(new CustomEvent<string>("goto-tab", { detail: "interests" })) };
      case "MATCH":
        return { text: `It's a match with ${p.otherDogName}!`, route: () => window.dispatchEvent(new CustomEvent<string>("open-connection", { detail: p.connectionId ?? "" })) };
      case "MESSAGE":
        return { text: `New message: "${p.preview}"`, route: () => window.dispatchEvent(new CustomEvent<string>("open-connection", { detail: (p.connectionId ?? p.conversationId) ?? "" })) };
      case "PROCEEDING_CONFIRMED":
        return { text: "Both owners confirmed proceeding. 🐾", route: () => window.dispatchEvent(new CustomEvent<string>("open-connection", { detail: p.connectionId ?? "" })) };
    }
  };

  return (
    <div style={{ position: "relative" }} ref={panelRef}>
      <button
        aria-label="Notifications"
        onClick={() => void toggle()}
        style={{ width: 40, height: 40, borderRadius: "50%", border: "1.5px solid var(--line)", background: "#fff", cursor: "pointer", display: "inline-flex", alignItems: "center", justifyContent: "center", position: "relative" }}
      >
        <Icon name="chat" size={18} />
        {unread > 0 && (
          <span style={{
            position: "absolute", top: -4, right: -4, background: "#ff3b30", color: "#fff",
            borderRadius: 999, minWidth: 18, height: 18, fontSize: 11, fontWeight: 700,
            display: "flex", alignItems: "center", justifyContent: "center", padding: "0 4px",
          }}>{unread > 9 ? "9+" : unread}</span>
        )}
      </button>
      {open && (
        <div style={{
          position: "absolute", right: 0, top: 48, width: 320, maxHeight: 420, overflowY: "auto",
          background: "#fff", border: "1px solid var(--line)", borderRadius: 14,
          boxShadow: "0 12px 30px rgba(0,0,0,.15)", zIndex: 30,
        }}>
          {items.length === 0 ? <p style={{ padding: 16, color: "var(--ink-soft)" }}>No notifications yet.</p> : items.map((n) => {
            const { text, route } = describe(n);
            return (
              <div key={n.id}
                onClick={() => { setOpen(false); route?.(); }}
                style={{
                  padding: "12px 16px", borderBottom: "1px solid var(--line)", cursor: "pointer",
                  background: n.read ? "#fff" : "#f2f2f7",
                }}>
                <small style={{ color: "var(--ink-soft)", display: "block", marginBottom: 2 }}>
                  {new Date(n.createdAt).toLocaleString()}
                </small>
                {text}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
