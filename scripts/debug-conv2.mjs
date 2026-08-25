import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";

const env = Object.fromEntries(
  readFileSync(new URL("../apps/web/.env.local", import.meta.url), "utf8")
    .split("\n").filter((l) => l.includes("=")).map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1).trim()]),
);
const s = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY);
await s.auth.signInWithPassword({ email: "seed@doggy-style.test", password: "SeedAccount#2026" });

const { data: conns } = await s.rpc("list_my_conversations");
console.log("list_my_conversations rows:", conns?.length ?? 0);

// Compare with list_my_connections
const { data: lc } = await s.rpc("list_my_connections");
console.log("list_my_connections rows:", lc?.length ?? 0);
for (const c of lc ?? []) {
  console.log(` conn ${c.id.substring(0,8)} myDog=${c.my_dog_id?.substring(0,8)} status=${c.status}`);
}
