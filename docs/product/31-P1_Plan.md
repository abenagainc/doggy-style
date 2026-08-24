# P1 Plan — Doggy Style

Status: PLANNED (agreed with owner 2026-08-24). P0 is feature-complete and deployed.

Scope source: docs/product/16 §P1 — "richer verification workflows, notifications,
advanced profile sections, moderation tooling, improved ranking, expanded screening
support." Moderation tooling already shipped early (admin app, migrations 01600/01700).

## Guiding constraints

- Same discipline as P0: tests-first in packages/domain, server-authoritative
  matching/authorization, new numbered migrations only.
- No P2 items (payments, contracts, adoption/dating rollouts) sneak in.
- Each milestone ships independently deployable; golden path must stay green.

---

## M6 — Notifications (highest user value)

Goal: users learn about interests/matches without keeping the tab open.

- `notifications` table: id, owner_id, type (INTEREST_RECEIVED / MATCH / MESSAGE /
  PROCEEDING_CONFIRMED), payload jsonb, read_at, created_at. RLS: own rows only.
- In-app bell with unread badge (poll or Supabase Realtime channel).
- Email via Supabase edge function + Resend (or SMTP): digest style, not per-event,
  with per-owner notification preferences (all / matches-only / none).
- Deep links: notification click routes to the relevant dog's interest/chat.
- Tests: notification creation on interest-received, match creation, message-send
  (only for offline recipients — define "offline" as no socket/no recent poll).

Estimate: 2 sessions. Depends on: nothing.

## M7 — Realtime chat upgrade

Goal: replace 4s polling with Supabase Realtime websocket subscription on messages.

- Subscribe per conversation_id; unsubscribe on unmount (strict cleanup).
- Optimistic send stays; dedupe by message id when the echo arrives.
- Presence: "other owner is typing…" (optional, cheap with Realtime presence).
- Fallback to polling if socket fails.
- Delete-for-me interplay: hidden conversations don't subscribe.

Estimate: 1 session. Depends on: nothing (M6 independent).

## M8 — Improved ranking

Goal: better candidate ordering per spec 11 (preferences boost, distance, verification).

- Ranking function in SQL (eligible_candidates ORDER BY):
  score = w1·breed_preference_match + w2·distance_closeness + w3·verification_level.
  Weights in platform_settings so admin can tune without redeploying.
- Show ranking reason subtly on cards? No — keep invisible (spec: ranking is silent).
- Admin Overview gains a ranking-weights editor.
- Tests: preference-level ordering property tests in domain.

Estimate: 1 session. Depends on: admin settings (done).

## M9 — Richer verification workflows

Goal: move beyond manual APPROVED flip in admin.

- Owner submits verification: document upload (storage, private bucket) + self-declared info.
- Admin queue tab: pending submissions with document viewer link, approve/reject + note.
- Status transitions recorded (verification_events audit table).
- Tier model per docs/technical/26: Tier-1 email+profile complete (already enforced),
  Tier-2 identity doc review (new), Tier-3 enhanced (future).
- Ranking hook: verification tier feeds M8 weights.

Estimate: 2 sessions. Depends on: M8 (for ranking hook), admin (done).

## M10 — Expanded screening support

Goal: structured pre-breeding screening questions between connection and proceeding.

- Per-dog optional screening questionnaire (owner-defined questions, stored jsonb).
- Connection state: after match, either owner can request screening answers before
  confirming proceeding; answering required before that owner's proceed counts.
- Keep it lightweight: free-form Q&A pairs, not a form builder.

Estimate: 2 sessions. Depends on: nothing, but do after M9 to avoid schema churn.

## M11 — Advanced profile sections (polish)

- Multiple photos per dog with reorder + cover selection (schema supports it already).
- Health section: vaccination expiry reminders (notification type from M6).
- Pedigree display improvements on candidate detail.

Estimate: 1–2 sessions. Depends on: M6 (reminders).

---

## Suggested order

M6 → M7 → M8 → M9 → M11 → M10

Rationale: notifications deliver the most felt improvement; realtime is a quick win;
ranking uses existing data; verification unlocks trust for real users; screening last
because it changes the proceeding flow and benefits from stable foundations.

## Explicitly deferred to P2 (do not build)

Payments, contracts/negotiation, customer-facing configuration UI, adoption,
dating rollout, auctions, co-ownership, ownership transfer.
