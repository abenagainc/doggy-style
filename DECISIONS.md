# DECISIONS.md — Milestone 0 Product & Technical Decisions

These decisions preserve the Dog-first model: Owner operates; Dog matches; Interest, Connection, and Proceeding remain separate.

Status legend: **[DECIDE]** = human owner must make the final call (recommendation given). **[RECOMMENDED]** = spec clearly implies one answer.

## 1. Eligibility and profile-completion threshold — [DECIDE]

**Recommended decision:** A dog may enter discovery only when its owner is Tier-1 verified, the dog is `AVAILABLE`, breeding is enabled, and a published "matching-ready" profile threshold is met. The four creation fields are not sufficient alone. For P0, require: name, sex, date of birth, breed, at least one photo, location, and breeding availability/preferences; show health, pedigree, temperament, and extended breeding data as progressive improvements that affect ranking but not eligibility.

**Alternatives considered:**

- Four creation fields alone: fastest onboarding, but produces weak discovery cards and conflicts with "complete/sufficiently complete" eligibility.
- Require every profile section: higher quality, but contradicts progressive completion and creates onboarding friction.
- No profile threshold: contradicts the eligibility/state-model specifications.

**Touches:** 03 §2; 06 §§3–4; 07 §§3–4; 09 profile completion; 11 eligibility/ranking; 16 P0; 20 §§3, 9; 22 §§1, 6; 23 §§2–5; 29 §§1, 5.

## 2. Verification: required eligibility vs. ranking — [RECOMMENDED]

**Decision:** Tier-1 Owner verification is required for discovery eligibility. Tier-2 Dog verification and Tier-3 Health/Pedigree verification are optional trust signals that improve ranking and are visibly labelled; they do not independently make an otherwise eligible dog invisible. A moderator may impose a future configured hard rule, but P0 does not.

This reconciles the explicit "owner is verified" eligibility rule with the instruction not to hide every unverified dog.

**Alternatives considered:**

- Require all three tiers: excessive P0 friction and contrary to the tiered-ranking guidance.
- Make no tier required: conflicts with the explicit owner-verification eligibility rule.
- Treat verification as a guarantee of health or breeding suitability: explicitly prohibited.

**Touches:** 07 §4; 09 verification; 11 eligibility/ranking; 16 P0; 22 §§5–6; 23 §12; 26 §§1–6; 30 §§2, 4.

## 3. Pass entity/data model — [DECIDE]

**Recommended decision:** Persist a `candidate_passes` (or reusable `candidate_decisions`) record keyed by ordered `source_dog_id` and `target_dog_id`, with `status`, `passed_at`, `reviewed_at`, and an optional `eligible_to_resurface_at`. A Pass removes the target from the normal feed, preserves it for "Review Passed Dogs," and does not alter interest or connection state. Reconsideration explicitly removes/overrides the pass.

The cooldown remains a configuration value and defaults to no automatic resurfacing in P0 unless the owner approves one.

**Alternatives considered:**

- Client-side dismissed-card state: cannot support cross-device review, cooldowns, auditability, or server-authoritative matching.
- Represent Pass as a declined Interest: collapses distinct domain concepts and falsely implies contact.
- Permanently exclude every pass: makes the documented configurable cooldown impossible.

**Touches:** 06 §5; 09 discovery exhaustion; 11 §§19–23; 13 §13; 16 P0; 20 §1; 23 §10; 29 §1.

## 4. Connection uniqueness — [RECOMMENDED]

**Decision:** Canonicalize every dog pair (`lower_dog_id`, `higher_dog_id`) and enforce one non-closed connection per unordered pair at the database level. Create the connection transactionally when reciprocal active interests are found; retries return the existing connection. Closed connections remain historical records, but P0 does not permit re-interest/reconnection until a separately approved re-interest policy exists.

**Alternatives considered:**

- Unique connection forever: preserves simplicity but blocks future legitimate reconnection.
- No database constraint: risks duplicate connections during concurrent reciprocal-interest requests.
- Two directional connections: contradicts Connection as a shared relationship container.

**Touches:** 01 §§2–3; 03 §§3–5; 07 §§5–10, 17; 10 Connection; 20 §§6, 9; 22 §§2–3, 7; 23 §7; 29 §§1, 5.

## 5. Proceeding confirmation persistence — [RECOMMENDED]

**Decision:** Store one idempotent confirmation per `(connection_id, owner_id)` in a `connection_proceed_confirmations` table, including timestamp and optional withdrawn timestamp. The connection becomes `PROCEEDING` only in the same transaction that observes confirmations from both current connection owners. A confirmation is an audit record of intent, not a payment, contract, or breeding agreement.

**Alternatives considered:**

- Two boolean columns on `connections`: workable only for the fixed two-owner MVP, but weaker for auditing and future platform reuse.
- One "proceed" action completing immediately: explicitly violates the two-owner requirement.
- Treat confirmation as an agreement/payment: violates domain invariants.

**Touches:** 01 §§2–3; 03 §5; 06 §8; 07 §§7–9; 09 proceeding; 20 §6; 21 §6; 22 §§3, 7; 23 §9; 28 §1.

## 6. Blocking consequences — [DECIDE]

**Recommended decision:** A block is owner-to-owner and immediately applies across all dogs. It removes both owners' dogs from each other's discovery, prevents new interests and reciprocal connections, and revokes messaging access on existing connections. Existing active/screening connections should transition to `CLOSED` with a system-only reason `BLOCKED`; messages and evidence are retained for moderation but hidden from both owners. Unblocking restores only future eligibility—it does not reopen historical connections or restore prior interests.

**Alternatives considered:**

- Block only the current dog pair: explicitly conflicts with owner-level blocking.
- Keep conversations usable after a block: defeats the safety purpose.
- Delete messages/connections immediately: harms investigations and auditability.
- Restrict rather than close: viable later, but requires a new connection state and more nuanced UX.

**Touches:** 03 §7; 06 §13; 07 §§9, 13–14; 09 connections/conversation; 10 Block/Report; 14 Owner permissions; 15 connection/messaging exceptions; 20 §§1, 9; 21 §8; 22 §§3–4, 7; 23 §11; 25 §§3–5; 27 §§1–3; 29 §5.

## 7. Privacy: location, sensitive profile data, retention, deletion — [DECIDE]

**Recommended decision:**

- **Location:** collect a location sufficient for matching, never a street address. Store coordinates server-side with restricted access; display only a distance band (for example, "within 10 km," "10–25 km") and optional owner-selected city/region. Use the protected precise value only for filtering/ranking.
- **Health/pedigree:** distinguish owner-entered profile summaries from documentary evidence. Show only owner-approved summaries and verification badges on candidate profiles; raw health, vaccination, pedigree, and identity evidence is accessible only to the owner and authorized reviewers.
- **Retention/deletion:** support account deactivation immediately and permanent deletion after a documented recovery window. Delete or irreversibly anonymize public profile data, photos, precise location, and message content at that point. Retain only the minimum pseudonymized safety, report, consent, and audit records for a human-approved retention period.

The retention periods, legal basis, jurisdictions, and privacy-policy wording require owner/legal approval before production.

**Alternatives considered:**

- Display exact distance or address: contradicts the sensitive-location requirement.
- Expose all submitted evidence on profiles: violates restricted-access requirements.
- Retain all data indefinitely: conflicts with data minimization.
- Delete safety reports immediately: undermines moderation and abuse prevention.

**Touches:** 03 §2; 04 §5; 09 candidate profile; 11 distance; 20 §§1, 3, 8, 10; 24 §7; 25 §§3, 5–6; 26 §§3–4; 27 §§2, 4–5; 28 §2.

## 8. P0 notification scope — [DECIDE]

**Recommended decision:** P0 includes durable in-app notifications only for received interest, mutual connection, new message, proceeding confirmation/completion, connection closure, verification status, report receipt, and moderation outcome where appropriate. Each notification stores the relevant dog context and switches the Active Dog before opening its destination. Defer push, email, SMS, preferences, digests, retries, and delivery-provider integrations to P1.

**Alternatives considered:**

- No P0 notifications: conflicts with the interest acceptance criterion and dog-context notification requirements.
- Full multi-channel notification system: conflicts with P1 prioritization.
- Generic owner-only notifications: violates the Active Dog/context rule.

**Touches:** 06 §12; 07 §15; 10 Notification; 12 §9; 13 §19; 16 P0/P1; 18 §§15, 19; 19 §4; 20 §§1, 10; 21 §9; 23 §6; 28 §1; 29 §§1, 4.

## 9. Minimal P0 moderation queue — [DECIDE]

**Recommended decision:** P0 provides a protected internal queue for submitted reports and verification submissions, with immutable case IDs, target/context references, submitted evidence references, status (`OPEN`, `IN_REVIEW`, `CLOSED`), reviewer, timestamps, and an audit trail. Minimum actions: mark no-action, restrict/suspend owner, approve/reject verification, and close case. Do not build advanced dashboards, configurable policy engines, bulk tools, or a customer-facing moderation interface in P0.

**Alternatives considered:**

- Store reports with no review path: satisfies persistence but not meaningful safety operations.
- Build the complete administration specification: exceeds P0 because richer moderation tooling is P1.
- Put moderation status on the report alone: loses the auditable case lifecycle.

**Touches:** 03 §7; 07 §14; 10 Report/Verification; 14 roles; 16 P0/P1; 20 §§1, 8; 21 §8; 23 §11; 25 §§4–5; 27 §§1–5; 29 §§2, 5.

## 10. ToS and consent recording — [DECIDE]

**Recommended decision:** At signup, require acceptance of versioned Terms of Service and Privacy Notice, recorded with owner ID, document/version identifier, acceptance timestamp, locale, and an integrity hash/version reference. Record separate, granular consent for optional marketing and for owner publication of sensitive profile summaries/location precision; neither is bundled into ToS acceptance. Require re-acceptance when terms materially change. Keep consent history auditable and exportable/deletable subject to the approved retention policy.

**Alternatives considered:**

- A single unversioned checkbox: cannot demonstrate what was accepted.
- Bundled marketing consent: not meaningful consent.
- Store complete IP/user-agent histories indefinitely: excessive collection unless a human-approved legal policy requires it.

**Touches:** 03 §1; 04 §5; 14 Owner permissions; 20 §2; 24 §7; 25 §§1, 3, 6–7; 27 §5; 28 §2.
