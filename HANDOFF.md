# HANDOFF — current project state (read this first)

Last updated: 2026-08-26 (post nav-restructure). Scope changes live in
docs/product/32-Scope_Amendments.md (which supersedes conflicting numbered specs).
Architecture map: docs/ARCHITECTURE.md. Services: docs/SERVICES.md.

## What this is

Doggy Style — dog-breeding matching platform. TypeScript/React/Supabase pnpm monorepo.
Deployed: https://match.abenaga.com (auto-deploys on push to main).
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
   list_passed_dogs, candidate_profile, list_my_conversations, dog_cover_photo,
   admin_* family).
2. **storage.objects.owner_id is TEXT** — cast auth.uid() in storage policies.
3. **Never edit an already-applied migration** — create a new numbered one
   (bit us three times: 00500, 02400, 02900). Same for functions whose return
   type changes: `drop function` before `create or replace` (02600, 03000).
4. **PL/pgSQL record from `select a.*, b.x` keeps only a's shape** — qualify explicitly.
   LEFT JOIN + ON-clause predicates on the right table silently drop null rows —
   put those predicates in WHERE with a `(right.id is null or ...)` guard.
5. **Edge functions bind secrets at DEPLOY time** — redeploy after `supabase secrets set`.
6. **New enum values can't be used in the same transaction** that adds them —
   split into two migrations (02700/02800).
7. **Resend test sender** (`onboarding@resend.dev`) delivers ONLY to the account
   owner's email until a domain is verified.
8. **Dev servers die periodically** — if "can't be reached", relaunch; always use
   `--host 127.0.0.1`.
9. **Auth errors are suppressed** — `auth.ts` `signUp`/`login` previously threw
   generic messages ("We could not create your account." / "Email or password is
   incorrect.") hiding the real Supabase error. Fixed to propagate `error.message`.

## Navigation structure (current, post-restructure)

- Tabs: Dogs · Discover · **Likes** · **Messages** · Account
- Likes sub-tabs: Received / Sent / Passes / Connections (mini-cards with cover-photo
  thumbnails, round icon actions)
- Messages page: stacked sections "New connections" (no chat yet) → "Active
  connections" (last-message preview); chat opens directly, back returns to list
- Placement exclusivity: a dog occupies exactly one of sent/passes/connections;
  exception = passed+received may coexist; see docs/product/32 §1–2

## Testing workflow

- `node scripts/regression-check.mjs` — 12 live assertions across all subsystems.
- `pnpm test` — 37 unit tests (packages/domain).
- `bash scripts/test-digest.sh` — fires the email digest edge function.
- Owner tests hands-on with 2 Chrome profiles + seed account.

## Admin capabilities (all staff-gated via is_staff())

Admin app is deployed at https://match.abenaga.com/admin (served from `/admin` path on the
main domain; can be split into `admin.abenaga.com` subdomain later without code changes).

- **Overview**: platform stats dashboard, re-interest cooldown editor, ranking-weight sliders
- **Reports**: triage list with status updates (Open / In Review / Closed)
- **Verifications**: pending submission queue with document viewer, approve/reject + reviewer notes
- **Users**: full list with email, dog counts, verification status, staff badge; edit display name,
  deactivate/reactivate owners, delete owners (only when no dogs exist)
- **Dogs**: list all dogs with owner info; edit name/sex/DOB/breed/location/breeding-enabled,
  archive/unarchive, delete (wipes all interests/passes/connections/messages)
- **Blocks**: all blocks overview
- **Danger zone**: reset matching data per dog or per owner (wipes all matching data for that entity)

All admin writes go through security-definer RPCs — regular RLS policies are insufficient for
cross-owner operations.

## Deliberate scope deviations

See docs/product/32-Scope_Amendments.md — nav restructure (Likes/Messages),
likes placement exclusivity model, bulk pass restore, cooldown policy,
delete-for-me chat, public photo bucket, trigger-driven notifications.

## Remaining before public launch

1. Legal ToS/Privacy text (owner/lawyer)
2. Domain purchase + Resend domain verification (real email delivery)
3. Set cooldown to 10080 min in admin when testing ends
4. Admin app deployed at https://match.abenaga.com/admin; notification preferences

## P2 (explicitly out of scope)

Payments, contracts/negotiation, adoption, dating rollout, auctions, co-ownership.
