import { AppError, type ConnectionRecord } from "@doggy-style/domain";
import { supabase } from "./supabase.js";

async function currentOwnerId() { const { data: { user } } = await supabase.auth.getUser(); if (!user) throw new AppError("UNAUTHORIZED", "Please sign in."); return user.id; }

export interface MyConnection { id: string; status: string; myDogId: string; otherDogId: string; otherDogName: string; archived: boolean; createdAt: string }

/** Server-side list: shows the OTHER party's dog name (RLS hides their rows from the client). */
export async function listConnections(): Promise<MyConnection[]> {
  const { data, error } = await supabase.rpc("list_my_connections");
  if (error) throw new AppError("UNAVAILABLE", "We couldn't load your connections. Has migration 00800 been applied?");
  return (data ?? []).map((row: { id: string; status: string; my_dog_id: string; other_dog_id: string; other_dog_name: string; archived: boolean; created_at: string }) => ({
    id: row.id, status: row.status, myDogId: row.my_dog_id, otherDogId: row.other_dog_id,
    otherDogName: row.other_dog_name ?? "Unknown", archived: Boolean(row.archived), createdAt: row.created_at,
  }));
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
  const { data: updated, error } = await supabase.from("connections").update({ status: "CLOSED" }).eq("id", connectionId).select("status");
  if (error) throw new AppError("CONFLICT", error.message);
  if (!updated || updated.length === 0) throw new AppError("FORBIDDEN", "You are not a participant of this connection.");
}

export async function setArchived(connectionId: string, archived: boolean): Promise<void> {
  const { error } = await supabase.rpc("set_connection_archived", { p_connection_id: connectionId, p_archived: archived });
  if (error) throw new AppError("FORBIDDEN", "Could not archive this chat.");
}

export async function deleteChat(connectionId: string): Promise<void> {
  const { error } = await supabase.rpc("delete_connection_chat", { p_connection_id: connectionId });
  if (error) throw new AppError("CONFLICT", "Could not delete this chat.");
}

/** Reopening a deleted chat unhides it for that owner (messages intact). */
export async function undeleteChat(connectionId: string): Promise<void> {
  const { error } = await supabase.rpc("undelete_connection_chat", { p_connection_id: connectionId });
  if (error) throw new AppError("FORBIDDEN", "Could not reopen this chat.");
}
