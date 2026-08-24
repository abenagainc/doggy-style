import { AppError } from "@doggy-style/domain";
import { supabase } from "./supabase.js";

export interface NotificationItem {
  id: string;
  type: "INTEREST_RECEIVED" | "MATCH" | "MESSAGE" | "PROCEEDING_CONFIRMED";
  payload: Record<string, unknown>;
  dogId: string | null;
  read: boolean;
  createdAt: string;
}

export async function listNotifications(): Promise<NotificationItem[]> {
  const { data, error } = await supabase
    .from("notifications")
    .select("id,type,payload,dog_id,read_at,created_at")
    .order("created_at", { ascending: false })
    .limit(50);
  if (error) throw new AppError("UNAVAILABLE", "Could not load notifications.");
  return (data ?? []).map((n: Record<string, unknown>) => ({
    id: n.id as string,
    type: n.type as NotificationItem["type"],
    payload: (n.payload ?? {}) as Record<string, unknown>,
    dogId: (n.dog_id as string) ?? null,
    read: Boolean(n.read_at),
    createdAt: n.created_at as string,
  }));
}

export async function unreadCount(): Promise<number> {
  const { count } = await supabase.from("notifications").select("*", { count: "exact", head: true }).is("read_at", null);
  return count ?? 0;
}

export async function markAllRead(): Promise<void> {
  await supabase.rpc("mark_notifications_read");
}
