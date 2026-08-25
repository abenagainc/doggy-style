# Doggy Style

Reusable matching-platform engine; first rollout: dog breeding.

**Status: P0 + P1 feature-complete, deployed, in owner testing.**
Start here: `HANDOFF.md` (current state) → `AGENTS.md` (rules) → numbered specs.

## Repository structure

- `HANDOFF.md` — **read first**: current state, quirks, testing workflows
- `docs/` — product/UX/technical specs
  - `docs/product/32-Scope_Amendments.md` — approved deviations from original specs (supersedes conflicting specs)
  - `docs/SERVICES.md` — external services inventory (GitHub, Vercel, Supabase, Resend)
  - `docs/ARCHITECTURE.md` — how screens/RPCs/triggers/crons fit together
- `apps/web/` — primary application
- `apps/admin/` — moderation/operations application
- `packages/domain/` — domain models and business rules
- `packages/database/` — database access/types
- `packages/matching/` — matching engine
- `packages/ui/` — shared UI components
- `supabase/` — migrations (25), edge functions, config
- `scripts/regression-check.mjs` — live-database health check (12 assertions)

## Important

Do not build the product from memory. Read `AGENTS.md`, `HANDOFF.md`, and the relevant specification before implementing a feature. Scope changes are recorded in `docs/product/32-Scope_Amendments.md`.

## Local development

Copy `.env.example` to `.env.local` and fill in the Supabase project URL and anon key (apps/web and apps/admin each need one). Never place a Supabase service-role key in a browser application or commit it. Install with `pnpm install`, apply migrations with `supabase db push`, then:

```bash
pnpm typecheck && pnpm test          # gates
pnpm --filter @doggy-style/web dev   # web on 127.0.0.1:5173 (--host required!)
pnpm --filter @doggy-style/admin dev # admin on 127.0.0.1:5174
node scripts/regression-check.mjs    # live-database smoke test
```

See `HANDOFF.md` for dev-server quirks and known gotchas.
