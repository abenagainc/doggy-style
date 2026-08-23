import { AppError } from "./errors.js";
import { assertOwnedActiveDog, calculateProfileStatus, type AvailabilityStatus, type CreateDogInput, type Dog, type UpdateDogInput, validateDogCreation, validateDogUpdate } from "./dogs.js";
import type { AuthProvider, ConsentRepository, DogRepository } from "./ports.js";

export class DogService {
  constructor(private readonly dogs: DogRepository, private readonly now: () => Date = () => new Date()) {}
  async create(ownerId: string, input: CreateDogInput): Promise<Dog> { return this.dogs.createDog(ownerId, validateDogCreation(input)); }
  async update(ownerId: string, dogId: string, input: UpdateDogInput): Promise<Dog> {
    const dog = await this.dogs.getDog(dogId); assertOwnedActiveDog(dog, ownerId); validateDogUpdate(input);
    const updated = await this.dogs.updateDog(dogId, { ...input, ...(input.name !== undefined ? { name: input.name.trim() } : {}), ...(input.breed !== undefined ? { breed: input.breed.trim() } : {}) });
    return this.refreshProfileStatus(updated);
  }
  async addPhoto(ownerId: string, dogId: string, storagePath: string) {
    const dog = await this.dogs.getDog(dogId); assertOwnedActiveDog(dog, ownerId);
    if (!storagePath.startsWith(`${ownerId}/${dogId}/`)) throw new AppError("VALIDATION_ERROR", "Invalid photo upload path.");
    const photo = await this.dogs.addPhoto(dogId, storagePath); await this.refreshProfileStatus(dog); return photo;
  }
  async setAvailability(ownerId: string, dogId: string, status: AvailabilityStatus): Promise<Dog> {
    const dog = await this.dogs.getDog(dogId); assertOwnedActiveDog(dog, ownerId);
    if (status === "AVAILABLE" && dog.profileStatus !== "COMPLETE") throw new AppError("CONFLICT", "Complete this dog's profile before making it available.");
    return this.dogs.updateDog(dogId, { availabilityStatus: status });
  }
  async archive(ownerId: string, dogId: string): Promise<void> {
    const dog = await this.dogs.getDog(dogId); assertOwnedActiveDog(dog, ownerId);
    await this.dogs.archiveDog(dogId, this.now().toISOString());
    if (await this.dogs.getActiveDogId(ownerId) === dogId) await this.restoreActiveDog(ownerId);
  }
  async restoreActiveDog(ownerId: string): Promise<string | null> {
    const current = await this.dogs.getActiveDogId(ownerId);
    if (current) { const dog = await this.dogs.getDog(current); if (dog?.ownerId === ownerId && !dog.archivedAt) return current; }
    const next = (await this.dogs.listDogs(ownerId)).find((dog) => !dog.archivedAt) ?? null;
    await this.dogs.setActiveDogId(ownerId, next?.id ?? null); return next?.id ?? null;
  }
  async switchActiveDog(ownerId: string, dogId: string): Promise<void> { const dog = await this.dogs.getDog(dogId); assertOwnedActiveDog(dog, ownerId); await this.dogs.setActiveDogId(ownerId, dogId); }
  private async refreshProfileStatus(dog: Dog): Promise<Dog> { const profileStatus = calculateProfileStatus(dog, await this.dogs.listPhotos(dog.id)); return profileStatus === dog.profileStatus ? dog : this.dogs.updateDog(dog.id, { profileStatus }); }
}

export class AccountService {
  constructor(private readonly auth: AuthProvider, private readonly consents: ConsentRepository) {}
  async signUp(input: { email: string; password: string; displayName?: string; termsVersion: string; privacyNoticeVersion: string; locale: string; termsHash: string; privacyNoticeHash: string }): Promise<{ userId: string }> {
    if (!input.termsVersion || !input.privacyNoticeVersion) throw new AppError("VALIDATION_ERROR", "Current Terms and Privacy Notice acceptance is required.");
    const user = await this.auth.signUp(input.email, input.password, input.displayName ? { displayName: input.displayName } : {});
    await Promise.all([this.consents.recordRequiredConsent({ ownerId: user.userId, documentType: "TERMS", version: input.termsVersion, locale: input.locale, integrityHash: input.termsHash }), this.consents.recordRequiredConsent({ ownerId: user.userId, documentType: "PRIVACY_NOTICE", version: input.privacyNoticeVersion, locale: input.locale, integrityHash: input.privacyNoticeHash })]);
    return user;
  }
}
