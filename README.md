# Doggy Style

Reusable matching-platform engine; first rollout: dog breeding.

## Repository structure

- `docs/` — product, UX, technical specifications
- `apps/web/` — primary application
- `apps/admin/` — moderation/operations application
- `packages/domain/` — domain models and business rules
- `packages/database/` — database access/types
- `packages/matching/` — matching engine
- `packages/ui/` — shared UI components
- `supabase/` — Supabase configuration, migrations, functions, seed data
- `tests/` — cross-cutting tests

## Important

Do not build the product from memory. Read `AGENTS.md` and the relevant specification before implementing a feature.

## Local development

Copy `.env.example` to `.env` and fill in the Supabase project URL, anon key, and current legal-document versions. Never place a Supabase service-role key in a browser application or commit it. Install the workspace dependencies with `corepack pnpm install`, run migrations with the Supabase CLI, then use `pnpm typecheck` and `pnpm test`.
