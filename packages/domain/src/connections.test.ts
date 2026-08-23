import { describe, expect, it } from "vitest";
import {
  AppError,
  ConnectionService,
  ConversationService,
  type CandidateRecord,
  type ConnectionRecord,
  type ConversationRecord,
  type InterestRecord,
  type MatchingRepository,
  type MessageRecord,
  type BlockRecord,
  type ReportRecord,
} from "./index.js";

const nowIso = "2026-08-23T12:00:00.000Z";

const connection = (overrides: Partial<ConnectionRecord> = {}): ConnectionRecord => ({
  id: "conn-1", lowerDogId: "dog-a", higherDogId: "dog-b", status: "ACTIVE", createdAt: nowIso, updatedAt: nowIso,
  ...overrides,
});

class MemoryM3 implements MatchingRepository {
  dogs = new Map<string, { id: string; ownerId: string }>();
  connections: ConnectionRecord[] = [];
  conversations = new Map<string, ConversationRecord>();
  messages: MessageRecord[] = [];
  confirms = new Map<string, Set<string>>();
  interests = new Map<string, InterestRecord>();

  async getDog(id: string) { return (this.dogs.get(id) as unknown as CandidateRecord) ?? null; }
  async findConnectionById(id: string) { return this.connections.find((c) => c.id === id) ?? null; }
  async listConnectionsByOwner(ownerId: string) {
    return this.connections.filter((c) => {
      const a = this.dogs.get(c.lowerDogId); const b = this.dogs.get(c.higherDogId);
      return a?.ownerId === ownerId || b?.ownerId === ownerId;
    });
  }
  async updateConnection(id: string, update: Partial<ConnectionRecord>) {
    const found = this.connections.find((c) => c.id === id)!;
    const next = { ...found, ...update };
    this.connections[this.connections.indexOf(found)] = next;
    return next;
  }
  async getConversationForConnection(connectionId: string) { return this.conversations.get(connectionId) ?? null; }
  async getConversation(id: string) { return [...this.conversations.values()].find((c: ConversationRecord) => c.id === id) ?? null; }
  async createConversation(record: ConversationRecord) { this.conversations.set(record.connectionId, record); return record; }
  async listMessages(conversationId: string) { return this.messages.filter((m) => m.conversationId === conversationId); }
  async addMessage(message: MessageRecord) { this.messages.push(message); return message; }
  async listProceedConfirmations(connectionId: string) { return [...(this.confirms.get(connectionId) ?? new Set())]; }
  async addProceedConfirmation(connectionId: string, ownerId: string) {
    const set = this.confirms.get(connectionId) ?? new Set<string>();
    set.add(ownerId); this.confirms.set(connectionId, set);
  }
  blocks = new Map<string, BlockRecord>();
  reports: ReportRecord[] = [];
  async getBlock(blockerId: string, blockedId: string) { return this.blocks.get(`${blockerId}->${blockedId}`) ?? null; }
  async anyBlockBetween(ownerA: string, ownerB: string) { return this.blocks.has(`${ownerA}->${ownerB}`) || this.blocks.has(`${ownerB}->${ownerA}`); }
  async addBlock(block: BlockRecord) { this.blocks.set(`${block.blockerId}->${block.blockedId}`, block); return block; }
  async removeBlock(blockerId: string, blockedId: string) { this.blocks.delete(`${blockerId}->${blockedId}`); }
  async addReport(report: ReportRecord) { this.reports.push(report); return report; }

  // Unused M2 members, present to satisfy the interface.
  async getPreferences() { return null; } async savePreferences(input: never) { return input; }
  async listCandidates() { return []; } async listPasses() { return []; } async getPass() { return null; }
  async addPass(input: never) { return input; } async removePass() {}
  async listInterestsBySource() { return []; } async listInterestsByTarget() { return []; }
  async createInterest(interest: InterestRecord) { return interest; } async getInterest() { return null; }
  async updateInterest(id: string, update: Partial<InterestRecord>) {
    const found = [...this.interests.values()].find((i) => i.id === id)!;
    return { ...found, ...update };
  }
  async findOpenConnection(lowerDogId: string, higherDogId: string) {
    return this.connections.find((c) => c.status === "ACTIVE" && ((c.lowerDogId === lowerDogId && c.higherDogId === higherDogId) || (c.lowerDogId === higherDogId && c.higherDogId === lowerDogId))) ?? null;
  }
  async listConnectionsByDog(dogId: string) { return this.connections.filter((c: ConnectionRecord) => c.lowerDogId === dogId || c.higherDogId === dogId); }
  async createConnection(conn: ConnectionRecord) { this.connections.push(conn); return conn; }
}

function setup() {
  const repo = new MemoryM3();
  repo.dogs.set("dog-a", { id: "dog-a", ownerId: "owner-a" });
  repo.dogs.set("dog-b", { id: "dog-b", ownerId: "owner-b" });
  repo.connections.push(connection());
  return repo;
}

describe("connection lifecycle", () => {
  it("shows connections only to the two participating owners", async () => {
    const repo = setup();
    const service = new ConnectionService(repo);
    expect((await service.list("owner-a")).map((c) => c.id)).toEqual(["conn-1"]);
    expect(await service.list("owner-x")).toEqual([]);
  });
  it("either owner can end an active connection exactly once", async () => {
    const repo = setup();
    const service = new ConnectionService(repo);
    await expect(service.end("owner-x", "conn-1")).rejects.toMatchObject({ code: "FORBIDDEN" });
    const ended = await service.end("owner-b", "conn-1");
    expect(ended.status).toBe("CLOSED");
    await expect(service.end("owner-a", "conn-1")).rejects.toMatchObject({ code: "CONFLICT" }); // already closed
  });
  it("requires both owners to confirm proceeding and is idempotent per owner", async () => {
    const repo = setup();
    const service = new ConnectionService(repo);
    await expect(service.confirmProceeding("owner-x", "conn-1")).rejects.toMatchObject({ code: "FORBIDDEN" });
    const first = await service.confirmProceeding("owner-a", "conn-1");
    expect(first.status).toBe("ACTIVE"); // one confirmation is not enough
    const duplicate = await service.confirmProceeding("owner-a", "conn-1");
    expect(duplicate.status).toBe("ACTIVE"); // idempotent
    const second = await service.confirmProceeding("owner-b", "conn-1");
    expect(second.status).toBe("PROCEEDING"); // both confirmed
  });
});

describe("conversation", () => {
  it("creates exactly one conversation with the connection and authorizes participants only", async () => {
    const repo = setup();
    const convos = new ConversationService(repo);
    await expect(convos.ensure("owner-x", "conn-1")).rejects.toMatchObject({ code: "FORBIDDEN" });
    const convoA = await convos.ensure("owner-a", "conn-1");
    const convoB = await convos.ensure("owner-b", "conn-1");
    expect(convoA.id).toBe(convoB.id); // same conversation for both
  });
  it("lets participants exchange messages but blocks non-participants", async () => {
    const repo = setup();
    const convos = new ConversationService(repo);
    const convo = await convos.ensure("owner-a", "conn-1");
    await convos.send("owner-a", convo.id, "Hello from Ada's owner!");
    await expect(convos.send("owner-x", convo.id, "intrusion")).rejects.toMatchObject({ code: "FORBIDDEN" });
    const thread = await convos.messages("owner-b", convo.id);
    expect(thread).toHaveLength(1);
    expect(thread[0]!.body).toBe("Hello from Ada's owner!");
  });
  it("makes the conversation read-only once the connection closes", async () => {
    const repo = setup();
    const convos = new ConversationService(repo);
    const connections = new ConnectionService(repo);
    const convo = await convos.ensure("owner-a", "conn-1");
    await connections.end("owner-a", "conn-1");
    await expect(convos.send("owner-a", convo.id, "too late")).rejects.toMatchObject({ code: "CONFLICT" });
    // History stays readable.
    expect((await convos.messages("owner-a", convo.id))).toHaveLength(0);
  });
});
