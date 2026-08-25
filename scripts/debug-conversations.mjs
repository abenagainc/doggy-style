import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";

const env = Object.fromEntries(
  readFileSync(new URL("../apps/web/.env.local", import.meta.url), "utf8")
    .split("\n").filter((l) => l.includes("=")).map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1).trim()]),
);
const s = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY);

for (const acct of [
  { email: "seed@doggy-style.test", password: "SeedAccount#2026" },
]) {
  await s.auth.signInWithPassword(acct);
  const { data: conns, error } = await s.rpc("list_my_conversations");
  if (error) { console.log("RPC error:", error.message); continue; }
  console.log(`${acct.email}: ${conns.length} rows`);
  for (const c of conns) {
    console.log(`  myDog=${c.my_dog_id?.substring(0,8)} other=${c.other_dog_name} status=${c.status} hasMsg=${c.has_messages}`);
  }
}
