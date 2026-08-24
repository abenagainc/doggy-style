import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";

const env = Object.fromEntries(
  readFileSync(new URL("../apps/web/.env.local", import.meta.url), "utf8")
    .split("\n").filter((l) => l.includes("=")).map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1).trim()]),
);
const s = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY);

// Sign in as SEED and check interests BETWEEN user dogs and seed dogs using the
// participants-read policy: seed can read interests where a seed dog participates.
await s.auth.signInWithPassword({ email: "seed@doggy-style.test", password: "SeedAccount#2026" });
const { data: seedDogs } = await s.from("dogs").select("id,name");
const seedIds = new Set((seedDogs ?? []).map((d) => d.id));

const { data: interests } = await s.from("interests").select("id,source_dog_id,target_dog_id,status,cooldown_until,created_at");
console.log("interests visible to seed:", interests?.length ?? 0);
for (const i of interests ?? []) {
  const src = (seedDogs ?? []).find((d) => d.id === i.source_dog_id)?.name ?? i.source_dog_id.substring(0, 8);
  const tgt = (seedDogs ?? []).find((d) => d.id === i.target_dog_id)?.name ?? i.target_dog_id.substring(0, 8);
  console.log(` ${src} -> ${tgt}: ${i.status}${i.cooldown_until ? " (cooldown until " + i.cooldown_until + ")" : ""}`);
}
