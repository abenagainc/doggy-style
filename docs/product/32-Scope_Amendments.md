# Scope Amendments — decisions that changed the original specs

This document records every deliberate deviation from the original specification,
with rationale. Where a numbered spec contradicts this file, **this file wins**.
(Owner-approved during P0/P1 development, 2026-08-23/24.)

## 1. Navigation & Information Architecture
**Original:** spec 05/09 — five tabs: Dogs, Discover, Interests, Connections, Account.
**Amended (owner decision):** five tabs: **Dogs, Discover, Likes, Messages, Account**.
- "Interests" renamed to **Likes**.
- Likes is a hub with four sub-tabs: **Likes received, Likes sent, Passes, Connections**
  (Connections moved out of the top nav into Likes).
- New top-level **Messages** tab: conversation list opening chats directly.

## 2. Placement exclusivity model (spec 07 §state visibility)
**Original:** interests and passes were independent lists; connections coexisted with them.
**Amended:** a dog appears in exactly one of: Likes sent, Passes, or Connections —
- Exception: after a pass, if the passed dog initiates a like, it shows in BOTH
  Passes and Likes received until acted on.
- Once mutual (connection created), the profile leaves likes/passes entirely and
  lives only under Connections.

## 3. Discovery exhaustion → "View passed dogs"
**Original:** passed dogs resurface via a separate review list only.
**Amended (owner decision):** Discover's exhausted state offers:
- **View passed dogs**: restores ALL passes in bulk and returns to swiping
  (first restored candidate shown immediately).
- The per-dog individual review ALSO exists inside Likes → Passes sub-tab.
- Copy is "View passed dogs" (not "Review").

## 4. Re-interest cooldown (replaces spec 07 §12 hard block)
**Original:** after decline, re-interest blocked permanently in P0.
**Amended:** cooldown window (default 5 minutes testing / target ≥1 week production),
managed from the admin panel (`platform_settings.reinterest_cooldown_minutes`,
read dynamically by the decline trigger). During cooldown the candidate is hidden
from Discover; after expiry they reappear and interest may be re-sent.

## 5. Ranking is a live-tunable playground (extends spec 11)
**Amended:** ranking weights (breed/distance/verification) are stored in
`platform_settings` and edited via sliders in Admin → Overview ("ranking playground").
Feed order updates on next load without redeploy. Ranking remains invisible to users.

## 6. Verification workflows brought forward (was P1 anyway) + admin queue
Implemented per docs/technical/26 tiering: owner uploads ID doc → admin Verifications
tab reviews (signed URL viewer) → approve/reject stamps reviewer identity/time.
Verification level feeds the M8 ranking weight.

## 7. Moderation & testing tools (extends spec 27)
Beyond report/block moderation, the admin app includes:
- Platform settings editor (cooldown, ranking weights)
- Users list with verification override + deactivate/reactivate
- Blocks overview, stats dashboard
- **Danger zone reset tools**: wipe all interests/passes/connections/messages/
  screening answers for a single dog or an entire owner (staff-only RPCs), including
  cross-side stale notification cleanup. Exists specifically for unblocking testing.

## 8. Delete chat = delete-for-me
**Original direction considered:** destructive delete for both parties.
**Amended (owner decision):** deleting a chat hides it for the deleting user only;
the other party keeps messages. Reopening unhides (nothing is destroyed).

## 9. Photos are served from a PUBLIC bucket
**Original intent:** private storage + signed URLs everywhere.
**Amended:** `dog-photos` bucket is public (paths contain unguessable UUID pairs);
visibility enforced at discovery/RPC layer only. Rationale: no SQL-accessible signing
functions in this project's storage build; signed URLs kept ONLY for
`verification-docs` (private bucket).

## 10. Notifications are trigger-driven (implementation note)
Notification rows are created by database triggers on interests/connections/messages/
proceed-confirmations — not by client code — so events can't be missed. Email digests
via Resend edge function on a daily cron; test-domain restriction applies until a
domain is verified.

## 11. Chat UX specifics (extends spec 12)
- Thread-only refresh: page never flashes; polling fallback (30s safety net) +
  websocket realtime; auto-scroll only when message count grows.
- Connections/chat actions use round icon buttons with labels (Pass ✕, ♥ Interested,
  🔥 Strong, ✓ Accept, ↩ Withdraw, 💬 Chat, 🗑 Delete, 📦 Archive, person✕ Unfriend).
- "Open conversation" is labeled **Chat**; rejection action is labeled **Unfriend**.

## 12. Vocabulary: "Likes" not "Interests" (user-facing copy)
All user-facing surfaces say Likes (likes received/sent). Internal tables keep the
`interests` name for stability.
