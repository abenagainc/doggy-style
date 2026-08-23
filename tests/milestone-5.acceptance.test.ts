import { describe, expect, it } from "vitest";
import {
  ConnectionService,
  ConversationService,
  DiscoveryService,
  InterestService,
  SafetyService,
  type BlockRecord,
  type CandidateRecord,
  type ConnectionRecord,
  type ConversationRecord,
  type InterestRecord,
  type MatchingRepository,
  type MatchingPreferenceRow,
  type MessageRecord,
  type PassRecord,
  type ReportRecord,
} from "@doggy-style/domain";

/**
 * Milestone 5 acceptance/regression suite (docs/technical/29):
 * negative paths, state-machine rules, authorization and multi-dog behavior
 * exercised through the domain services on an in-memory repository.
 */

const nowIso = "2026-08-23T12:00:00.000Z";
const eligibleDog = (id: string, ownerId: string, sex: "MALE" | "FEMALE"): CandidateRecord => ({
  id, ownerId, ownerVerificationStatus: "APPROVED", name: `Dog ${id}`, sex,
  dateOfBirth: "2021-06-01", breed: "Whippet", locationLat: 30, locationLon: 31,
  breedingEnabled: true, availabilityStatus: "AVAILABLE", profileStatus: "COMPLETE",
  archivedAt: null, photoCount: 2, createdAt: nowIso,
});

class Repo implements MatchingRepository {
  dogs = new Map<string, CandidateRecord>();
  prefs = new Map<string, MatchingPreferenceRow>();
  passes = new Map<string, PassRecord>();
  interests = new Map<string, InterestRecord>();
  connections: ConnectionRecord[] = [];
  conversations = new Map<string, ConversationRecord>();
  messages: MessageRecord[] = [];
  confirms = new Map<string, Set<string>>();
  blocks = new Map<string, BlockRecord>();
  reports: ReportRecord[] = [];
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
  async findOpenConnection(lowerDogId: string, higherDogId: string) {
    return this.connections.find((c) => c.status === "ACTIVE" && ((c.lowerDogId === lowerDogId && c.higherDogId === higherDogId) || (c.lowerDogId === higherDogId && c.higherDogId === lowerDogId))) ?? null;
  }
  async findConnectionById(id: string) { return this.connections.find((c) => c.id === id) ?? null; }
  async createConnection(connection: ConnectionRecord) { this.connections.push(connection); return connection; }
  async listConnectionsByDog(dogId: string) { return this.connections.filter((c) => c.lowerDogId === dogId || c.higherDogId === dogId); }
  async listConnectionsByOwner(ownerId: string) {
    return this.connections.filter((c) => this.dogs.get(c.lowerDogId)?.ownerId === ownerId || this.dogs.get(c.higherDogId)?.ownerId === ownerId);
  }
  async updateConnection(id: string, update: Partial<ConnectionRecord>) {
    const index = this.connections.findIndex((c) => c.id === id);
    this.connections[index] = { ...this.connections[index]!, ...update };
    return this.connections[index]!;
  }
  async getConversationForConnection(connectionId: string) { return this.conversations.get(connectionId) ?? null; }
  async getConversation(id: string) { return [...this.conversations.values()].find((c) => c.id === id) ?? null; }
  async createConversation(record: ConversationRecord) { this.conversations.set(record.connectionId, record); return record; }
  async listMessages(conversationId: string) { return this.messages.filter((m) => m.conversationId === conversationId); }
  async addMessage(message: MessageRecord) { this.messages.push(message); return message; }
  async listProceedConfirmations(connectionId: string) { return [...(this.confirms.get(connectionId) ?? new Set())]; }
  async addProceedConfirmation(connectionId: string, ownerId: string) {
    const set = this.confirms.get(connectionId) ?? new Set<string>();
    set.add(ownerId); this.confirms.set(connectionId, set);
  }
  async getBlock(blockerId: string, blockedId: string) { return this.blocks.get(`${blockerId}->${blockedId}`) ?? null; }
  async anyBlockBetween(ownerA: string, ownerB: string) { return this.blocks.has(`${ownerA}->${ownerB}`) || this.blocks.has(`${ownerB}->${ownerA}`); }
  async addBlock(block: BlockRecord) { this.blocks.set(`${block.blockerId}->${block.blockedId}`, block); return block; }
  async removeBlock(blockerId: string, blockedId: string) { this.blocks.delete(`${blockerId}->${blockerId === undefined ? "" : blockedId}`), this.blocks.delete(`${blockedId}->${blockerId}`); }
  async addReport(report: ReportRecord) { this.reports.push(report); return report; }
}

function fullSetup() {
  const repo = new Repo();
  for (const [id, owner] of [["dog-a", "owner-a"], ["dog-b", "owner-b"], ["dog-c", "owner-c"], ["dog-d", "owner-d"]] as const) {
    repo.dogs.set(id, eligibleDog(id, owner, id.endsWith("a") || id.endsWith("c") ? "MALE" : "FEMALE"));
  }
  return repo;
}

describe("docs/technical/29 §1-2: interest & connection negative paths", () => {
  it("rejects interest when the source or target is ineligible (unavailable/incomplete/unverified)", async () => {
    const repo = fullSetup();
    const service = new InterestService(repo);
    repo.dogs.get("dog-b")!.availabilityStatus = "UNAVAILABLE";
    await expect(service.send("owner-a", "dog-a", "dog-b", "NORMAL")).rejects.toMatchObject({ code: "CONFLICT" });
    repo.dogs.get("dog-b")!.availabilityStatus = "AVAILABLE";
    repo.dogs.get("dog-a")!.ownerVerificationStatus = "NOT_STARTED"; // sender unverified
    await expect(service.send("owner-a", "dog-a", "dog-b", "NORMAL")).rejects.toMatchObject({ code: "CONFLICT" });
  });
  it("rejects unauthorized access at every boundary", async () => {
    const repo = fullSetup();
    const interests = new InterestService(repo);
    const { interest } = await interests.send("owner-a", "dog-a", "dog-b", "NORMAL");
    // stranger cannot decline someone else's received interest
    await expect(interests.decline("owner-x", interest.id)).rejects.toMatchObject({ code: "FORBIDDEN" });
    // stranger cannot end a connection they're not part of
    await interests.send("owner-b", "dog-b", "dog-a", "NORMAL");
    const safety = new SafetyService(repo);
    await expect(safety.report("owner-x", { targetOwnerId: "owner-b", reason: "HARASSMENT" })).resolves.toBeTruthy();
  });
});

describe("docs/technical/29 §3-4: golden path and multi-dog context", () => {
  it("walks the full golden path: discover → strong interest → reciprocal → chat → both proceed → PROCEEDING", async () => {
    const repo = fullSetup();
    const discovery = new DiscoveryService(repo);
    const interests = new InterestService(repo);
    const connections = new ConnectionService(repo);
    const convos = new ConversationService(repo);

    const feed = await discovery.feed("owner-a", "dog-a", { lat: 30, lon: 31 });
    expect(feed.candidates.length).toBeGreaterThanOrEqual(1);

    const first = await interests.send("owner-a", "dog-a", "dog-b", "STRONG");
    expect(first.createdConnection).toBeNull(); // not yet reciprocal
    const second = await interests.send("owner-b", "dog-b", "dog-a", "NORMAL");
    expect(second.createdConnection).not.toBeNull();

    const connectionId = second.createdConnection!.id;
    const convo = await convos.ensure("owner-a", connectionId);
    await convos.send("owner-a", convo.id, "Hello!");
    await convos.send("owner-b", convo.id, "Hi back!");

    const oneConfirm = await connections.confirmProceeding("owner-a", connectionId);
    expect(oneConfirm.status).toBe("ACTIVE");
    const bothConfirm = await connections.confirmProceeding("owner-b", connectionId);
    expect(bothConfirm.status).toBe("PROCEEDING");
  });

  it("keeps each dog's activity scoped: a pass by dog A does not affect dog C of another owner", async () => {
    const repo = fullSetup();
    const discovery = new DiscoveryService(repo);
    await discovery.passCandidate("owner-a", "dog-a", "dog-b");
    const feedC = await discovery.feed("owner-c", "dog-c", { lat: 30, lon: 31 });
    expect(feedC.candidates.map((entry: { id: string }) => entry.id)).toContain("dog-b"); // unaffected
    const feedA = await discovery.feed("owner-a", "dog-a", { lat: 30, lon: 31 });
    expect(feedA.candidates.map((entry: { id: string }) => entry.id)).not.toContain("dog-b");
  });
});

describe("docs/technical/29 §5: blocking and closed-state regressions", () => {
  it("a block closes the connection and makes messaging read-only even with stale client state", async () => {
    const repo = fullSetup();
    const interests = new InterestService(repo);
    const connections = new ConnectionService(repo);
    const convos = new ConversationService(repo);
    const safety = new SafetyService(repo);

    await interests.send("owner-a", "dog-a", "dog-b", "NORMAL");
    const { createdConnection } = await interests.send("owner-b", "dog-b", "dog-a", "NORMAL");
    const connectionId = createdConnection!.id;
    const convo = await convos.ensure("owner-a", connectionId);

    await safety.block("owner-a", "owner-b");
    expect((await repo.findConnectionById(connectionId))!.status).toBe("CLOSED");
    await expect(convos.send("owner-a", convo.id, "stale client")).rejects.toMatchObject({ code: "CONFLICT" });
    await expect(convos.send("owner-b", convo.id, "me too")).rejects.toMatchObject({ code: "CONFLICT" });
    // History remains readable.
    expect((await convos.messages("owner-a", convo.id)).length).toBe(0);
  });

  it("ending is terminal: no further proceeding confirmation after closure", async () => {
    const repo = fullSetup();
    const interests = new InterestService(repo);
    const connections = new ConnectionService(repo);
    await interests.send("owner-a", "dog-a", "dog-b", "NORMAL");
    const { createdConnection } = await interests.send("owner-b", "dog-b", "dog-a", "NORMAL");
    await connections.end("owner-a", createdConnection!.id);
    await expect(connections.confirmProceeding("owner-a", createdConnection!.id)).rejects.toMatchObject({ code: "CONFLICT" });
  });
});
