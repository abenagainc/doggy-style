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

/** Loads the ranked eligible candidate feed for the given active dog. */
export async function loadFeed(activeDogId: string): Promise<{ candidates: CandidateCard[]; exhausted: boolean }> {
  const ownerId = await currentOwnerId();
  const [{ data: activeDog }, { data: dogs }, { data: owners }, { data: prefs }, { data: passes }, { data: interests }, { data: photos }] = await Promise.all([
    supabase.from("dogs").select("*").eq("id", activeDogId).single(),
    supabase.from("dogs").select("id,owner_id,name,sex,date_of_birth,breed,location").neq("id", activeDogId).eq("availability_status", "AVAILABLE").eq("profile_status", "COMPLETE").eq("breeding_enabled", true).is("archived_at", null),
    supabase.from("owners").select("id,verification_status"),
    supabase.from("dog_matching_preferences").select("*").eq("dog_id", activeDogId).maybeSingle(),
    supabase.from("candidate_passes").select("target_dog_id").eq("source_dog_id", activeDogId),
    supabase.from("interests").select("target_dog_id,status").eq("source_dog_id", activeDogId).eq("status", "ACTIVE"),
    supabase.from("dog_photos").select("dog_id,storage_path").order("sort_order"),
  ]);
  if (!activeDog) throw new AppError("NOT_FOUND", "Active dog not found.");
  if (!dogs || !owners || !passes || !interests || !photos) throw new AppError("UNAVAILABLE", "We couldn't load candidates right now.");
  const hidden = new Set([...passes.map((p: { target_dog_id: string }) => p.target_dog_id), ...interests.map((i: { target_dog_id: string }) => i.target_dog_id)]);
  const verificationByOwner = new Map((owners as OwnerRow[]).map((o) => [o.id, o.verification_status]));
  const photoBydog = new Map<string, string>();
  for (const photo of photos as { dog_id: string; storage_path: string }[]) { if (!photoBydog.has(photo.dog_id)) photoBydog.set(photo.dog_id, photo.storage_path); }
  const origin = parseLocation(activeDog.location);
  const required = prefs?.required_breeds ?? [];
  const preferred = new Set((prefs?.preferred_breeds ?? []).map((b: string) => b.toLowerCase()));

  type Scored = CandidateCard & { score: number };
  const scored: Scored[] = [];
  for (const row of dogs as unknown as DogRow[]) {
    if (hidden.has(row.id)) continue;
    if (row.owner_id === ownerId) continue;
    if (verificationByOwner.get(row.owner_id) !== "APPROVED") continue; // DECISIONS.md #2
    if ((photoBydog.get(row.id) ?? null) === null) continue; // matching-ready requires >=1 photo
    if (row.sex === activeDog.sex) continue;
    if (required.length > 0 && !required.includes(row.breed)) continue;
    const candidateOrigin = parseLocation((row as unknown as { location: string | null }).location);
    const km = origin && candidateOrigin ? haversineKm(origin.lat, origin.lon, candidateOrigin.lat, candidateOrigin.lon) : null;
    if (km !== null && prefs && km > Number(prefs.max_distance_km)) continue;
    let score = 0;
    if (preferred.has(row.breed.toLowerCase())) score += 40;
    if (km !== null) score += Math.max(0, 30 - km / 4);
    score += Math.min(5, (photoBydog.get(row.id) ? 3 : 0));
    scored.push({ id: row.id, name: row.name, breed: row.breed, sex: row.sex, ageYears: ageYears(row.date_of_birth), distanceBand: km !== null ? computeBand(km) : "Distance unknown", verification: "Verified owner", photoPath: photoBydog.get(row.id) ?? null, score });
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
