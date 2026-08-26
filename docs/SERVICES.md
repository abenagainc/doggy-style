# Third-Party Services & Accounts

Everything external Doggy Style depends on. Owner accounts: **abenagainc**
(GitHub username), personal email abenagainc@gmail.com (billing/contact) unless noted.

## GitHub
| | |
|---|---|
| Purpose | Source control; triggers Vercel deploys; runs CI |
| Repo | github.com/abenagainc/doggy-style (private→public status: owner-managed) |
| Auth | `gh` CLI 2.62.0 installed at `~/.local/bin/gh`, authenticated via browser device flow. NOTE: token needed a manual `gh auth refresh -s workflow` once, to allow pushing `.github/workflows/` |
| CI | `.github/workflows/ci.yml` — typecheck + tests + web build on every push/PR; optional fresh-DB migration check if SUPABASE_ACCESS_TOKEN secret is set (not yet set) |

## Vercel
| | |
|---|---|
| Purpose | Hosting for the web app (`apps/web`) |
| URL | https://match.abenaga.com |
| Setup | Connected to the GitHub repo — every push to `main` auto-deploys (~1 min) |
| Config | Root `vercel.json`: pnpm workspace build (`pnpm --filter @doggy-style/web build`), output `apps/web/dist`, SPA rewrites |
| Env vars (dashboard-set) | `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` |
| Plan | Free (Hobby) |

## Supabase (the backend)
| | |
|---|---|
| Project ref | `uunazqxidynrnsjvypan` → https://uunazqxidynrnsjvypan.supabase.co |
| CLI | v2.30.4 at `~/.local/bin/supabase`; project linked in ~/doggy-style |
| Migrations | `supabase/migrations/*.sql` — applied manually via `supabase db push` (NOT auto-deployed) |
| Edge functions | `supabase/functions/notification-digest` — deployed via `supabase functions deploy notification-digest` (interactive, owner's terminal). Binds secrets at DEPLOY time. |
| Secrets set | `RESEND_API_KEY` |
| Auth | Email/password; user's account email changed to abenagainc@gmail.com to match Resend test sender |
| Storage buckets | `dog-photos` (**public**, unguessable UUID paths), `verification-docs` (**private**, staff+owner policies) |
| Extensions in use | pg_cron + pg_net (daily digest cron `doggy-style-notification-digest` at 09:00 UTC) |
| Realtime | `messages` table publication for chat (if chat lags, check `alter publication supabase_realtime add table public.messages`) |
| Plan | Free tier |

## Resend (transactional email)
| | |
|---|---|
| Purpose | Notification digest emails |
| Sender (current) | `onboarding@resend.dev` — TEST MODE: delivers ONLY to abenagainc@gmail.com until a domain is verified |
| API key | Stored in Supabase secrets as `RESEND_API_KEY` (never in repo/chat); rotate via resend.com/dashboard → API Keys |
| Cron | pg_cron job `doggy-style-notification-digest` posts to the edge function daily |
| Free tier | 3,000 emails/mo, 100/day cap; Pro $20/mo when needed |
| TODO | Buy domain → add in Resend dashboard → paste DNS records → update digest FROM address |

## Notion of local tooling (not cloud services)
| Tool | Location | Notes |
|---|---|---|
| node/npm | ~/.hermes/node/bin | via Hermes agent environment |
| gh CLI | ~/.local/bin/gh | workflow scope granted |
| supabase CLI | ~/.local/bin/supabase | v2.30.4; update available but not required |
| No Homebrew | — | machine uses manual binary installs to ~/.local/bin |

## Cost exposure today
Everything runs on free tiers: Vercel Hobby, Supabase Free, Resend Free, GitHub Free.
First likely paid needs: domain (~$10/yr), then Supabase Pro / Resend Pro only at real scale.

## If access is lost
All services are owned via abenagainc's logins. Recovery = password reset through
each provider's dashboard. No shared secrets live in the repo by design.
