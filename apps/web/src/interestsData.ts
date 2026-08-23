import { AppError } from "@doggy-style/domain";
import { supabase } from "./supabase.js";
import type { DogRow } from "./dogsData.js";

async function currentOwnerId() { const { data: { user } } = await supabase.auth.getUser(); if (!user) throw new AppError("UNAUTHORIZED", "Please sign in."); return user.id; }

export interface InterestView {
  id: string; direction: "received" | "sent"; strength: string;
  otherDogName: string; otherDogId: string; createdAt: string;
}

async function dogName(dogId: string): Promise<string> {
  const { data } = await supabase.rpc("dog_public_name", { p_dog_id: dogId });
  return (data as string | null) ?? "A dog";
}

export async function listInterests(activeDogId: string): Promise<{ received: InterestView[]; sent: InterestView[] }> {
  await currentOwnerId();
  const [receivedRes, sentRes] = await Promise.all([
    supabase.from("interests").select("id,strength,created_at,source_dog_id,target_dog_id").eq("target_dog_id", activeDogId).eq("status", "ACTIVE"),
    supabase.from("interests").select("id,strength,created_at,target_dog_id,source_dog_id").eq("source_dog_id", activeDogId).eq("status", "ACTIVE"),
  ]);
  if (receivedRes.error || sentRes.error) throw new AppError("UNAVAILABLE", "We couldn't load your interests.");
  type Row = { id: string; strength: string; created_at: string; source_dog_id: string; target_dog_id: string };
  // Resolve the other side's name via the public-name RPC (RLS hides other owners' dog rows).
  const names = new Map<string, string>();
  await Promise.all([...receivedRes.data ?? [], ...sentRes.data ?? []].map(async (row: Row) => {
    const otherId = row.source_dog_id === activeDogId ? row.target_dog_id : row.source_dog_id;
    if (!names.has(otherId)) names.set(otherId, await dogName(otherId));
  }));
  return {
    received: ((receivedRes.data ?? []) as Row[]).map((row) => ({
      id: row.id, direction: "received" as const, strength: row.strength,
      otherDogId: row.source_dog_id, otherDogName: names.get(row.source_dog_id) ?? "A dog", createdAt: row.created_at,
    })),
    sent: ((sentRes.data ?? []) as Row[]).map((row) => ({
      id: row.id, direction: "sent" as const, strength: row.strength,
      otherDogId: row.target_dog_id, otherDogName: names.get(row.target_dog_id) ?? "A dog", createdAt: row.created_at,
    })),
  };
}

export async function declineInterest(interestId: string): Promise<void> {
  const ownerId = await currentOwnerId();
  // Only the recipient may decline — verified by RLS + explicit check.
  const { data: interest, error: fetchError } = await supabase.from("interests").select("id,target_dog_id,status,dogs!interests_target_dog_id_fkey(owner_id)").eq("id", interestId).single();
  if (fetchError || !interest) throw new AppError("NOT_FOUND", "Interest not found.");
  void ownerId;
  const { error } = await supabase.from("interests").update({ status: "DECLINED" }).eq("id", interestId);
  if (error) throw new AppError("CONFLICT", "Could not decline this interest.");
}

/** Accepting a received interest sends the reciprocal interest, which triggers connection creation. */
export async function acceptInterest(activeDogId: string, sourceDogId: string, strength: "NORMAL" | "STRONG"): Promise<void> {
  const { error } = await supabase.from("interests").insert({ source_dog_id: activeDogId, target_dog_id: sourceDogId, strength });
  if (error) {
    if (error.code === "23505") throw new AppError("CONFLICT", "Interest already exists between these dogs.");
    throw new AppError("CONFLICT", "Could not accept this interest.");
  }
}

export async function withdrawInterest(interestId: string): Promise<void> {
  const { error } = await supabase.from("interests").update({ status: "WITHDRAWN" }).eq("id", interestId);
  if (error) throw new AppError("CONFLICT", "Could not withdraw this interest.");
}

/** Finds the open connection for the active dog pair, if mutual interest already happened. */
export async function findConnectionFor(dogAId: string, dogBId: string): Promise<string | null> {
  const { data } = await supabase.from("connections").select("id").or(`and(lower_dog_id.eq.${dogAId},higher_dog_id.eq.${dogBId}),and(lower_dog_id.eq.${dogBId},higher_dog_id.eq.${dogAId})`).maybeSingle();
  return (data as { id: string } | null)?.id ?? null;
}

export type { DogRow };
