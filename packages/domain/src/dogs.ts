import { AppError } from "./errors.js";

export const dogSexes = ["MALE", "FEMALE"] as const;
export const availabilityStatuses = ["AVAILABLE", "UNAVAILABLE"] as const;
export type DogSex = (typeof dogSexes)[number];
export type AvailabilityStatus = (typeof availabilityStatuses)[number];
export type ProfileStatus = "INCOMPLETE" | "COMPLETE";

export interface Dog {
  id: string; ownerId: string; name: string; sex: DogSex; dateOfBirth: string; breed: string;
  location: string | null; breedingEnabled: boolean; availabilityStatus: AvailabilityStatus;
  profileStatus: ProfileStatus; archivedAt: string | null; createdAt: string; updatedAt: string;
}

export interface DogPhoto { id: string; dogId: string; storagePath: string; sortOrder: number; createdAt: string; }
export interface CreateDogInput { name: string; sex: DogSex; dateOfBirth: string; breed: string; }
export interface UpdateDogInput { name?: string; dateOfBirth?: string; breed?: string; location?: string | null; breedingEnabled?: boolean; }

export function validateDogCreation(input: CreateDogInput): CreateDogInput {
  const name = input.name?.trim(); const breed = input.breed?.trim();
  if (!name || !breed || !dogSexes.includes(input.sex) || !isPastOrToday(input.dateOfBirth)) {
    throw new AppError("VALIDATION_ERROR", "Name, sex, date of birth, and breed are required.");
  }
  return { name, sex: input.sex, dateOfBirth: input.dateOfBirth, breed };
}

export function validateDogUpdate(input: UpdateDogInput): UpdateDogInput {
  if (input.name !== undefined && !input.name.trim()) throw new AppError("VALIDATION_ERROR", "Dog name cannot be empty.");
  if (input.breed !== undefined && !input.breed.trim()) throw new AppError("VALIDATION_ERROR", "Dog breed cannot be empty.");
  if (input.dateOfBirth !== undefined && !isPastOrToday(input.dateOfBirth)) throw new AppError("VALIDATION_ERROR", "Date of birth must be today or earlier.");
  return input;
}

export function calculateProfileStatus(dog: Pick<Dog, "location" | "breedingEnabled">, photos: readonly DogPhoto[]): ProfileStatus {
  return dog.location?.trim() && dog.breedingEnabled && photos.length > 0 ? "COMPLETE" : "INCOMPLETE";
}

export function assertOwnedActiveDog(dog: Dog | null, ownerId: string): asserts dog is Dog {
  if (!dog) throw new AppError("NOT_FOUND", "Dog not found.");
  if (dog.ownerId !== ownerId) throw new AppError("FORBIDDEN", "You do not have access to this dog.");
  if (dog.archivedAt) throw new AppError("CONFLICT", "Archived dogs cannot be changed or used as the active dog.");
}

function isPastOrToday(value: string): boolean {
  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.valueOf()) && date <= new Date();
}
