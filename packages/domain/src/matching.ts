import { AppError } from "./errors.js";
import type { AvailabilityStatus, DogSex, ProfileStatus } from "./dogs.js";

export const preferenceLevels = ["REQUIRED", "PREFERRED", "DONT_CARE"] as const;
export type PreferenceLevel = (typeof preferenceLevels)[number];
export const interestStrengths = ["NORMAL", "STRONG"] as const;
export type InterestStrength = (typeof interestStrengths)[number];
export const interestStatuses = ["ACTIVE", "WITHDRAWN", "DECLINED", "MUTED"] as const;
export type InterestStatus = (typeof interestStatuses)[number];
/** Owner-level trust state; APPROVED is the only discovery-eligible value (DECISIONS.md #2). */
export const verificationStatuses = ["NOT_STARTED", "PENDING", "APPROVED", "REJECTED", "EXPIRED", "NEEDS_UPDATE"] as const;
export type VerificationStatus = (typeof verificationStatuses)[number];

export interface BreedPreference { level: PreferenceLevel; value: string }

/** Owner-entered matching preferences for a dog. Distance is a hard filter bound. */
export interface MatchingPreferenceRow {
  dogId: string;
  requiredBreeds: BreedPreference[];
  preferredBreeds: BreedPreference[];
  ageMinMonths: number;
  ageMaxMonths: number;
  maxDistanceKm: number;
  updatedAt: string;
}

export interface CandidateRecord {
  id: string; ownerId: string; ownerVerificationStatus: VerificationStatus; name: string; sex: DogSex;
  dateOfBirth: string; breed: string; locationLat: number | null; locationLon: number | null;
  breedingEnabled: boolean; availabilityStatus: AvailabilityStatus; profileStatus: ProfileStatus;
  archivedAt: string | null; photoCount: number; createdAt: string;
}

export interface PassRecord { sourceDogId: string; targetDogId: string; passedAt: string }
export interface InterestRecord {
  id: string; sourceDogId: string; targetDogId: string; strength: InterestStrength; status: InterestStatus;
  createdAt: string; updatedAt: string;
}
export interface ConnectionRecord {
  id: string; lowerDogId: string; higherDogId: string; status: "ACTIVE"; createdAt: string; updatedAt: string;
}

/** A feed entry exposes a distance band, never an exact distance (DECISIONS.md #7). */
export interface CandidateFeedEntry extends CandidateRecord {
  distanceBand: string;
  score?: number;
}
export interface DiscoveryFeed { candidates: CandidateFeedEntry[]; exhausted: boolean }

export interface MatchingRepository {
  getPreferences(dogId: string): Promise<MatchingPreferenceRow | null>;
  savePreferences(prefs: MatchingPreferenceRow): Promise<MatchingPreferenceRow>;
  listCandidates(): Promise<CandidateRecord[]>;
  getDog(id: string): Promise<CandidateRecord | null>;
  listPasses(sourceDogId: string): Promise<PassRecord[]>;
  getPass(sourceDogId: string, targetDogId: string): Promise<PassRecord | null>;
  addPass(pass: PassRecord): Promise<PassRecord>;
  removePass(sourceDogId: string, targetDogId: string): Promise<void>;
  listInterestsBySource(sourceDogId: string): Promise<InterestRecord[]>;
  listInterestsByTarget(targetDogId: string): Promise<InterestRecord[]>;
  createInterest(interest: InterestRecord): Promise<InterestRecord>;
  getInterest(id: string): Promise<InterestRecord | null>;
  updateInterest(id: string, update: Partial<InterestRecord>): Promise<InterestRecord>;
  findOpenConnection(lowerDogId: string, higherDogId: string): Promise<ConnectionRecord | null>;
  findConnectionById(id: string): Promise<ConnectionRecord | null>;
  createConnection(connection: ConnectionRecord): Promise<ConnectionRecord>;
  listConnectionsByDog(dogId: string): Promise<ConnectionRecord[]>;
}

// ---------------------------------------------------------------------------
// Preferences
// ---------------------------------------------------------------------------

export function validatePreferences(input: MatchingPreferenceRow): MatchingPreferenceRow {
  const levels = new Set(preferenceLevels);
  for (const group of [input.requiredBreeds, input.preferredBreeds]) {
    if (!Array.isArray(group)) throw new AppError("VALIDATION_ERROR", "Breed preferences must be lists.");
    for (const entry of group) {
      if (!levels.has(entry.level)) throw new AppError("VALIDATION_ERROR", "Invalid preference level.");
      if (!entry.value?.trim()) throw new AppError("VALIDATION_ERROR", "Breed preference values cannot be empty.");
      if (entry.level === "DONT_CARE") throw new AppError("VALIDATION_ERROR", "Don't-care preferences are not stored.");
    }
  }
  if (!Number.isFinite(input.ageMinMonths) || !Number.isFinite(input.ageMaxMonths) || input.ageMinMonths < 0 || input.ageMinMonths > input.ageMaxMonths) {
    throw new AppError("VALIDATION_ERROR", "Age range must be valid and ordered.");
  }
  if (!Number.isFinite(input.maxDistanceKm) || input.maxDistanceKm <= 0) {
    throw new AppError("VALIDATION_ERROR", "Maximum distance must be positive.");
  }
  return input;
}

function ageInMonths(dateOfBirth: string, now: Date): number {
  const birth = new Date(`${dateOfBirth}T00:00:00.000Z`);
  if (Number.isNaN(birth.valueOf())) return Number.NaN;
  return Math.max(0, (now.getTime() - birth.getTime()) / (365.25 * 24 * 3600 * 1000) * 12);
}

export function haversineKm(aLat: number, aLon: number, bLat: number, bLon: number): number {
  const toRad = Math.PI / 180;
  const dLat = (bLat - aLat) * toRad;
  const dLon = (bLon - aLon) * toRad;
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(aLat * toRad) * Math.cos(bLat * toRad) * Math.sin(dLon / 2) ** 2;
  return 6371 * 2 * Math.asin(Math.sqrt(s));
}

/** Public display shows a coarse band only (DECISIONS.md #7). */
export function distanceBand(km: number | null): string {
  if (km === null) return "Distance unknown";
  if (km < 10) return "Within 10 km";
  if (km < 25) return "10–25 km";
  if (km < 50) return "25–50 km";
  if (km < 100) return "50–100 km";
  return "100+ km";
}

// ---------------------------------------------------------------------------
// Eligibility + ranking (docs/product/11)
// ---------------------------------------------------------------------------

export function isEligibleCandidate(dog: CandidateRecord): boolean {
  return (
    dog.archivedAt === null &&
    dog.availabilityStatus === "AVAILABLE" &&
    dog.breedingEnabled &&
    dog.profileStatus === "COMPLETE" &&
    dog.ownerVerificationStatus === "APPROVED" &&
    dog.photoCount > 0 &&
    dog.locationLat !== null && dog.locationLon !== null
  );
}

interface ScoreInput {
  candidate: CandidateRecord;
  candidateAgeMonths: number;
  distanceKm: number | null;
  prefs: MatchingPreferenceRow;
}

export function rankCandidate({ candidate, candidateAgeMonths, distanceKm, prefs }: ScoreInput): number {
  let score = 0;
  if (prefs.preferredBreeds.some((entry) => entry.value.toLowerCase() === candidate.breed.toLowerCase())) score += 40;
  if (prefs.requiredBreeds.length > 0 && !prefs.requiredBreeds.some((entry) => entry.value.toLowerCase() === candidate.breed.toLowerCase())) score -= 1000; // hard-excluded earlier anyway
  if (distanceKm !== null) score += Math.max(0, 30 - distanceKm / 4); // closer ranks higher
  if (candidate.ownerVerificationStatus === "APPROVED") score += 15;
  if (candidateAgeMonths >= prefs.ageMinMonths && candidateAgeMonths <= prefs.ageMaxMonths) score += 10;
  score += Math.min(5, candidate.photoCount);
  return score;
}

// ---------------------------------------------------------------------------
// Services
// ---------------------------------------------------------------------------

const verificationRank = { APPROVED: 1 } as const;

export class DiscoveryService {
  constructor(private readonly repo: MatchingRepository, private readonly now: () => Date = () => new Date()) {}

  async setPreferences(ownerId: string, dogId: string, input: Omit<MatchingPreferenceRow, "dogId" | "updatedAt"> & { dogId?: string }): Promise<MatchingPreferenceRow> {
    const dog = await this.repo.getDog(dogId);
    if (!dog || dog.ownerId !== ownerId || dog.archivedAt) throw new AppError("FORBIDDEN", "You do not have access to this dog.");
    const row = validatePreferences({ ...input, dogId, updatedAt: this.now().toISOString() });
    return this.repo.savePreferences(row);
  }

  async feed(ownerId: string, sourceDogId: string, origin: { lat: number; lon: number }): Promise<DiscoveryFeed> {
    const source = await this.repo.getDog(sourceDogId);
    if (!source || source.ownerId !== ownerId || source.archivedAt) throw new AppError("FORBIDDEN", "You do not have access to this dog.");
    if (source.profileStatus !== "COMPLETE" || source.availabilityStatus !== "AVAILABLE" || !source.breedingEnabled) {
      throw new AppError("CONFLICT", "This dog must be available and breeding-enabled before discovering candidates.");
    }
    const now = this.now();
    const prefs = (await this.repo.getPreferences(sourceDogId)) ?? validatePreferences({ dogId: sourceDogId, requiredBreeds: [], preferredBreeds: [], ageMinMonths: 0, ageMaxMonths: 1200, maxDistanceKm: 5000, updatedAt: now.toISOString() });
    const passes = new Set((await this.repo.listPasses(sourceDogId)).map((pass) => pass.targetDogId));
    const outgoing = await this.repo.listInterestsBySource(sourceDogId);
    const alreadyInterested = new Set(outgoing.filter((i) => i.status === "ACTIVE").map((i) => i.targetDogId));
    const connections = new Set((await this.repo.listConnectionsByDog(sourceDogId)).filter((c) => c.status === "ACTIVE").flatMap((c) => [c.lowerDogId, c.higherDogId]));

    const all = await this.repo.listCandidates();
    const entries: CandidateFeedEntry[] = [];
    for (const cand of all) {
      if (cand.id === sourceDogId) continue; // never self
      if (cand.ownerId === ownerId) continue; // never own dogs
      if (passes.has(cand.id) || alreadyInterested.has(cand.id) || connections.has(cand.id)) continue;
      if (!isEligibleCandidate(cand)) continue;
      // Hard filters: sex complementarity, breed requirements, age range, distance.
      if (cand.sex === source.sex) continue;
      if (prefs.requiredBreeds.length > 0 && !prefs.requiredBreeds.some((entry) => entry.value.toLowerCase() === cand.breed.toLowerCase())) continue;
      const age = ageInMonths(cand.dateOfBirth, now);
      if (!(age >= prefs.ageMinMonths && age <= prefs.ageMaxMonths)) continue;
      const dist = cand.locationLat !== null && cand.locationLon !== null ? haversineKm(origin.lat, origin.lon, cand.locationLat, cand.locationLon) : null;
      if (dist !== null && dist > prefs.maxDistanceKm) continue;
      entries.push({
        ...cand,
        distanceBand: distanceBand(dist),
        score: rankCandidate({ candidate: cand, candidateAgeMonths: age, distanceKm: dist, prefs }),
      });
    }
    entries.sort((a, b) => (b.score ?? -Infinity) - (a.score ?? -Infinity));
    return { candidates: entries.map(({ score, ...rest }) => (score === undefined ? rest : { ...rest, score })), exhausted: entries.length === 0 };
  }

  async reviewPassed(ownerId: string, sourceDogId: string): Promise<CandidateFeedEntry[]> {
    const source = await this.repo.getDog(sourceDogId);
    if (!source || source.ownerId !== ownerId) throw new AppError("FORBIDDEN", "You do not have access to this dog.");
    const passes = await this.repo.listPasses(sourceDogId);
    const out: CandidateFeedEntry[] = [];
    for (const pass of passes) {
      const cand = await this.repo.getDog(pass.targetDogId);
      if (cand) out.push({ ...cand, distanceBand: distanceBand(null) });
    }
    return out;
  }

  async passCandidate(ownerId: string, sourceDogId: string, targetDogId: string): Promise<PassRecord> {
    const source = await this.repo.getDog(sourceDogId);
    if (!source || source.ownerId !== ownerId || source.archivedAt) throw new AppError("FORBIDDEN", "You do not have access to this dog.");
    if (sourceDogId === targetDogId) throw new AppError("VALIDATION_ERROR", "A dog cannot pass itself.");
    const existingOpen = await this.repo.findOpenConnection(...orderedPair(sourceDogId, targetDogId));
    if (existingOpen) throw new AppError("CONFLICT", "These dogs are already connected.");
    return this.repo.addPass({ sourceDogId, targetDogId, passedAt: this.now().toISOString() });
  }

  async reconsiderPassed(ownerId: string, sourceDogId: string, targetDogId: string): Promise<void> {
    const source = await this.repo.getDog(sourceDogId);
    if (!source || source.ownerId !== ownerId || source.archivedAt) throw new AppError("FORBIDDEN", "You do not have access to this dog.");
    const pass = await this.repo.getPass(sourceDogId, targetDogId);
    if (!pass) throw new AppError("NOT_FOUND", "That candidate was not passed.");
    await this.repo.removePass(sourceDogId, targetDogId);
  }
}

function orderedPair(a: string, b: string): [string, string] {
  return a < b ? [a, b] : [b, a];
}

export interface SendResult { interest: InterestRecord; createdConnection: ConnectionRecord | null }

export class InterestService {
  constructor(private readonly repo: MatchingRepository, private readonly now: () => Date = () => new Date()) {}

  async send(ownerId: string, sourceDogId: string, targetDogId: string, strength: InterestStrength): Promise<SendResult> {
    if (!interestStrengths.includes(strength)) throw new AppError("VALIDATION_ERROR", "Interest strength must be NORMAL or STRONG.");
    if (sourceDogId === targetDogId) throw new AppError("VALIDATION_ERROR", "A dog cannot be interested in itself.");
    const source = await this.repo.getDog(sourceDogId);
    if (!source || source.ownerId !== ownerId || source.archivedAt) throw new AppError("FORBIDDEN", "You do not have access to this dog.");
    if (!isEligibleCandidate(source)) throw new AppError("CONFLICT", "This dog must be eligible before expressing interest.");

    const target = await this.repo.getDog(targetDogId);
    if (!target) throw new AppError("NOT_FOUND", "Candidate not found.");
    if (!isEligibleCandidate(target)) throw new AppError("CONFLICT", "That candidate is no longer available.");
    if (source.ownerId === target.ownerId) throw new AppError("VALIDATION_ERROR", "Both dogs share the same owner.");
    if (target.sex === source.sex) throw new AppError("CONFLICT", "These dogs cannot form a breeding match.");

    // Duplicate active interest prevention.
    for (const existing of await this.repo.listInterestsBySource(sourceDogId)) {
      if (existing.targetDogId === targetDogId && existing.status === "ACTIVE") throw new AppError("CONFLICT", "An active interest already exists.");
      if (existing.targetDogId === targetDogId && existing.status === "DECLINED") throw new AppError("CONFLICT", "Re-interest after a decline is not available yet."); // P0 rule (docs/product/07 §12)
    }
    const nowIso = this.now().toISOString();
    const interest = await this.repo.createInterest({ id: crypto.randomUUID(), sourceDogId, targetDogId, strength, status: "ACTIVE", createdAt: nowIso, updatedAt: nowIso });

    // Atomic-ish reciprocal detection: exactly one open connection per unordered pair (DECISIONS.md #4).
    const reciprocalActive = (await this.repo.listInterestsBySource(targetDogId)).some(
      (other) => other.targetDogId === sourceDogId && other.status === "ACTIVE",
    );
    let createdConnection: ConnectionRecord | null = null;
    if (reciprocalActive) {
      const [lowerDogId, higherDogId] = orderedPair(sourceDogId, targetDogId);
      const existing = await this.repo.findOpenConnection(lowerDogId, higherDogId);
      createdConnection = existing ?? (await this.repo.createConnection({ id: crypto.randomUUID(), lowerDogId, higherDogId, status: "ACTIVE", createdAt: nowIso, updatedAt: nowIso }));
    }
    return { interest, createdConnection };
  }

  async withdraw(ownerId: string, interestId: string): Promise<InterestRecord> {
    return this.transition(interestId, ownerId, "WITHDRAWN", ["ACTIVE"], "source");
  }

  async decline(ownerId: string, interestId: string): Promise<InterestRecord> {
    return this.transition(interestId, ownerId, "DECLINED", ["ACTIVE"], "target");
  }

  private async transition(interestId: string, ownerId: string, next: InterestStatus, from: InterestStatus[], side: "source" | "target"): Promise<InterestRecord> {
    const interest = await this.repo.getInterest(interestId);
    if (!interest) throw new AppError("NOT_FOUND", "Interest not found.");
    // Authorization: withdraw = source dog's owner; decline = target dog's owner.
    const dogId = side === "source" ? interest.sourceDogId : interest.targetDogId;
    const dog = await this.repo.getDog(dogId);
    if (!dog || dog.ownerId !== ownerId) throw new AppError("FORBIDDEN", "You do not have access to this interest.");
    if (!from.includes(interest.status)) throw new AppError("CONFLICT", `Only ${from.join("/").toLowerCase()} interests can be ${next.toLowerCase()}.`);
    return this.repo.updateInterest(interest.id, { status: next, updatedAt: this.now().toISOString() });
  }
}

export type { VerificationStatus as VerificationStatusExport };
export { verificationRank };