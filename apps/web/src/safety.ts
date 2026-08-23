import { AppError } from "@doggy-style/domain";
import { supabase } from "./supabase.js";

async function currentOwnerId() { const { data: { user } } = await supabase.auth.getUser(); if (!user) throw new AppError("UNAUTHORIZED", "Please sign in."); return user.id; }

/** Resolves the other owner's id for a connection (the one who isn't me). */
export async function otherOwnerInConnection(connectionId: string): Promise<string> {
  const ownerId = await currentOwnerId();
  const { data: conn, error } = await supabase.from("connections").select("owner_a_id,owner_b_id,lower_dog_id,higher_dog_id,dogs!connections_lower_dog_id_fkey(owner_id),dogs2:dogs!connections_higher_dog_id_fkey(owner_id)").eq("id", connectionId).single();
  if (error || !conn) throw new AppError("NOT_FOUND", "Connection not found.");
  void (conn as unknown as { dogs: unknown; dogs2: unknown });
  // owner_a_id belongs to lower dog, owner_b_id to higher dog.
  const owners = [String((conn as unknown as { owner_a_id: string }).owner_a_id ?? ""), String((conn as unknown as { owner_b_id: string }).owner_b_id ?? "")];
  const other = owners[0] === ownerId ? owners[1] : owners[0];
  if (!other) throw new AppError("NOT_FOUND", "Connection participants could not be resolved.");
  return other;
}

export async function blockOwner(targetOwnerId: string) {
  const ownerId = await currentOwnerId();
  const { error } = await supabase.from("blocks").insert({ blocker_id: ownerId, blocked_id: targetOwnerId });
  if (error) {
    if (error.code === "23505") throw new AppError("CONFLICT", "This owner is already blocked.");
    throw new AppError("CONFLICT", "Could not block this owner.");
  }
}

export const REPORT_REASONS = ["INAPPROPRIATE_CONTENT", "HARASSMENT", "MISREPRESENTATION", "SAFETY_CONCERN", "OTHER"] as const;
export type ReportReason = (typeof REPORT_REASONS)[number];

export async function submitReport(input: { targetOwnerId: string; reason: ReportReason; details?: string | undefined; connectionId?: string | undefined }) {
  const ownerId = await currentOwnerId();
  const { error } = await supabase.from("reports").insert({
    reporter_owner_id: ownerId,
    target_owner_id: input.targetOwnerId,
    ...(input.connectionId ? { connection_id: input.connectionId } : {}),
    reason: input.reason,
    ...(input.details?.trim() ? { details: input.details.trim() } : {}),
  });
  if (error) throw new AppError("VALIDATION_ERROR", "Report could not be submitted. Please try again.");
}

/** Fire-and-forget product event (docs/technical/28). Never includes message content or sensitive data. */
export function trackEvent(eventName: string, properties: Record<string, unknown> = {}, dogId?: string) {
  currentOwnerId().then((ownerId) =>
    supabase.from("analytics_events").insert({ event_name: eventName, owner_id: ownerId, ...(dogId ? { dog_id: dogId } : {}), properties }),
  ).catch(() => undefined);
}
