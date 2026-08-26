# SCALING.md — growth playbook

What breaks, in what order, and exactly what to do at each stage.
Read the stage you're entering; don't pre-optimize for stages you haven't reached.

## Stage 0 — Today (0–1K DAU) ✅ done

- Hot-path composite indexes (migration `03200`)
- Thumbnail transformation on list images (`?width=128&quality=75` — ~10-50KB vs multi-MB originals)
- Realtime chat with polling fallback; bell polling 8s
- Free tiers: Supabase / Vercel / Resend
- **Enable backups now** (Supabase Dashboard → Database → Backups → PITR on paid plan; free tier: daily logical dump via `supabase db dump` cron on any machine)

## Stage 1 — Early traction (1K–10K DAU)

Symptoms to watch: p95 API latency creeping past ~300ms; Supabase compute alerts.

Checklist:
1. **Supabase Pro ($25/mo)** — removes connection caps, adds PITR backups, 8GB database
2. **Replace notification polling with Realtime.** In `NotificationBell.tsx`, subscribe to
   `notifications` INSERTs filtered by owner instead of the 8s interval. Keep polling only as
   socket-error fallback. (Cuts steady-state DB reads by ~99%.)
3. **Verify indexes are being used**: run `EXPLAIN ANALYZE` on `eligible_candidates`,
   `list_my_connections`, `list_my_conversations` with production-shaped data (see scripts/seed-demo).
   Any seq scan on a 100k+ row table = add the missing index.
4. **Rate limiting** (spam protection becomes relevant): per-user quotas server-side —
   e.g. max 100 interests/day, 200 messages/hour. Implement in RPCs or an edge-function gate.
5. **Analytics wiring** (spec'd in docs/technical): event insert via RPC is fine at this scale.

## Stage 2 — Growth (10K–100K DAU)

Symptoms: feed loads >500ms; DB CPU sustained >60%; Realtime costs visible on invoice.

Checklist:
1. **Feed materialization.** `eligible_candidates` computes eligibility + score per call.
   Replace with a materialized pool:
   - table `candidate_feed_pool(source_dog_id, candidate_dog_id, rank_score, computed_at)`
   - refresh incrementally when either dog's profile/preferences/passes change (trigger)
     and nightly for drift (pg_cron)
   - feed query becomes an indexed SELECT with LIMIT/OFFSET or keyset pagination
2. **PostGIS + spatial index.** Add `location geography(point,4326)` generated column from
   lat,lon; GIST index; distance via `<->` KNN operator instead of runtime haversine.
3. **Keyset pagination everywhere** (no OFFSET — it degrades linearly).
4. **Compute upgrade**: Supabase dedicated compute (small → medium as CPU demands);
   consider a read replica for list RPCs if reads dominate.
5. **Vercel Pro** if bandwidth-limited; enable aggressive Cache-Control on static assets.
6. **Resend costs**: digest only when unread count ≥ threshold (e.g. 1); consider weekly
   digests for inactive users. Batch sends spread over off-peak hours (stagger the cron).

## Stage 3 — Scale (100K–1M DAU)

Symptoms: connection storms, hot rows, write contention.

Checklist:
1. **Dedicated Supabase compute + read replicas.** Route list/read RPCs to replica
   (Supabase supports read-only endpoints); writes stay primary.
2. **Connection pooling** via Supavisor transaction mode (port 6543) in all clients;
   set `prepared statements = false` accordingly.
3. **Notification fan-out hardening**: MATCH notifications create 2 rows; MESSAGE creates 1
   per message. At scale this is fine (indexed inserts) but watch autovacuum on
   `notifications`; consider partitioning by month if >100M rows.
4. **Image CDN strategy**: put Cloudflare/Fastly in front of storage, or move media to
   Cloudflare R2 + transform workers. Public bucket URLs are cacheable forever (UUID paths).
5. **Digest queueing**: replace single-loop edge function with chunked batches
   (e.g. queue table processed N-thousand per minute), or move to a queue service.
6. **Load testing regime**: k6/artillery against staging replica of prod shape before
   each major feature launch.

## Stage 4 — Massive success (1M+ DAU)

You need infrastructure staff by now. Sketch:
1. **Database sharding decision point**: partition `messages` and `notifications` by time
   or owner hash. Consider Citus or moving hot workloads off Postgres.
2. **Chat on dedicated realtime infra** (Supabase Realtime will strain; evaluate
   Pusher/Ably/self-hosted centrifugo) — keep Postgres as source of truth.
3. **Multi-region**: static edge everywhere (already have via Vercel), regional read
   replicas, sticky sessions not required (stateless API).
4. **Observability**: structured logs → pipeline; p95/p99 dashboards per endpoint;
   alerting on error rate, latency, saturation (DB CPU, connections, disk).
5. **Cost renegotiation**: at this volume, Supabase Enterprise / AWS RDS+own infra /
   self-hosted Postgres comparisons are worth a quarter of analysis.
6. **Incident playbook**: rollback procedure (Vercel instant rollback + migration-down discipline),
   feature flags for risky paths, status page.

## Cost model at each stage (approx, monthly)

| Stage | Supabase | Vercel | Resend | Total |
|---|---|---|---|---|
| 0 | $0 | $0 | $0 | $0 |
| 1 | $25 | $20 | $20 | ~$65 |
| 2 | $100–500 | $20–150 | $50–250 | ~$200–900 |
| 3 | $500–2.5K | $150–500 | $250–1K | ~$1K–4K |
| 4 | $2.5K–20K+ | $500–2K+ | $1K–5K | $5K–30K+ |

## Monitoring checklist (set up at Stage 1, refine forever)

- [ ] Supabase: CPU, memory, connections, disk, slowest queries dashboard reviewed weekly
- [ ] Vercel: error rate + p95 latency per route
- [ ] Client: web vitals (LCP on Discover is the money screen)
- [ ] Business: signups, likes sent/day, match rate, messages/day — sudden drops indicate breakage users don't report

## Emergency runbook pointers

- Site down → check Vercel deployments (instant rollback available)
- DB saturated → check pg_stat_activity for runaway queries; kill; find source via pg_stat_statements
- Email flood → disable the digest cron job (`select cron.unschedule('doggy-style-notification-digest')`)
- Data corruption → PITR restore (requires Stage 1+ backup setup — do not skip)
