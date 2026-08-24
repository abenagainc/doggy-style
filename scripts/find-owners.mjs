import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";

const env = Object.fromEntries(
  readFileSync(new URL("../apps/web/.env.local", import.meta.url), "utf8")
    .split("\n").filter((l) => l.includes("=")).map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1).trim()]),
);
const admin = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY);

// Find the user's real account: owners that are NOT the seed account.
await admin.auth.signInWithPassword({ email: "seed@doggy-style.test", password: "SeedAccount#2026" });
const { data: dogs } = await admin.from("dogs").select("name,owner_id").limit(30);
const byOwner = new Map();
for (const d of dogs ?? []) {
  const entry = byOwner.get(d.owner_id) ?? [];
  entry.push(d.name);
  byOwner.set(d.owner_id, entry);
}
for (const [ownerId, names] of byOwner) {
  const isSeed = names.length >= 15; // seed has ~20 dogs
  console.log(ownerId.substring(0, 8), isSeed ? "(seed)" : "(USER)", "-", names.slice(0, 5).join(", "));
}
