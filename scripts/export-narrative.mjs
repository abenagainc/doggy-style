// Rebuild Doggy Style narrative doc using a verified, explicit milestone→content map.
import { execSync } from "node:child_process";
import { writeFileSync, statSync } from "node:fs";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const { Document, Packer, Paragraph, TextRun, HeadingLevel } = require("/tmp/node_modules/docx");

// Pull the session once, then hand-curate the narrative content using known milestones.
// This guarantees all sections render regardless of message keyword noise.
const SESSION = "20260823_170334_ab7dab";
const rows = execSync(
  `sqlite3 -json ~/.hermes/state.db "select role, content, timestamp from messages where session_id='${SESSION}' and role in ('user','assistant') and content is not null order by id;"`,
  { encoding: "utf8", maxBuffer: 200 * 1024 * 1024 },
);
const msgs = JSON.parse(rows);
console.error(`[debug] msgs=${msgs.length}`);

// Curated content per milestone section. Source: the actual chat outcomes.
const sections = [
  {
    title: "1. UI Progress Snapshot",
    short: "Where the UI stood at the start of this phase — full screens for every P0 flow, golden path working end-to-end.",
    body: "By mid-August the app had complete surfaces: Dogs (My Dogs with photo management), Discover (swipe deck), Likes (four-tab hub), Messages (conversation list), and Account. The golden path — signup → add dog → discover → interest → connection → chat → proceed — was live and exercised end to end. ~5,500 lines of TS/TSX across web + admin.",
  },
  {
    title: "2. Navigation Restructure (M9)",
    short: "Owner-mandated nav overhaul: Likes hub + Messages as a top-level tab.",
    body: "Two changes: (a) rename 'Interests' to 'Likes' and combine likes+connections into one hub with four sub-tabs — Received, Sent, Passes, Connections; (b) move Messages out of Connections into its own top-level tab. Likes exclusivity was also introduced — a dog lives in exactly one list. Admin gained a tab-aware reset so testing fresh states is instant (no manual SQL). Committed across 5a5d9e0 → 6f1d652.",
  },
  {
    title: "3. Likes Exclusivity Model",
    short: "A dog appears in exactly one list, with a single defined exception.",
    body: "After a like is reciprocated into a connection, like rows are marked MATCHED (kept for history, filtered from lists). A dog shows in exactly one of: likes-received, likes-sent, passes, connections. The one exception: if a dog was passed and *then* receives a like, it appears in BOTH passes and likes-received until liked, at which point it moves to connections and leaves both. Enforced by trigger + a fresh 02700/02800 split (enum add must precede trigger usage in separate transactions).",
  },
  {
    title: "4. Thumbnail Overhaul",
    short: "Replaced placeholder image stacks with real cover photos rendered as thumbnails everywhere.",
    body: "Migration 02600 added a dog_cover_photo(dog) helper and made list_my_connections return other_dog_cover; interests listing returns cover too. Likes (all four tabs) and Messages now render real 128px thumbnails instead of placeholder stacks. Photos show cover-first with explicit sort order. Covers the Discover card, Likes mini-card, Messages mini-card, and profile gallery.",
  },
  {
    title: "5. Multi-Photo Gallery with Cover Selection",
    short: "Owners upload multiple photos per dog, pick a cover; swipeable gallery with dotted pagination.",
    body: "PhotoGallery.tsx (swipe + dotted pagination) wired into DogCard in App.tsx. Owner upload returns a signed URL via dog-photos bucket (public). Each photo has is_cover + sort_order; the first/photo-cover used as the card thumbnail, cover used in profile gallery. Move-up / move-down / set-cover operations via RPC.",
  },
  {
    title: "6. Messages — New vs Active Connections",
    short: "Two stacked sections on one page: new unmatched connections (top), active chats (bottom).",
    body: "Messages tab no longer has two tabs — it's a single scrolling page with 'New connections' (matched dogs, chat not yet initiated) at the top and 'Active connections' (at least one message exchanged, showing last-message preview) below. A dog moves from New → Active the instant a message is sent or received. RPC list_my_conversations was rebuilt three times during this work (split → LEFT JOIN fix → count-based has_messages), culminating in migration 03100. Direct chat open from either section; back returns to the list — no intermediate step.",
  },
  {
    title: "7. Health Check & Code Refactor",
    short: "All gates green; split monolith components for maintainability.",
    body: "Health: typecheck ✅, 37/37 unit tests ✅, production build ✅, regression 12/12 ✅, DB in sync. Refactor: App.tsx (500→119 lines, pure shell), MyDogs.tsx + Account.tsx extracted, Connections.tsx (468→164) split — Chat/ThreadPanel/Screening/Proceed/Safety moved into Chat.tsx. No behavior changes; TypeScript strict; pnpm workspaces.",
  },
  {
    title: "8. Scaling Foundations",
    short: "Indexes, image transforms, and a stage-by-stage scaling playbook.",
    body: "Added 13 hot-path composite indexes via migration 03200 (interests status, connections owner/participant, conversations, messages conv/sent, notifications unread, dog_photos cover). Images now serve 128px@q75 renditions (?width=128&quality=75) — ~10-50KB vs multi-MB originals. Wrote docs/SCALING.md covering Stages 0-4 (traffic thresholds, exact moves per stage, cost tables, monitoring checklist, emergency runbook).",
  },
  {
    title: "9. Repo Size & Structure",
    short: "~60.5K words / ~80-95K tokens — fits in one modern model context.",
    body: "186 files total: apps/ (19.9K words, 5,500 lines), supabase/ (15.9K, 32 migrations + function), docs/ (9.9K), packages/ (7.2K, domain + matching engine), scripts/ (3.2K, verification + debug tools). Lean by discipline: scoped migrations, shared packages, focused components. A 200K-token model can hold the entire repo at once.",
  },
  {
    title: "10. Documentation Archive",
    short: "Handoff artifacts for seamless future continuation.",
    body: "This curated narrative + two full-archive documents on the Desktop: (1) 'Doggy Style — Chat History.docx' (5,252 messages, complete session), (2) this 'Build Narrative' (readable milestones). Additionally: HANDOFF.md (current state), docs/product/32-Scope_Amendments.md (scope changes), docs/SCALING.md (growth playbook), docs/ARCHITECTURE.md, docs/SERVICES.md, AGENTS.md (working constitution).",
  },
];

// Build doc
const children = [
  new Paragraph({ text: "Doggy Style — Build Narrative", heading: HeadingLevel.TITLE }),
  new Paragraph({ children: [new TextRun({ text: "Curated milestone history · 23–26 August 2026", italics: true, color: "666666" })] }),
  new Paragraph({ text: "A readable summary of the key decisions, deliverables, and bug fixes so a future maintainer (human or model) can onboard in minutes.", spacing: { after: 200 } }),
];

for (const s of sections) {
  children.push(new Paragraph({ text: s.title, heading: HeadingLevel.HEADING_2, spacing: { before: 320 } }));
  children.push(new Paragraph({ children: [new TextRun({ text: s.short, color: "555555" })] }));
  children.push(new Paragraph({ text: s.body, spacing: { after: 60 } }));
}

children.push(new Paragraph({ text: "Appendix — File Inventory", heading: HeadingLevel.HEADING_2, spacing: { before: 320 } }));
const inv = `[docs]
docs/product/32-Scope_Amendments.md      — nav restructure, exclusivity, photo/gallery spec
docs/ARCHITECTURE.md                     — system flow, components, data flow
docs/SERVICES.md                          — Supabase, Resend, Vercel cost tiers
docs/SCALING.md                           — growth playbook Stages 0-4
HANDOFF.md                                — current state + known gotchas
AGENTS.md                                 — project working constitution

[supabase/migrations]
20260823000500_discovery_feed_rpc.sql     — eligible_candidates (feed)
20260823001600_interests_exclusivity.sql  — MATCHED enum + trigger (02700/02800)
20260823002600_cover_thumbnails.sql       — dog_cover_photo() helper + cover cols
20260823002900_messages_split_fix.sql     — has_messages count fix
20260823003200_hot_path_indexes.sql       — 13 composite indexes
20260823003100_list_conversations_fix.sql — LEFT JOIN null-predicate bug fix

[apps/web/src]
App.tsx (119)        — nav shell, DogSwitcher
MyDogs.tsx (224)      — dog list, editor, photos
Account.tsx (45)      — profile + sign-out
Connections.tsx (164) — connections list (New/Active)
Chat.tsx              — ChatView + ThreadPanel + Screening/Proceed/Safety
Likes.tsx             — 4-tab hub (received/sent/passes/connections)
Messages.tsx (99)     — stacked New/Active sections
PhotoGallery.tsx      — swipe + dotted pagination
conversationsData.ts  — typed list_my_conversations wrapper
`;
children.push(new Paragraph({ children: [new TextRun({ text: inv, font: "Courier New", size: 20 })] }));

const doc = new Document({
  sections: [{
    properties: { page: { margin: { top: 1000, right: 1000, bottom: 1000, left: 1000 } } },
    children,
  }],
});

Packer.toBuffer(doc).then((buf) => {
  const out = "/Users/abenagainc/Desktop/Doggy Style — Build Narrative.docx";
  writeFileSync(out, Buffer.from(buf));
  const kb = (statSync(out).size / 1024).toFixed(1);
  console.error(`[done] ${out} (${kb} KB, ${sections.length} sections)`);
});
