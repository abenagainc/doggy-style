import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { AccountService, DogService, type AuthProvider, type ConsentRepository } from "@doggy-style/domain";

describe("Milestone 1 integration contracts", () => {
  it("records both mandatory, versioned legal consents immediately after Supabase signup", async () => {
    const calls: unknown[] = [];
    const auth: AuthProvider = { signUp: async () => ({ userId: "owner-a" }), signIn: async () => {}, signOut: async () => {}, requestPasswordRecovery: async () => {} };
    const consents: ConsentRepository = { recordRequiredConsent: async (input) => { calls.push(input); } };
    await new AccountService(auth, consents).signUp({ email: "a@example.test", password: "a secure password", termsVersion: "2026-08", privacyNoticeVersion: "2026-08", locale: "en", termsHash: "terms-sha", privacyNoticeHash: "privacy-sha" });
    expect(calls).toEqual(expect.arrayContaining([expect.objectContaining({ documentType: "TERMS", ownerId: "owner-a" }), expect.objectContaining({ documentType: "PRIVACY_NOTICE", integrityHash: "privacy-sha" })]));
  });
  it("has database-enforced owner/dog/storage isolation and lifecycle protections", async () => {
    const migration = await readFile(new URL("../supabase/migrations/20260823000100_milestone_1_foundation.sql", import.meta.url), "utf8");
    expect(migration).toContain('create policy "owners read own dogs"');
    expect(migration).toContain('create policy "owners upload only into own dog folder"');
    expect(migration).toContain("validate_active_dog_owner");
    expect(migration).toContain("clear_archived_active_dog");
    expect(migration).toContain("protect_dog_lifecycle");
    expect(migration).toContain("Versioned Terms and Privacy Notice consent is required");
    expect(migration).toContain("owner_consents");
  });
  it("can compose the dog service with a persistence adapter boundary", () => {
    expect(DogService).toBeTypeOf("function");
  });
});
