import { AppError, type AvailabilityStatus, type CreateDogInput } from "@doggy-style/domain";
import { supabase } from "./supabase.js";

async function currentOwnerId() { const { data: { user } } = await supabase.auth.getUser(); if (!user) throw new AppError("UNAUTHORIZED", "Please sign in."); return user.id; }

export interface DogRow {
  id: string; name: string; sex: string; date_of_birth: string; breed: string;
  location: string | null; breeding_enabled: boolean; profile_status: string;
  availability_status: string; archived_at: string | null;
}

export async function listMyDogs(): Promise<DogRow[]> {
  const { data, error } = await supabase.from("dogs").select("*").is("archived_at", null).order("created_at");
  if (error || !data) throw new AppError("UNAVAILABLE", "We couldn't load your dogs.");
  return data as DogRow[];
}

export async function createDog(input: CreateDogInput): Promise<DogRow> {
  const ownerId = await currentOwnerId();
  const { data, error } = await supabase.from("dogs").insert({
    owner_id: ownerId, name: input.name.trim(), sex: input.sex, date_of_birth: input.dateOfBirth, breed: input.breed.trim(),
  }).select().single();
  if (error || !data) throw new AppError("VALIDATION_ERROR", error?.message ?? "Could not create this dog.");
  return data as DogRow;
}

export async function updateDogBasics(dogId: string, input: Partial<{ name: string; breed: string; date_of_birth: string; location: string | null; breeding_enabled: boolean }>): Promise<void> {
  const { error } = await supabase.from("dogs").update(input).eq("id", dogId);
  if (error) throw new AppError("FORBIDDEN", error.message.includes("check") ? "Invalid values — check name, breed and date." : "Could not update this dog.");
}

export async function setAvailability(dogId: string, status: AvailabilityStatus): Promise<void> {
  const { error } = await supabase.from("dogs").update({ availability_status: status }).eq("id", dogId);
  if (error) {
    if (error.message.includes("available_dog_must_be_complete")) throw new AppError("CONFLICT", "Complete the profile (photo, location, breeding enabled) before going available.");
    throw new AppError("CONFLICT", "Could not change availability.");
  }
}

export async function archiveDog(dogId: string): Promise<void> {
  const { error } = await supabase.from("dogs").update({ archived_at: new Date().toISOString(), availability_status: "UNAVAILABLE" }).eq("id", dogId);
  if (error) throw new AppError("FORBIDDEN", "Could not archive this dog.");
}

export async function uploadPhoto(dogId: string, file: File): Promise<void> {
  const ownerId = await currentOwnerId();
  const path = `${ownerId}/${dogId}/${crypto.randomUUID()}-${file.name.replace(/[^a-zA-Z0-9._-]/g, "_")}`;
  const { error: uploadError } = await supabase.storage.from("dog-photos").upload(path, file, { contentType: file.type });
  if (uploadError) throw new AppError("UNAVAILABLE", uploadError.message.includes("not found") ? "Storage bucket 'dog-photos' is missing — create it in the Supabase dashboard (private)." : "Photo upload failed. Please try again.");
  const { error: insertError } = await supabase.from("dog_photos").insert({ dog_id: dogId, storage_path: path });
  if (insertError) {
    await supabase.storage.from("dog-photos").remove([path]);
    throw new AppError("UNAVAILABLE", "Photo could not be saved.");
  }
}

export async function photoSignedUrl(storagePath: string): Promise<string> {
  const { data } = await supabase.storage.from("dog-photos").createSignedUrl(storagePath, 3600);
  return data?.signedUrl ?? "";
}

export interface PhotoRow { id: string; storage_path: string }

export async function listPhotos(dogId: string): Promise<PhotoRow[]> {
  const { data, error } = await supabase.from("dog_photos").select("id,storage_path").eq("dog_id", dogId).order("sort_order");
  if (error) throw new AppError("UNAVAILABLE", "Could not load photos.");
  return (data ?? []) as PhotoRow[];
}

// --- Matching preferences ---

interface PrefsRow { required_breeds: string[]; preferred_breeds: string[]; age_min_months: number; age_max_months: number; max_distance_km: number }

export async function loadPreferences(dogId: string) {
  const { data } = await supabase.from("dog_matching_preferences").select("*").eq("dog_id", dogId).maybeSingle();
  return (data as PrefsRow | null) ?? null;
}

export interface PrefsShape { requiredBreeds: string; preferredBreeds: string; ageMinMonths: string; ageMaxMonths: string; maxDistanceKm: string }

export async function setActiveDog(dogId: string) {
  const ownerId = await currentOwnerId();
  const { error } = await supabase.from("owners").update({ active_dog_id: dogId }).eq("id", ownerId);
  if (error) throw new AppError("FORBIDDEN", "Could not switch active dog.");
}

// --- Passed dogs ---

export interface PassedDog { id: string; name: string; breed: string; sex: string; photoPath: string | null }

export async function listPassedDogs(activeDogId: string): Promise<PassedDog[]> {
  const { data, error } = await supabase.rpc("list_passed_dogs", { p_source_dog_id: activeDogId });
  if (error) throw new AppError("UNAVAILABLE", "Could not load passed dogs.");
  return (data ?? []).map((row: { id: string; name: string; breed: string; sex: string; photo_path: string | null }) => ({
    id: row.id, name: row.name, breed: row.breed, sex: row.sex, photoPath: row.photo_path,
  }));
}

export async function reconsiderPassed(activeDogId: string, targetDogId: string): Promise<void> {
  const { error } = await supabase.from("candidate_passes").delete().eq("source_dog_id", activeDogId).eq("target_dog_id", targetDogId);
  if (error) throw new AppError("CONFLICT", "Could not reconsider this candidate.");
}

export async function savePreferences(dogId: string, input: PrefsShape) {
  const parseBreeds = (raw: string) => raw.split(",").map((breed) => breed.trim()).filter(Boolean);
  const required = parseBreeds(input.requiredBreeds);
  const preferred = parseBreeds(input.preferredBreeds).filter((breed) => !required.includes(breed));
  const ageMin = Number(input.ageMinMonths); const ageMax = Number(input.ageMaxMonths); const maxKm = Number(input.maxDistanceKm);
  if (!Number.isFinite(ageMin) || !Number.isFinite(ageMax) || ageMin < 0 || ageMin > ageMax) {
    throw new AppError("VALIDATION_ERROR", "Age range must be valid and ordered.");
  }
  if (!Number.isFinite(maxKm) || maxKm <= 0) throw new AppError("VALIDATION_ERROR", "Max distance must be positive.");
  const { error } = await supabase.from("dog_matching_preferences").upsert({
    dog_id: dogId,
    required_breeds: required,
    preferred_breeds: preferred,
    age_min_months: ageMin,
    age_max_months: ageMax,
    max_distance_km: maxKm,
  });
  if (error) throw new AppError("VALIDATION_ERROR", "Could not save preferences.");
}
