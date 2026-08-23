import { AppError, type AvailabilityStatus, type CreateDogInput, type UpdateDogInput } from "@doggy-style/domain";
import { dogPhotoPath, supabase } from "./supabase.js";

async function currentOwnerId() { const { data: { user } } = await supabase.auth.getUser(); if (!user) throw new AppError("UNAUTHORIZED", "Please sign in."); return user.id; }
export async function createDog(input: CreateDogInput) { const ownerId = await currentOwnerId(); const { data, error } = await supabase.from("dogs").insert({ owner_id: ownerId, name: input.name.trim(), sex: input.sex, date_of_birth: input.dateOfBirth, breed: input.breed.trim() }).select().single(); if (error) throw new AppError("VALIDATION_ERROR", "Could not create this dog."); return data; }
export async function updateDog(dogId: string, input: UpdateDogInput) { const { data, error } = await supabase.from("dogs").update({ ...input, ...(input.name ? { name: input.name.trim() } : {}), ...(input.breed ? { breed: input.breed.trim() } : {}) }).eq("id", dogId).select().single(); if (error || !data) throw new AppError("FORBIDDEN", "Could not update this dog."); return data; }
export async function setAvailability(dogId: string, availabilityStatus: AvailabilityStatus) { const { data, error } = await supabase.from("dogs").update({ availability_status: availabilityStatus }).eq("id", dogId).select().single(); if (error || !data) throw new AppError("CONFLICT", "This dog's availability could not be changed."); return data; }
export async function archiveDog(dogId: string) { const { error } = await supabase.from("dogs").update({ archived_at: new Date().toISOString(), availability_status: "UNAVAILABLE" }).eq("id", dogId); if (error) throw new AppError("FORBIDDEN", "Could not archive this dog."); }
export async function uploadDogPhoto(dogId: string, file: File) { const ownerId = await currentOwnerId(); const path = dogPhotoPath(ownerId, dogId, file.name); const { error: storageError } = await supabase.storage.from("dog-photos").upload(path, file, { contentType: file.type, upsert: false }); if (storageError) throw new AppError("UNAVAILABLE", "Photo upload failed. Please try again."); const { data, error } = await supabase.from("dog_photos").insert({ dog_id: dogId, storage_path: path }).select().single(); if (error) { await supabase.storage.from("dog-photos").remove([path]); throw new AppError("UNAVAILABLE", "Photo upload could not be saved. Please try again."); } return data; }
export async function switchActiveDog(dogId: string | null) { const ownerId = await currentOwnerId(); const { error } = await supabase.from("owners").update({ active_dog_id: dogId }).eq("id", ownerId); if (error) throw new AppError("FORBIDDEN", "Could not switch active dog."); }
export async function restoreActiveDog(): Promise<string | null> {
  const ownerId = await currentOwnerId();
  const [{ data: owner, error: ownerError }, { data: dogs, error: dogsError }] = await Promise.all([
    supabase.from("owners").select("active_dog_id").eq("id", ownerId).single(),
    supabase.from("dogs").select("id").is("archived_at", null).order("created_at")
  ]);
  if (ownerError || dogsError) throw new AppError("UNAVAILABLE", "Could not restore your active dog.");
  const activeDogId = dogs.some((dog) => dog.id === owner.active_dog_id) ? owner.active_dog_id : (dogs[0]?.id ?? null);
  if (activeDogId !== owner.active_dog_id) await switchActiveDog(activeDogId);
  return activeDogId;
}
