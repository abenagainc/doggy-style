import { describe, expect, it } from "vitest";
import {
  AppError,
  DiscoveryService,
  InterestService,
  validatePreferences,
  type CandidateRecord,
  type ConnectionRecord,
  type ConversationRecord,
  type InterestRecord,
  type MatchingRepository,
  type MatchingPreferenceRow,
  type MessageRecord,
  type BlockRecord,
  type ReportRecord,
  type PassRecord,
  type PreferenceLevel,
} from "./index.js";

const nowIso = "2026-08-23T12:00:00.000Z";

const candidate = (overrides: Partial<CandidateRecord> = {}): CandidateRecord => ({
  id: "dog-b", ownerId: "owner-b", ownerVerificationStatus: "APPROVED", name: "Luna", sex: "FEMALE",
  dateOfBirth: "2021-06-01", breed: "Whippet", locationLat: 30.05, locationLon: 31.23,
  breedingEnabled: true, availabilityStatus: "AVAILABLE", profileStatus: "COMPLETE",
  archivedAt: null, photoCount: 3, createdAt: "2026-01-01", ...overrides,
});

const preferences = (overrides: Partial<MatchingPreferenceRow> = {}): MatchingPreferenceRow => ({
  dogId: "dog-a",
  preferredBreeds: [{ level: "PREFERRED" as PreferenceLevel, value: "Whippet" }],
  requiredBreeds: [],
  ageMinMonths: 12,
  ageMaxMonths: 96,
  maxDistanceKm: 50,
  updatedAt: nowIso,
  ...overrides,
});

class MemoryMatching implements MatchingRepository {
  prefs = new Map<string, MatchingPreferenceRow>();
  dogs = new Map<string, CandidateRecord>();
  passes = new Map<string, PassRecord>();
  interests = new Map<string, InterestRecord>();
  connections: ConnectionRecord[] = [];
  key = (a: string, b: string) => `${a}->${b}`;

  async getPreferences(dogId: string) { return this.prefs.get(dogId) ?? null; }
  async savePreferences(prefs: MatchingPreferenceRow) { this.prefs.set(prefs.dogId, prefs); return prefs; }
  async listCandidates() { return [...this.dogs.values()]; }
  async getDog(id: string) { return this.dogs.get(id) ?? null; }
  async listPasses(sourceDogId: string) { return [...this.passes.values()].filter((p) => p.sourceDogId === sourceDogId); }
  async getPass(sourceDogId: string, targetDogId: string) { return this.passes.get(this.key(sourceDogId, targetDogId)) ?? null; }
  async addPass(pass: PassRecord) { this.passes.set(this.key(pass.sourceDogId, pass.targetDogId), pass); return pass; }
  async removePass(sourceDogId: string, targetDogId: string) { this.passes.delete(this.key(sourceDogId, targetDogId)); }
  async listInterestsBySource(sourceDogId: string) { return [...this.interests.values()].filter((i) => i.sourceDogId === sourceDogId); }
  async listInterestsByTarget(targetDogId: string) { return [...this.interests.values()].filter((i) => i.targetDogId === targetDogId); }
  async createInterest(interest: InterestRecord) { this.interests.set(this.key(interest.sourceDogId, interest.targetDogId), interest); return interest; }
  async getInterest(id: string) { return [...this.interests.values()].find((i) => i.id === id) ?? null; }
  async updateInterest(id: string, update: Partial<InterestRecord>) {
    const found = [...this.interests.values()].find((i) => i.id === id)!;
    const next = { ...found, ...update };
    this.interests.set(this.key(next.sourceDogId, next.targetDogId), next);
    return next;
  }
  async findConnectionById(id: string) { return this.connections.find((c) => c.id === id) ?? null; }
  async createConnection(connection: ConnectionRecord) { this.connections.push(connection); return connection; }
  async listConnectionsByDog(dogId: string) { return this.connections.filter((c) => c.lowerDogId === dogId || c.higherDogId === dogId); }
  async listConnectionsByOwner() { return []; }
  async findOpenConnection(lowerDogId: string, higherDogId: string) {
    return this.connections.find((c) => c.status === "ACTIVE" && ((c.lowerDogId === lowerDogId && c.higherDogId === higherDogId) || (c.lowerDogId === higherDogId && c.higherDogId === lowerDogId))) ?? null;
  }
  async updateConnection(id: string, update: Partial<ConnectionRecord>) {
    const index = this.connections.findIndex((c) => c.id === id);
    const next = { ...this.connections[index]!, ...update };
    this.connections[index] = next;
    return next;
  }
  conversationsByConnection = new Map<string, ConversationRecord>();
  async getConversationForConnection(connectionId: string) { return this.conversationsByConnection.get(connectionId) ?? null; }
  async getConversation(id: string) { return [...this.conversationsByConnection.values()].find((c) => c.id === id) ?? null; }
  async createConversation(record: ConversationRecord) { this.conversationsByConnection.set(record.connectionId, record); return record; }
  messageLog: MessageRecord[] = [];
  async listMessages(conversationId: string) { return this.messageLog.filter((m) => m.conversationId === conversationId); }
  async addMessage(message: MessageRecord) { this.messageLog.push(message); return message; }
  proceedConfirms = new Map<string, Set<string>>();
  async listProceedConfirmations(connectionId: string) { return [...(this.proceedConfirms.get(connectionId) ?? new Set())]; }
  async addProceedConfirmation(connectionId: string, ownerId: string) {
    const set = this.proceedConfirms.get(connectionId) ?? new Set<string>();
    set.add(ownerId); this.proceedConfirms.set(connectionId, set);
  }
  blocks = new Map<string, BlockRecord>();
  reports: ReportRecord[] = [];
  async getBlock(blockerId: string, blockedId: string) { return this.blocks.get(`${blockerId}->${blockedId}`) ?? null; }
  async anyBlockBetween(ownerA: string, ownerB: string) { return this.blocks.has(`${ownerA}->${ownerB}`) || this.blocks.has(`${ownerB}->${ownerA}`); }
  async addBlock(block: BlockRecord) { this.blocks.set(`${block.blockerId}->${block.blockedId}`, block); return block; }
  async removeBlock(blockerId: string, blockedId: string) { this.blocks.delete(`${blockerId}->${blockedId}`); }
  async addReport(report: ReportRecord) { this.reports.push(report); return report; }
}

const sourceDog = (overrides: Partial<CandidateRecord> = {}): CandidateRecord =>
  candidate({ id: "dog-a", ownerId: "owner-a", name: "Ada", sex: "MALE", dateOfBirth: "2020-01-01", ...overrides });

function setup() {
  const repo = new MemoryMatching();
  repo.dogs.set("dog-a", sourceDog());
  repo.dogs.set("dog-b", candidate());
  repo.prefs.set("dog-a", preferences());
  return repo;
}

describe("matching preferences", () => {
  it("rejects invalid preference levels and inverted age ranges", () => {
    expect(() => validatePreferences(preferences({ ageMinMonths: 96, ageMaxMonths: 12 }))).toThrow(AppError);
    expect(() => validatePreferences(preferences({ requiredBreeds: [{ level: "SOMETIMES", value: "x" } as never] }))).toThrow(AppError);
    expect(() => validatePreferences(preferences({ maxDistanceKm: -5 }))).toThrow(AppError);
  });
});

describe("discovery feed", () => {
  it("only shows eligible candidates that satisfy hard filters", async () => {
    const repo = setup();
    repo.dogs.set("dog-c", candidate({ id: "dog-c", ownerId: "owner-c", availabilityStatus: "UNAVAILABLE" }));
    repo.dogs.set("dog-d", candidate({ id: "dog-d", ownerId: "owner-d", ownerVerificationStatus: "NOT_STARTED" }));
    repo.dogs.set("dog-e", candidate({ id: "dog-e", ownerId: "owner-a" })); // own dog never appears
    const service = new DiscoveryService(repo, () => new Date(nowIso));
    const feed = await service.feed("owner-a", "dog-a", { lat: 30.05, lon: 31.23 });
    expect(feed.candidates.map((entry) => entry.id)).toEqual(["dog-b"]);
  });
  it("orders the feed by ranking score and reports a distance band, not exact distance", async () => {
    const repo = setup();
    repo.dogs.set("dog-f", candidate({ id: "dog-f", ownerId: "owner-f", breed: "Saluki", locationLat: 30.9, locationLon: 32.2 }));
    const service = new DiscoveryService(repo, () => new Date(nowIso));
    const feed = await service.feed("owner-a", "dog-a", { lat: 30.05, lon: 31.23 });
    expect(feed.candidates[0]!.id).toBe("dog-b"); // preferred breed ranks first
    expect(feed.candidates[0]!.distanceBand).toMatch(/km$/);
    expect(feed.candidates[0]).not.toHaveProperty("distanceKm");
  });
  it("passes hide a candidate from the feed but keep them in review-passed", async () => {
    const repo = setup();
    const service = new DiscoveryService(repo, () => new Date(nowIso));
    await service.passCandidate("owner-a", "dog-a", "dog-b");
    const feed = await service.feed("owner-a", "dog-a", { lat: 30.05, lon: 31.23 });
    expect(feed.candidates).toHaveLength(0);
    expect(feed.exhausted).toBe(true);
    const passed = await service.reviewPassed("owner-a", "dog-a");
    expect(passed.map((entry) => entry.id)).toEqual(["dog-b"]);
  });
  it("only the owning owner can pass or reconsider a candidate", async () => {
    const repo = setup();
    const service = new DiscoveryService(repo, () => new Date(nowIso));
    await expect(service.passCandidate("owner-x", "dog-a", "dog-b")).rejects.toMatchObject({ code: "FORBIDDEN" });
    await service.passCandidate("owner-a", "dog-a", "dog-b");
    await service.reconsiderPassed("owner-a", "dog-a", "dog-b");
    expect(await repo.getPass("dog-a", "dog-b")).toBeNull();
    await service.passCandidate("owner-a", "dog-a", "dog-b");
    await expect(service.reconsiderPassed("owner-x", "dog-a", "dog-b")).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});

describe("interest lifecycle", () => {
  it("creates a NORMAL or STRONG interest with correct strength", async () => {
    const repo = setup();
    const service = new InterestService(repo, () => new Date(nowIso));
    const { interest: strong } = await service.send("owner-a", "dog-a", "dog-b", "STRONG");
    expect(strong.strength).toBe("STRONG");
    expect(strong.status).toBe("ACTIVE");
  });
  it("prevents duplicate active interest and self-interest", async () => {
    const repo = setup();
    const service = new InterestService(repo, () => new Date(nowIso));
    await service.send("owner-a", "dog-a", "dog-b", "NORMAL");
    await expect(service.send("owner-a", "dog-a", "dog-b", "STRONG")).rejects.toMatchObject({ code: "CONFLICT" });
    await expect(service.send("owner-a", "dog-a", "dog-a", "NORMAL")).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
  });
  it("blocks re-interest during cooldown after a decline, allows it once lapsed; withdrawal works", async () => {
    const repo = setup();
    let clock = new Date(nowIso).getTime();
    const now = () => new Date(clock);
    const service = new InterestService(repo, now);
    const sent = await service.send("owner-a", "dog-a", "dog-b", "NORMAL");
    await service.decline("owner-b", sent.interest.id);
    // During cooldown (5 min default): blocked with a wait hint.
    await expect(service.send("owner-a", "dog-a", "dog-b", "NORMAL")).rejects.toThrow(/cooldown|minute/);
    // After cooldown lapses: allowed again.
    clock += 6 * 60 * 1000;
    const retry = await new InterestService(repo, now).send("owner-a", "dog-a", "dog-b", "NORMAL");
    expect(retry.interest.status).toBe("ACTIVE");
    // Withdrawal still works on a fresh pair.
    const fresh = setup();
    const second = await new InterestService(fresh, now).send("owner-a", "dog-a", "dog-b", "NORMAL");
    await new InterestService(fresh, now).withdraw("owner-a", second.interest.id);
    expect(fresh.interests.get("dog-a->dog-b")!.status).toBe("WITHDRAWN");
  });
  it("creates exactly one connection when interests become reciprocal", async () => {
    const repo = setup();
    const service = new InterestService(repo, () => new Date(nowIso));
    const first = await service.send("owner-a", "dog-a", "dog-b", "STRONG");
    const reciprocal = await service.send("owner-b", "dog-b", "dog-a", "NORMAL");
    expect(reciprocal.createdConnection).not.toBeNull();
    expect(reciprocal.createdConnection!.lowerDogId).toBe("dog-a");
    expect(repo.connections).toHaveLength(1);
    // A retry must return the same connection, never a duplicate.
    const again = await service.send("owner-b", "dog-b", "dog-a", "NORMAL").catch(() => null);
    void first;
    expect(again === null || again.createdConnection?.id === reciprocal.createdConnection!.id).toBe(true);
  });
});
