# HANDOFF — current project state (read this first)

Last updated: 2026-08-24. Scope changes live in docs/product/32-Scope_Amendments.md
(which supersedes conflicting numbered specs).

## What this is

Doggy Style — dog-breeding matching platform. TypeScript/React/Supabase pnpm monorepo.
Deployed: https://doggy-style-drab.vercel.app (auto-deploys on push to main).
P0 + P1 feature-complete, verified by scripts/regression-check.mjs (12 live checks).

## Environments & access

| Thing | Value |
|---|---|
| Web app (local) | http://127.0.0.1:5173 — `cd apps/web && pnpm exec vite --host 127.0.0.1 --port 5173` |
| Admin app (local) | http://127.0.0.1:5174 — same pattern in `apps/admin`, port 5174 |
| Supabase project | uunazqxidynrnsjvypan |
| Seed login | seed@doggy-style.test / SeedAccount#2026 (20 demo dogs) |
| User's test account | abe.naga@gmail.com — dogs Dooby, Noshka |
| Staff access | user's auth id in `admin_staff` table |

## Dev server quirks

- Vite MUST be launched with `--host 127.0.0.1` (default binds IPv6-only; Chrome can't reach it).
- Background dev servers die periodically — if "can't be reached", just relaunch.
- Database migrations do NOT auto-run on deploy; `supabase db push` is manual.

## Known gotchas (learned the hard way)

1. **RLS is the recurring bug class**: read policies that join other owners' rows fail;
   UPDATE/INSERT policies missing = silent no-op writes. Cross-owner data must go
   through `security definer` RPCs (eligible_candidates, list_my_connections,
   list_passed_dogs, candidate_profile, admin_* family).
2. **storage.objects.owner_id is TEXT** — cast auth.uid() in storage policies.
3. **Never edit an already-applied migration** — create a new numbered one
   (bit us twice: 00500, 02400).
4. **PL/pgSQL record from `select a.*, b.x` keeps only a's shape** — qualify explicitly.
5. **Edge functions bind secrets at DEPLOY time** — redeploy after `supabase secrets set`.
6. jsonb_build_object args cannot contain aggregate+FROM; use scalar subqueries.
7. Resend test sender (`onboarding@resend.dev`) delivers ONLY to the account owner's
   email until a domain is verified.

## Testing workflow

- `node scripts/regression-check.mjs` — 12 live assertions across all subsystems.
- `pnpm test` — 37 unit tests (packages/domain).
- `bash scripts/test-digest.sh` — fires the email digest edge function.
- Owner tests hands-on with 2 Chrome profiles + seed account.

## Admin capabilities (all staff-gated via is_staff())

Reports triage · verification review queue · users list (verification override,
deactivate) · blocks · stats · ranking-weight sliders (live) · cooldown setting ·
danger-zone reset tools (per dog/owner wipe incl. cross-side notifications).

## Deliberate scope deviations

See docs/product/32-Scope_Amendments.md — nav restructure (Likes/Messages),
likes placement exclusivity model, bulk pass restore, cooldown policy,
delete-for-me chat, public photo bucket, trigger-driven notifications.

## Remaining before public launch

1. Legal ToS/Privacy text (owner/lawyer)
2. Domain purchase + Resend domain verification (real email delivery)
3. Set cooldown to 10080 min in admin when testing ends
4. Optional: admin app hosting (currently localhost-only), notification preferences

## P2 (explicitly out of scope)

Payments, contracts/negotiation, adoption, dating rollout, auctions, co-ownership.
