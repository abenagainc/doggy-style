import { describe, expect, it } from "vitest";
import { AppError, type Dog, type DogPhoto, type DogRepository, DogService, calculateProfileStatus } from "./index.js";

const dog = (overrides: Partial<Dog> = {}): Dog => ({ id: "dog-a", ownerId: "owner-a", name: "Ada", sex: "FEMALE", dateOfBirth: "2020-01-01", breed: "Whippet", location: null, breedingEnabled: false, availabilityStatus: "UNAVAILABLE", profileStatus: "INCOMPLETE", archivedAt: null, createdAt: "2026-01-01", updatedAt: "2026-01-01", ...overrides });
class MemoryDogs implements DogRepository {
  records = new Map<string, Dog>(); photos = new Map<string, DogPhoto[]>(); active = new Map<string, string | null>();
  async getDog(id: string) { return this.records.get(id) ?? null; }
  async listDogs(ownerId: string) { return [...this.records.values()].filter((item) => item.ownerId === ownerId); }
  async createDog(ownerId: string, data: Pick<Dog, "name" | "sex" | "dateOfBirth" | "breed">) { const result = dog({ ...data, id: `dog-${this.records.size + 1}`, ownerId }); this.records.set(result.id, result); return result; }
  async updateDog(id: string, update: Partial<Dog>) { const result = { ...this.records.get(id)!, ...update }; this.records.set(id, result); return result; }
  async archiveDog(id: string, archivedAt: string) { await this.updateDog(id, { archivedAt, availabilityStatus: "UNAVAILABLE" }); }
  async listPhotos(dogId: string) { return this.photos.get(dogId) ?? []; }
  async addPhoto(dogId: string, storagePath: string) { const photo = { id: `photo-${(this.photos.get(dogId)?.length ?? 0) + 1}`, dogId, storagePath, sortOrder: 0, createdAt: "2026-01-01" }; this.photos.set(dogId, [...(this.photos.get(dogId) ?? []), photo]); return photo; }
  async getActiveDogId(ownerId: string) { return this.active.get(ownerId) ?? null; }
  async setActiveDogId(ownerId: string, dogId: string | null) { this.active.set(ownerId, dogId); }
}

describe("dog domain", () => {
  it("validates the mandatory creation fields", async () => {
    const service = new DogService(new MemoryDogs());
    await expect(service.create("owner-a", { name: "", sex: "FEMALE", dateOfBirth: "2020-01-01", breed: "Whippet" })).rejects.toMatchObject({ code: "VALIDATION_ERROR" } satisfies Partial<AppError>);
  });
  it("tracks progressive profile completeness without inventing extra requirements", () => {
    expect(calculateProfileStatus(dog(), [])).toBe("INCOMPLETE");
    expect(calculateProfileStatus(dog({ location: "Cairo", breedingEnabled: true }), [{ id: "p", dogId: "dog-a", storagePath: "owner-a/dog-a/a.jpg", sortOrder: 0, createdAt: "now" }])).toBe("COMPLETE");
    expect(calculateProfileStatus(dog({ location: "   ", breedingEnabled: true }), [{ id: "p", dogId: "dog-a", storagePath: "owner-a/dog-a/a.jpg", sortOrder: 0, createdAt: "now" }])).toBe("INCOMPLETE");
  });
  it("blocks availability until a profile is complete", async () => {
    const repository = new MemoryDogs(); repository.records.set("dog-a", dog());
    await expect(new DogService(repository).setAvailability("owner-a", "dog-a", "AVAILABLE")).rejects.toMatchObject({ code: "CONFLICT" });
  });
  it("never permits another owner to read or modify a dog through the domain service", async () => {
    const repository = new MemoryDogs(); repository.records.set("dog-a", dog());
    await expect(new DogService(repository).update("owner-b", "dog-a", { name: "Stolen" })).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
  it("restores a valid active dog when the remembered dog was archived", async () => {
    const repository = new MemoryDogs(); repository.records.set("old", dog({ id: "old", archivedAt: "2026-01-02" })); repository.records.set("new", dog({ id: "new" })); repository.active.set("owner-a", "old");
    await expect(new DogService(repository).restoreActiveDog("owner-a")).resolves.toBe("new");
    expect(repository.active.get("owner-a")).toBe("new");
  });
  it("requires owner and dog ids in every upload path", async () => {
    const repository = new MemoryDogs(); repository.records.set("dog-a", dog());
    await expect(new DogService(repository).addPhoto("owner-a", "dog-a", "owner-b/dog-a/photo.jpg")).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
  });
});
