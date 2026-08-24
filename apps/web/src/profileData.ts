import { AppError } from "@doggy-style/domain";
import { supabase } from "./supabase.js";

// --- Owner-side profile section editing ---

export interface HealthSection { height_cm?: string; weight_kg?: string; general_health?: string; health_issues?: string }
export interface Vaccination { id?: string; vaccine_name: string; date_given: string; next_due?: string | null; notes?: string | null }
export interface PedigreeSection { sire_name?: string; dam_name?: string; registration_number?: string; lineage_notes?: string }
export interface TemperamentSection {
  energy_level?: string; good_with_children?: boolean | null;
  good_with_dogs?: boolean | null; good_with_cats?: boolean | null;
  trainability?: string; notes?: string;
}

export async function loadHealth(dogId: string): Promise<HealthSection> {
  const { data, error } = await supabase.from("dog_health").select("*").eq("dog_id", dogId).maybeSingle();
  if (error) throw new AppError("UNAVAILABLE", "Could not load health data.");
  return (data as HealthSection) ?? {};
}
export async function saveHealth(dogId: string, input: HealthSection) {
  const num = (v: string) => v === "" || !Number.isFinite(Number(v)) ? null : Number(v);
  const { error } = await supabase.from("dog_health").upsert({
    dog_id: dogId,
    height_cm: num(input.height_cm ?? ""),
    weight_kg: num(input.weight_kg ?? ""),
    general_health: input.general_health?.trim() || null,
    health_issues: input.health_issues?.trim() || null,
  });
  if (error) throw new AppError("VALIDATION_ERROR", error.message.includes("row-level") ? "Could not save — you may not own this dog." : error.message);
}

export async function loadVaccinations(dogId: string): Promise<Vaccination[]> {
  const { data, error } = await supabase.from("dog_vaccinations").select("*").eq("dog_id", dogId).order("date_given", { ascending: false });
  if (error) throw new AppError("UNAVAILABLE", "Could not load vaccinations.");
  return (data ?? []) as unknown as Vaccination[];
}
export async function addVaccination(dogId: string, input: { vaccine_name: string; date_given: string; next_due?: string; notes?: string }) {
  if (!input.vaccine_name.trim() || !input.date_given) throw new AppError("VALIDATION_ERROR", "Vaccine name and date are required.");
  const { error } = await supabase.from("dog_vaccinations").insert({
    dog_id: dogId,
    vaccine_name: input.vaccine_name.trim(),
    date_given: input.date_given,
    next_due: input.next_due || null,
    notes: input.notes?.trim() || null,
  });
  if (error) throw new AppError("VALIDATION_ERROR", error.message);
}
export async function deleteVaccination(id: string) {
  const { error } = await supabase.from("dog_vaccinations").delete().eq("id", id);
  if (error) throw new AppError("CONFLICT", "Could not remove vaccination.");
}

export async function loadPedigree(dogId: string): Promise<PedigreeSection> {
  const { data, error } = await supabase.from("dog_pedigree").select("*").eq("dog_id", dogId).maybeSingle();
  if (error) throw new AppError("UNAVAILABLE", "Could not load pedigree.");
  return (data as PedigreeSection) ?? {};
}
export async function savePedigree(dogId: string, input: PedigreeSection) {
  const { error } = await supabase.from("dog_pedigree").upsert({
    dog_id: dogId,
    sire_name: input.sire_name?.trim() || null,
    dam_name: input.dam_name?.trim() || null,
    registration_number: input.registration_number?.trim() || null,
    lineage_notes: input.lineage_notes?.trim() || null,
  });
  if (error) throw new AppError("VALIDATION_ERROR", error.message);
}

export async function loadTemperament(dogId: string): Promise<TemperamentSection> {
  const { data, error } = await supabase.from("dog_temperament").select("*").eq("dog_id", dogId).maybeSingle();
  if (error) throw new AppError("UNAVAILABLE", "Could not load temperament.");
  return (data as TemperamentSection) ?? {};
}
export async function saveTemperament(dogId: string, input: TemperamentSection) {
  const { error } = await supabase.from("dog_temperament").upsert({
    dog_id: dogId,
    energy_level: input.energy_level || null,
    good_with_children: input.good_with_children ?? null,
    good_with_dogs: input.good_with_dogs ?? null,
    good_with_cats: input.good_with_cats ?? null,
    trainability: input.trainability || null,
    notes: input.notes?.trim() || null,
  });
  if (error) throw new AppError("VALIDATION_ERROR", error.message);
}

// --- Candidate detail (cross-owner via RPC; privacy enforced server-side) ---

export interface CandidateProfile {
  name: string; breed: string; sex: string; date_of_birth: string;
  profileStatus: string; verificationStatus: string; photos: string[];
  health: Record<string, unknown> | null;
  vaccinations: Array<{ vaccineName: string; dateGiven: string; nextDue: string | null }> | null;
  pedigree: Record<string, unknown> | null;
  temperament: Record<string, unknown> | null;
}

export async function loadCandidateProfile(viewerDogId: string, candidateDogId: string): Promise<CandidateProfile> {
  const { data, error } = await supabase.rpc("candidate_profile", { p_viewer_dog_id: viewerDogId, p_candidate_dog_id: candidateDogId });
  if (error) throw new AppError(error.message.includes("unavailable") ? "FORBIDDEN" : "NOT_FOUND", "This profile is unavailable.");
  return data as unknown as CandidateProfile;
}

/** Candidate photos live in other owners' storage scope — sign via RPC. */
export async function candidatePhotoUrl(viewerDogId: string, storagePath: string | null): Promise<string> {
  if (!storagePath) return "";
  const { data, error } = await supabase.rpc("candidate_photo_url", { p_viewer_dog_id: viewerDogId, p_storage_path: storagePath });
  if (error || !data) return "";
  return data as string;
}
