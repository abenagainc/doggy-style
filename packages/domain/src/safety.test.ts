import { describe, expect, it } from "vitest";
import {
  AppError,
  SafetyService,
  type BlockRecord,
  type ConnectionRecord,
  type CandidateRecord,
  type MatchingRepository,
  type ReportRecord,
} from "./index.js";

const nowIso = "2026-08-23T12:00:00.000Z";

const dog = (id: string, ownerId: string): CandidateRecord => ({
  id, ownerId, ownerVerificationStatus: "APPROVED", name: `Dog ${id}`, sex: id.endsWith("a") ? "MALE" : "FEMALE",
  dateOfBirth: "2021-01-01", breed: "Whippet", locationLat: null, locationLon: null,
  breedingEnabled: true, availabilityStatus: "AVAILABLE", profileStatus: "COMPLETE",
  archivedAt: null, photoCount: 1, createdAt: nowIso,
});

class MemorySafety implements MatchingRepository {
  dogs = new Map<string, CandidateRecord>();
  connections: ConnectionRecord[] = [];
  blocks = new Map<string, BlockRecord>();
  reports: ReportRecord[] = [];
  messagesByConnection = new Map<string, { senderOwnerId: string; body: string }[]>();
  conversations = new Map<string, string>(); // connectionId -> conversationId
  connectionCloseReasons = new Map<string, string>();

  key = (a: string, b: string) => [a, b].sort().join("|");

  async getDog(id: string) { return this.dogs.get(id) ?? null; }
  async listCandidates() { return [...this.dogs.values()]; }
  async findOpenConnection(lowerDogId: string, higherDogId: string) {
    return this.connections.find((c) => c.status === "ACTIVE" && ((c.lowerDogId === lowerDogId && c.higherDogId === higherDogId) || (c.lowerDogId === higherDogId && c.higherDogId === lowerDogId))) ?? null;
  }
  async listConnectionsByOwner(ownerId: string) {
    return this.connections.filter((c) => {
      const a = this.dogs.get(c.lowerDogId); const b = this.dogs.get(c.higherDogId);
      return a?.ownerId === ownerId || b?.ownerId === ownerId;
    });
  }
  async updateConnection(id: string, update: Partial<ConnectionRecord>) {
    const index = this.connections.findIndex((c) => c.id === id);
    this.connections[index] = { ...this.connections[index]!, ...update };
    if (update.status === "CLOSED") this.connectionCloseReasons.set(id, (update as { closedReason?: string }).closedReason ?? "UNKNOWN");
    return this.connections[index]!;
  }
  async getBlock(blockerId: string, blockedId: string) { return this.blocks.get(`${blockerId}->${blockedId}`) ?? null; }
  async anyBlockBetween(ownerA: string, ownerB: string) {
    const forward = this.blocks.get(`${ownerA}->${ownerB}`); const back = this.blocks.get(`${ownerB}->${ownerA}`);
    return Boolean(forward ?? back);
  }
  async addBlock(block: BlockRecord) { this.blocks.set(`${block.blockerId}->${block.blockedId}`, block); return block; }
  async removeBlock(blockerId: string, blockedId: string) { this.blocks.delete(`${blockerId}->${blockedId}`); }
  async addReport(report: ReportRecord) { this.reports.push(report); return report; }

  // Unused interface members.
  async getPreferences() { return null; } async savePreferences(input: never) { return input; }
  async listPasses() { return []; } async getPass() { return null; } async addPass(input: never) { return input; }
  async removePass() {} async listInterestsBySource() { return []; } async listInterestsByTarget() { return []; }
  async createInterest(interest: never) { return interest; } async getInterest() { return null; }
  async updateInterest(id: never, update: never) { return update; }
  async createConnection(conn: ConnectionRecord) { this.connections.push(conn); return conn; }
  async listConnectionsByDog(dogId: string) { return this.connections.filter((c) => c.lowerDogId === dogId || c.higherDogId === dogId); }
  async findConnectionById(id: string) { return this.connections.find((c) => c.id === id) ?? null; }
  async getConversationForConnection(connectionId: string) { return this.conversations.has(connectionId) ? { id: this.conversations.get(connectionId)!, connectionId, createdAt: nowIso } : null; }
  async getConversation(id: string) { for (const [connId, convoId] of this.conversations) if (convoId === id) return { id, connectionId: connId, createdAt: nowIso }; return null; }
  async createConversation(record: { id: string; connectionId: string; createdAt: string }) { this.conversations.set(record.connectionId, record.id); return record; }
  async listMessages() { return []; }
  async addMessage(message: never) { return message; }
  async listProceedConfirmations() { return []; }
  async addProceedConfirmation() {}
}

function setupWithConnection() {
  const repo = new MemorySafety();
  repo.dogs.set("dog-a", dog("dog-a", "owner-a"));
  repo.dogs.set("dog-b", dog("dog-b", "owner-b"));
  repo.connections.push({ id: "conn-1", lowerDogId: "dog-a", higherDogId: "dog-b", status: "ACTIVE", createdAt: nowIso, updatedAt: nowIso });
  repo.conversations.set("conn-1", "convo-1");
  return repo;
}

describe("blocking (DECISIONS.md #6)", () => {
  it("an owner can block another owner once; duplicates are rejected", async () => {
    const repo = setupWithConnection();
    const service = new SafetyService(repo);
    await service.block("owner-a", "owner-b");
    await expect(service.block("owner-a", "owner-b")).rejects.toMatchObject({ code: "CONFLICT" });
  });
  it("blocking closes existing open connections between the two owners with reason BLOCKED", async () => {
    const repo = setupWithConnection();
    const service = new SafetyService(repo);
    await service.block("owner-a", "owner-b");
    expect(repo.connections[0]!.status).toBe("CLOSED");
    expect(repo.connectionCloseReasons.get("conn-1")).toBe("BLOCKED");
  });
  it("unblocking does not reopen closed connections or restore interests", async () => {
    const repo = setupWithConnection();
    const service = new SafetyService(repo);
    await service.block("owner-a", "owner-b");
    await service.unblock("owner-a", "owner-b");
    expect(repo.connections[0]!.status).toBe("CLOSED"); // stays closed
  });
  it("only the blocker can remove their own block", async () => {
    const repo = setupWithConnection();
    const service = new SafetyService(repo);
    await service.block("owner-a", "owner-b");
    await service.unblock("owner-b", "owner-a"); // no block in that direction
    expect(repo.blocks.size).toBe(1); // untouched
  });
  it("self-blocking is invalid", async () => {
    const service = new SafetyService(setupWithConnection());
    await expect(service.block("owner-a", "owner-a")).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
  });
});

describe("reporting (DECISIONS.md #9)", () => {
  it("creates a moderation case with context references", async () => {
    const repo = setupWithConnection();
    const service = new SafetyService(repo);
    const report = await service.report("owner-a", { targetOwnerId: "owner-b", reason: "HARASSMENT", details: "Rude messages" });
    expect(report.caseId).toMatch(/^case-/);
    expect(report.status).toBe("OPEN");
  });
  it("requires an authenticated reporter and a valid reason", async () => {
    const service = new SafetyService(setupWithConnection());
    await expect(service.report("", { targetOwnerId: "owner-b", reason: "HARASSMENT" })).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    await expect(service.report("owner-a", { targetOwnerId: "owner-b", reason: "BECAUSE" as never })).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
  });
});
