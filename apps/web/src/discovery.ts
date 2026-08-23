import { AppError, distanceBand as computeBand, haversineKm } from "@doggy-style/domain";
import { supabase } from "./supabase.js";

async function currentOwnerId() { const { data: { user } } = await supabase.auth.getUser(); if (!user) throw new AppError("UNAUTHORIZED", "Please sign in."); return user.id; }

export interface CandidateCard {
  id: string; name: string; breed: string; sex: string; ageYears: number;
  distanceBand: string; verification: string; photoPath: string | null;
}

interface DogRow { id: string; owner_id: string; name: string; sex: string; date_of_birth: string; breed: string }
interface OwnerRow { id: string; verification_status: string }

function ageYears(dateOfBirth: string) { return Math.floor((Date.now() - new Date(`${dateOfBirth}T00:00:00Z`).valueOf()) / (365.25 * 24 * 3600 * 1000)); }

/** Loads the ranked eligible candidate feed for the given active dog (server-authoritative via RPC). */
export async function loadFeed(activeDogId: string): Promise<{ candidates: CandidateCard[]; exhausted: boolean }> {
  const [{ data: activeDog }, { data: dogs, error: rpcError }, { data: prefs }] = await Promise.all([
    supabase.from("dogs").select("*").eq("id", activeDogId).single(),
    supabase.rpc("eligible_candidates", { p_source_dog_id: activeDogId }),
    supabase.from("dog_matching_preferences").select("*").eq("dog_id", activeDogId).maybeSingle(),
  ]);
  if (!activeDog) throw new AppError("NOT_FOUND", "Active dog not found.");
  if (rpcError) throw new AppError("UNAVAILABLE", "Feed is unavailable — has the discovery RPC migration been applied?");
  const origin = parseLocation(activeDog.location);
  const required = prefs?.required_breeds ?? [];
  const preferred = new Set((prefs?.preferred_breeds ?? []).map((b: string) => b.toLowerCase()));

  type Scored = CandidateCard & { score: number };
  const scored: Scored[] = [];
  for (const row of dogs as unknown as Array<DogRow & { photo_path: string | null }>) {
    if (row.sex === activeDog.sex) continue;
    if (required.length > 0 && !required.includes(row.breed)) continue;
    const candidateOrigin = parseLocation((row as unknown as { location: string | null }).location);
    const km = origin && candidateOrigin ? haversineKm(origin.lat, origin.lon, candidateOrigin.lat, candidateOrigin.lon) : null;
    if (km !== null && prefs && km > Number(prefs.max_distance_km)) continue;
    let score = 0;
    if (preferred.has(row.breed.toLowerCase())) score += 40;
    if (km !== null) score += Math.max(0, 30 - km / 4);
    scored.push({ id: row.id, name: row.name, breed: row.breed, sex: row.sex, ageYears: ageYears(row.date_of_birth), distanceBand: km !== null ? computeBand(km) : "Distance unknown", verification: "Verified owner", photoPath: row.photo_path ?? null, score });
  }
  scored.sort((a, b) => b.score - a.score);
  return { candidates: scored.map(({ score, ...card }) => ({ ...card })), exhausted: scored.length === 0 };
}

function parseLocation(location: string | null): { lat: number; lon: number } | null {
  if (!location) return null;
  const match = /^(-?\d+(?:\.\d+)?),\s*(-?\d+(?:\.\d+)?)$/.exec(location.trim());
  if (!match) return null;
  const lat = Number(match[1]); const lon = Number(match[2]);
  return Number.isFinite(lat) && Number.isFinite(lon) && Math.abs(lat) <= 90 && Math.abs(lon) <= 180 ? { lat, lon } : null;
}

export async function passCandidate(activeDogId: string, targetDogId: string) {
  const { error } = await supabase.from("candidate_passes").insert({ source_dog_id: activeDogId, target_dog_id: targetDogId });
  if (error) throw new AppError("CONFLICT", "Could not pass this candidate. Please try again.");
}

export async function sendInterest(activeDogId: string, targetDogId: string, strength: "NORMAL" | "STRONG") {
  const { error } = await supabase.from("interests").insert({ source_dog_id: activeDogId, target_dog_id: targetDogId, strength });
  if (error) {
    if (error.code === "23505") throw new AppError("CONFLICT", "You've already sent interest to this dog."); // unique per direction
    throw new AppError("CONFLICT", "Interest could not be sent — this candidate may no longer be available.");
  }
}

export interface ReceivedInterest { id: string; fromName: string; strength: string; sourceDogId: string }

export async function listReceivedInterests(activeDogId: string): Promise<ReceivedInterest[]> {
  const { data, error } = await supabase
    .from("interests")
    .select("id,strength,source_dog_id,dogs!interests_source_dog_id_fkey(name)")
    .eq("target_dog_id", activeDogId)
    .eq("status", "ACTIVE");
  if (error || !data) throw new AppError("UNAVAILABLE", "We couldn't load your received interests.");
  return data.map((row: { id: string; strength: string; source_dog_id: string; dogs: { name: string } | { name: string }[] }) => ({
    id: row.id,
    strength: row.strength,
    sourceDogId: row.source_dog_id,
    fromName: Array.isArray(row.dogs) ? row.dogs[0]?.name ?? "A dog" : row.dogs.name,
  }));
}

export async function declineInterest(interestId: string) {
  const { error } = await supabase.from("interests").update({ status: "DECLINED" }).eq("id", interestId);
  if (error) throw new AppError("FORBIDDEN", "Could not decline this interest.");
}

export async function savePreferences(dogId: string, input: { requiredBreeds: string[]; preferredBreeds: string[]; ageMinMonths: number; ageMaxMonths: number; maxDistanceKm: number }) {
  if (input.ageMinMonths < 0 || input.ageMinMonths > input.ageMaxMonths || input.maxDistanceKm <= 0) throw new AppError("VALIDATION_ERROR", "Preferences are invalid.");
  const { error } = await supabase.from("dog_matching_preferences").upsert({
    dog_id: dogId,
    required_breeds: input.requiredBreeds.map((breed) => breed.trim()).filter(Boolean),
    preferred_breeds: input.preferredBreeds.map((breed) => breed.trim()).filter(Boolean),
    age_min_months: input.ageMinMonths,
    age_max_months: input.ageMaxMonths,
    max_distance_km: input.maxDistanceKm,
  });
  if (error) throw new AppError("VALIDATION_ERROR", "Could not save preferences.");
}
