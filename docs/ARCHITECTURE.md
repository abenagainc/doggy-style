# Architecture Map — how Doggy Style fits together

Companion to `AGENTS.md` (rules) and `docs/SERVICES.md` (external services).
This page explains *what talks to what*, so maintainers don't reverse-engineer
25 migrations to find the flow.

## High-level shape

```
Browser (apps/web)                    Browser (apps/admin)
   │  supabase-js, anon key              │
   ▼                                     ▼
Supabase ── Postgres + RLS + RPCs + Triggers + Storage + Realtime + Auth
   │
   ├─ Resend API (edge function, daily cron) → digest emails
   └─ Vercel hosts the static web build; GitHub Actions runs CI
```

## Screens → data sources

| Screen | Reads | Writes |
|---|---|---|
| Discover (swipe deck) | `eligible_candidates(dog)` RPC — filters + **rank_score ordering** (weights from `platform_settings`) | `interests` INSERT (guarded by `assert_interest_eligibility` trigger), `candidate_passes` INSERT |
| Likes → Received/Sent | `list_interests_view` via interestsData (`listInterests`) | accept = reciprocal interest insert (connection auto-created by M2 trigger); decline stamps `cooldown_until`; withdraw sets WITHDRAWN |
| Likes → Passes | `list_passed_dogs(dog)` RPC | `reconsider_passed` / bulk restore deletes passes |
| Likes / Messages → Connections | `list_my_connections` RPC (names resolved server-side) | archive/delete-chat/unfriend RPCs; chat opens lazily-create `conversations` row |
| Chat thread | `messages` SELECT + Realtime subscription on INSERT | `messages` INSERT (read-only when connection CLOSED) |
| Proceeding | connection status polling | `connection_proceed_confirmations` INSERT — **blocked by trigger until screening answers are complete** |
| Screening | `pending_screening_questions(dog)` RPC | `screening_answers` INSERT |
| Notifications bell | `notifications` SELECT + unread count RPC | mark-read RPC; rows created by TRIGGERS only |
| Verification (Account tab) | own submissions | storage upload + `submit_verification` RPC |
| My Dogs | dogs/photos/preferences/profile-depth tables (own rows) | direct CRUD + `set_dog_cover`/`move_dog_photo` RPCs |

## Admin app → staff-only RPCs (all gated by `is_staff()`)

| Feature | RPC(s) |
|---|---|
| Reports triage | `admin_list_reports`, `admin_update_report_status` |
| Verification queue | `admin_list_verification_submissions`, `admin_decide_verification` (+ signed URL of doc) |
| Users | `admin_list_owners`, `admin_set_owner_active`, `admin_set_verification` |
| Blocks / stats | `admin_list_blocks`, `admin_stats` |
| Settings & ranking sliders | `get_setting`, `set_setting`, `rank_weight()` |
| Danger-zone reset | `admin_reset_dog_matching`, `admin_reset_owner_matching`, `admin_list_dogs` |

## Database triggers (things that happen "by themselves")

| Trigger | Table | Effect |
|---|---|---|
| `interests_assert_eligibility` | interests INSERT | both dogs AVAILABLE+complete+breeding, complementary sexes, different owners, sender APPROVED |
| `stamp_interest_cooldown` | interests UPDATE→DECLINED | sets `cooldown_until` from platform_settings |
| `notify_interest_received` / `notify_match` / `notify_message` / `notify_proceeding` | respective tables | create notifications for the other party |
| `proceed_requires_screening` | proceed confirmations INSERT | rejects while outstanding screening answers exist |
| profile-completion family | dogs | recomputes COMPLETE/AVAILABLE status |

## Scheduled jobs (pg_cron)

| Job | Schedule | Does |
|---|---|---|
| `doggy-style-notification-digest` | daily 09:00 UTC | POSTs to `notification-digest` edge function → Resend email per user with unread notifications |
| vaccine reminders | *(function exists: `check_vaccine_reminders()` — wire to cron same pattern when wanted)* | creates VACCINE_DUE notifications ≤14 days before due date |

## Key invariants (from AGENTS.md, enforced in code)

- Matching/authorization decisions live server-side; clients display.
- Cross-owner reads go through security-definer RPCs — RLS hides other owners' rows.
- One connection per unordered dog pair; proceeding requires dual confirmation;
  closed connections are terminal.
- Interests table name is internal; user-facing copy says "Likes".
