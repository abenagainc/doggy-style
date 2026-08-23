# Doggy Style — Codex Project Constitution

## Mission

Doggy Style is the first rollout of a reusable matching-platform engine. The initial use case is dog breeding.

## Domain invariants

- Owner and Dog are separate entities.
- One Owner may manage multiple Dogs.
- One Dog has one Owner in the MVP.
- Dog is the primary matching entity in the initial breeding rollout.
- Active Dog is the context for dog-scoped experiences.
- Interest is not Connection.
- Connection is not Agreement.
- Proceeding is not Payment.
- MVP has no payments.
- Interest has NORMAL and STRONG strength.
- Matching preferences use REQUIRED, PREFERRED, and DON'T_CARE.
- Matching and authorization are server-authoritative.
- Do not invent undocumented business rules.
- Do not implement P1/P2 while P0 is incomplete.

## Documentation workflow

Before implementing a feature:
1. Read the relevant numbered specification(s) in `docs/`.
2. Check related wireframe/UX requirements.
3. Identify dependencies and state transitions.
4. If the required behavior is genuinely unspecified, ask for clarification.
5. Implement the smallest coherent change.
6. Add/update tests.
7. Run relevant checks before declaring the task complete.

## Technical direction

Recommended baseline:
- TypeScript
- React
- PostgreSQL
- Supabase for database, authentication, storage, and realtime
- GitHub for source control
- Automated tests

The application/domain layer owns business rules. Supabase provides infrastructure; it is not the product specification and should not contain the only copy of business rules.

## Security

- Never commit secrets or `.env` credentials.
- Enforce authorization server-side.
- Protect sensitive verification, health, location, and messaging data.
- Validate uploads and API inputs.
- Do not expose privileged service credentials to the client.

## Definition of done

A feature is complete only when its UI (where applicable), API/domain behavior, persistence, authorization, states/errors, tests, and relevant analytics requirements are addressed.

## Git discipline

Keep changes scoped and explain architectural decisions. Do not silently rewrite requirements to make an implementation easier.
