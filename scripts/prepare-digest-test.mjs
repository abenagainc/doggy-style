import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";

const env = Object.fromEntries(
  readFileSync(new URL("../apps/web/.env.local", import.meta.url), "utf8")
    .split("\n").filter((l) => l.includes("=")).map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1).trim()]),
);
const admin = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY);

// Sign in as seed, find the seed's owner id via their dogs, mark all read.
await admin.auth.signInWithPassword({ email: "seed@doggy-style.test", password: "SeedAccount#2026" });
const { data: notifs } = await admin.from("notifications").select("id").is("read_at", null);
console.log("seed unread before:", notifs?.length ?? 0);
const { error } = await admin.from("notifications").update({ read_at: new Date().toISOString() }).is("read_at", null);
console.log("mark-read:", error ? "ERR " + error.message : "OK");
const { data: after } = await admin.from("notifications").select("id").is("read_at", null);
console.log("seed unread after:", after?.length ?? 0);

// Now create a fresh notification for the USER account so the digest has a valid recipient.
// Find user's owner id from a dog they own (Dooby).
const { data: dooby } = await admin.from("dogs").select("id,owner_id,name").eq("name", "Dooby").single();
if (!dooby) { console.log("no Dooby found"); process.exit(0); }
console.log("creating test notification for owner of", dooby.name, "(" + dooby.owner_id.substring(0,8) + ")");
const { error: insErr } = await admin.from("notifications").insert({
  owner_id: dooby.owner_id,
  dog_id: dooby.id,
  type: "INTEREST_RECEIVED",
  payload: { fromDogName: "Rosie (digest test)", strength: "NORMAL" },
});
console.log("insert notification:", insErr ? "ERR " + insErr.message : "OK");
