import { AppError } from "@doggy-style/domain";
import { supabase } from "./supabase.js";

export interface ConversationRow {
  connectionId: string;
  status: string;
  myDogId: string;
  otherDogId: string;
  otherDogName: string;
  otherDogCoverPath: string | null;
  hasMessages: boolean;
  lastMessage: string | null;
  lastMessageAt: string | null;
}

/**
 * All non-closed connections with a chat container, flagged by whether any
 * message was exchanged. UI splits into "Connections" (hasMessages=false)
 * and "Messages" (hasMessages=true) sub-tabs.
 */
export async function listMyConversations(): Promise<ConversationRow[]> {
  const { data, error } = await supabase.rpc("list_my_conversations");
  if (error) throw new AppError("UNAVAILABLE", "Could not load conversations.");
  return (data ?? []).map((row: Record<string, unknown>) => ({
    connectionId: row.connection_id as string,
    status: row.status as string,
    myDogId: row.my_dog_id as string,
    otherDogId: row.other_dog_id as string,
    otherDogName: (row.other_dog_name as string) ?? "Unknown",
    otherDogCoverPath: (row.other_dog_cover as string | null) ?? null,
    hasMessages: Boolean(row.has_messages),
    lastMessage: (row.last_message as string | null) ?? null,
    lastMessageAt: (row.last_message_at as string | null) ?? null,
  }));
}
