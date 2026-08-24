// Notification digest edge function (M6).
// Sends each user with unread notifications a single digest email via Resend.
// Designed to run on a schedule (pg_cron calling the function via pg_net) or manually.
//
// Secrets required: RESEND_API_KEY, plus SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY
// (auto-injected into edge functions).
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const FROM = Deno.env.get("DIGEST_FROM_EMAIL") ?? "Doggy Style <onboarding@resend.dev>";
const APP_URL = Deno.env.get("APP_URL") ?? "https://doggy-style-drab.vercel.app";

const admin = createClient(SUPABASE_URL, SERVICE_ROLE);

interface NotifRow {
  id: string; owner_id: string; type: string; payload: Record<string, string>; created_at: string;
}

function describe(n: NotifRow): string {
  const p = n.payload ?? {};
  switch (n.type) {
    case "INTEREST_RECEIVED": return `🐶 <strong>${p.fromDogName ?? "Someone"}</strong> sent your dog interest${p.strength === "STRONG" ? " (strong)" : ""}.`;
    case "MATCH": return `💜 It's a match with <strong>${p.otherDogName}</strong>!`;
    case "MESSAGE": return `💬 New message: "${p.preview ?? ""}"`;
    case "PROCEEDING_CONFIRMED": return "🐾 Both owners confirmed proceeding.";
    default: return "You have an update.";
  }
}

async function sendDigest(email: string, items: NotifRow[]): Promise<boolean> {
  const listItems = items.slice(0, 10).map((n) => `<li style="margin:6px 0">${describe(n)}</li>`).join("");
  const more = items.length > 10 ? `<p style="color:#6e6e73">…and ${items.length - 10} more</p>` : "";
  const html = `
    <div style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;max-width:480px;margin:0 auto">
      <h1 style="font-size:22px">🐾 You have ${items.length} update${items.length === 1 ? "" : "s"} on Doggy Style</h1>
      <ul style="padding-left:18px">${listItems}</ul>
      ${more}
      <p style="margin-top:24px">
        <a href="${APP_URL}" style="background:#1c1c1e;color:#fff;padding:12px 24px;border-radius:999px;text-decoration:none;font-weight:600">Open Doggy Style</a>
      </p>
      <p style="color:#6e6e73;font-size:12px;margin-top:28px">You're receiving this because you have unread notifications.</p>
    </div>`;
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${RESEND_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from: FROM, to: [email], subject: `🐾 ${items.length} new update${items.length === 1 ? "" : "s"} on Doggy Style`, html }),
  });
  if (!res.ok) { console.error("resend error", email, await res.text()); return false; }
  return true;
}

Deno.serve(async () => {
  if (!RESEND_API_KEY) return new Response("RESEND_API_KEY not set", { status: 500 });

  // Owners with unread notifications + their email + the unread rows.
  // Email lives in auth.users, not public.owners — fetch separately via admin client.
  const { data: notifs, error } = await admin
    .from("notifications")
    .select("id,owner_id,type,payload,created_at")
    .is("read_at", null)
    .order("created_at", { ascending: false })
    .limit(500);
  if (error) return new Response(`query error: ${error.message}`, { status: 500 });

  const ownerIds = [...new Set((notifs ?? []).map((n: { owner_id: string }) => n.owner_id))] as string[];
  const emailById = new Map<string, string>();
  for (const uid of ownerIds) {
    const { data: user } = await admin.auth.admin.getUserById(uid);
    if (user?.user?.email) emailById.set(uid, user.user.email);
  }

  const byOwner = new Map<string, { email: string; items: NotifRow[] }>();
  for (const row of (notifs ?? []) as NotifRow[]) {
    const email = emailById.get(row.owner_id);
    if (!email) continue;
    const entry = byOwner.get(row.owner_id) ?? { email, items: [] };
    entry.items.push(row);
    byOwner.set(row.owner_id, entry);
  }

  let sent = 0, failed = 0;
  for (const [, { email, items }] of byOwner) {
    if (!email) continue;
    const ok = await sendDigest(email, items);
    ok ? sent++ : failed++;
  }
  console.log(`digest complete: ${sent} sent, ${failed} failed, ${byOwner.size} recipients`);
  return new Response(JSON.stringify({ sent, failed, recipients: byOwner.size }), { headers: { "Content-Type": "application/json" } });
});
