import type { Dog, DogPhoto } from "./dogs.js";

export interface DogRepository {
  getDog(id: string): Promise<Dog | null>;
  listDogs(ownerId: string): Promise<Dog[]>;
  createDog(ownerId: string, dog: Pick<Dog, "name" | "sex" | "dateOfBirth" | "breed">): Promise<Dog>;
  updateDog(id: string, update: Partial<Dog>): Promise<Dog>;
  archiveDog(id: string, archivedAt: string): Promise<void>;
  listPhotos(dogId: string): Promise<DogPhoto[]>;
  addPhoto(dogId: string, storagePath: string): Promise<DogPhoto>;
  getActiveDogId(ownerId: string): Promise<string | null>;
  setActiveDogId(ownerId: string, dogId: string | null): Promise<void>;
}

export interface AuthProvider {
  signUp(email: string, password: string, metadata: { displayName?: string }): Promise<{ userId: string }>;
  signIn(email: string, password: string): Promise<void>;
  signOut(): Promise<void>;
  requestPasswordRecovery(email: string, redirectTo: string): Promise<void>;
}

export interface ConsentRepository { recordRequiredConsent(input: { ownerId: string; documentType: "TERMS" | "PRIVACY_NOTICE"; version: string; locale: string; integrityHash: string }): Promise<void>; }
