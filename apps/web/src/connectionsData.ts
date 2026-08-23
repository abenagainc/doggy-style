import { AppError, type ConnectionRecord } from "@doggy-style/domain";
import { supabase } from "./supabase.js";

async function currentOwnerId() { const { data: { user } } = await supabase.auth.getUser(); if (!user) throw new AppError("UNAUTHORIZED", "Please sign in."); return user.id; }

interface ConnectionRow {
  id: string; status: string; lower_dog_id: string; higher_dog_id: string;
}

export async function listConnections(): Promise<(ConnectionRow & { otherDogName: string })[]> {
  const ownerId = await currentOwnerId();
  const { data: dogs } = await supabase.from("dogs").select("id,name").eq("owner_id", ownerId);
  const myDogIds = new Set((dogs ?? []).map((d: { id: string }) => d.id));
  const [{ data: lowerLinks }, { data: higherLinks }] = await Promise.all([
    supabase.from("connections").select("id,status,lower_dog_id,higher_dog_id,dogs!connections_lower_dog_id_fkey(name)").in("lower_dog_id", [...myDogIds]),
    supabase.from("connections").select("id,status,lower_dog_id,higher_dog_id,dogs!connections_higher_dog_id_fkey(name)").in("higher_dog_id", [...myDogIds]),
  ]);
  const byId = new Map<string, ConnectionRow & { otherDogName: string }>();
  for (const row of (lowerLinks ?? []) as unknown as { id: string; status: string; lower_dog_id: string; higher_dog_id: string; dogs: { name: string } | { name: string }[] }[]) {
    const name = Array.isArray(row.dogs) ? row.dogs[0]?.name ?? "Unknown" : row.dogs.name;
    byId.set(row.id, { ...row, otherDogName: name });
  }
  for (const row of (higherLinks ?? []) as unknown as typeof lowerLinks & any[]) {
    if (!row) continue;
    const name = Array.isArray(row.dogs) ? row.dogs[0]?.name ?? "Unknown" : row.dogs.name;
    byId.set(row.id, { id: row.id, status: row.status, lower_dog_id: row.lower_dog_id, higher_dog_id: row.higher_dog_id, otherDogName: name });
  }
  if (byId.size === 0 && !(lowerLinks || higherLinks)) throw new AppError("UNAVAILABLE", "We couldn't load your connections.");
  return [...byId.values()];
}

async function conversationFor(connectionId: string): Promise<string> {
  const existing = await supabase.from("conversations").select("id").eq("connection_id", connectionId).maybeSingle();
  if (existing.data?.id) return existing.data.id as string;
  const created = await supabase.from("conversations").insert({ connection_id: connectionId }).select("id").single();
  if (created.error || !created.data) throw new AppError("CONFLICT", "Could not open this conversation.");
  return created.data.id as string;
}

export interface ChatMessage { id: string; mine: boolean; body: string; sentAt: string }

export async function loadThread(connectionId: string): Promise<{ conversationId: string; messages: ChatMessage[]; status: string }> {
  const ownerId = await currentOwnerId();
  const conversationId = await conversationFor(connectionId);
  const { data, error } = await supabase.from("messages").select("id,sender_owner_id,body,sent_at").eq("conversation_id", conversationId).order("sent_at");
  const { data: conn } = await supabase.from("connections").select("status").eq("id", connectionId).single();
  if (error || !data) throw new AppError("UNAVAILABLE", "We couldn't load this conversation.");
  return {
    conversationId,
    status: conn?.status ?? "ACTIVE",
    messages: data.map((m: { id: string; sender_owner_id: string; body: string; sent_at: string }) => ({ id: m.id, mine: m.sender_owner_id === ownerId, body: m.body, sentAt: m.sent_at })),
  };
}

export async function sendMessage(conversationId: string, body: string) {
  const ownerId = await currentOwnerId();
  const trimmed = body.trim();
  if (!trimmed || trimmed.length > 4000) throw new AppError("VALIDATION_ERROR", "Message must be between 1 and 4000 characters.");
  const { error } = await supabase.from("messages").insert({ conversation_id: conversationId, sender_owner_id: ownerId, body: trimmed });
  if (error) throw new AppError("CONFLICT", error.message.includes("read-only") ? "This conversation is read-only." : "Message could not be sent.");
}

export async function confirmProceeding(connectionId: string): Promise<string> {
  const ownerId = await currentOwnerId();
  // Idempotent insert; then read the resulting connection status.
  const { error } = await supabase.from("connection_proceed_confirmations").upsert({ connection_id: connectionId, owner_id: ownerId }, { onConflict: "connection_id,owner_id", ignoreDuplicates: true });
  if (error) throw new AppError("CONFLICT", "Could not confirm proceeding.");
  const { data: conn } = await supabase.from("connections").select("status").eq("id", connectionId).single();
  return conn?.status ?? "ACTIVE";
}

export async function endConnection(connectionId: string) {
  const { data: updated, error } = await supabase.from("connections").update({ status: "CLOSED" }).eq("id", connectionId).select("status").single();
  if (error || updated?.status !== "CLOSED") throw new AppError("CONFLICT", "Could not end this connection.");
}
