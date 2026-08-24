import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";

const env = Object.fromEntries(
  readFileSync(new URL("../apps/web/.env.local", import.meta.url), "utf8")
    .split("\n").filter((l) => l.includes("=")).map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1).trim()]),
);
const s = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY);
await s.auth.signInWithPassword({ email: "seed@doggy-style.test", password: "SeedAccount#2026" });

// Find Dooby and a seed dog, then try sending interest as the USER would.
const { data: dooby } = await s.from("dogs").select("id,name").eq("name", "Dooby").single();
console.log("Dooby:", dooby?.id);

// We can't act as the user from here (no creds), but we CAN check what blocks it:
// 1. Is the target still in eligible_candidates for Dooby?
const { data: cands } = await s.rpc("eligible_candidates", { p_source_dog_id: dooby.id });
console.log("eligible for Dooby:", cands?.length ?? 0, "->", cands?.map((c) => c.name).join(", "));
