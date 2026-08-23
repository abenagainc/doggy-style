Document 30 — AI Development Master Specification

Doggy Style — Single Source of Truth for AI-Assisted Development


## 1. Product

- Doggy Style is the first rollout of a reusable matching platform.

- Initial use case: dog breeding.

- Primary matching entity: Dog.

- Human participant: Owner.

- Relationship path: Interest → Mutual Interest → Connection → Conversation → Proceeding.


## 2. Product Rules

- One owner can manage multiple dogs.

- Active Dog determines dog-scoped activity.

- Initial dog creation requires name, sex, age/date of birth and breed.

- Other dog information is progressively completed.

- Discovery uses Tinder-style cards.

- Interest has Normal and Strong variants.

- Preferences use Required / Preferred / Don't Care.

- Chat is free-form in MVP.

- No co-ownership, ownership transfer or payments in MVP.

- Verification is tiered and affects ranking.

- Distance is displayed, filterable and ranked.


## 3. Architecture

- Use a TypeScript/React frontend, TypeScript backend/API, PostgreSQL database, object storage for images/documents, realtime messaging, background jobs, and environment-managed secrets as the recommended baseline.

- Keep domain logic server-authoritative.


## 4. Implementation Order

- Foundation/authentication → Owner/Dog → dog creation → profile completion → Active Dog → discovery/matching → interest → connection → conversation → verification → notifications → safety → admin → analytics → polish.


## 5. AI Coding Rules

- Do not invent product behavior when a documented rule exists.

- Do not merge Owner and Dog.

- Do not treat Interest as Connection.

- Do not treat Connection as Agreement.

- Do not allow frontend-only authorization.

- Do not hard-code the first rollout so tightly that future matching entities become impossible.

- Every feature must include loading, error and empty behavior where applicable.

- Implement P0 before P1/P2.


## 6. Definition of Done

- A feature is not complete until its UI, API, database behavior, permissions, state transitions, error handling, analytics event where required, tests, and acceptance criteria are implemented.

- An implementation is ready for production only after the QA plan passes and security/privacy requirements are reviewed.


## 7. Open Provider Decisions

- Specific authentication provider, object-storage provider, messaging/realtime provider, email/SMS provider, maps/geocoding provider, analytics provider, hosting provider, and verification vendor remain implementation/provider selections.

- These choices should be made once against current Replit capabilities and project constraints; they do not change the product domain model.
