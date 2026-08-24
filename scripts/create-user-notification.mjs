import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";

const env = Object.fromEntries(
  readFileSync(new URL("../apps/web/.env.local", import.meta.url), "utf8")
    .split("\n").filter((l) => l.includes("=")).map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1).trim()]),
);
const admin = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY);
await admin.auth.signInWithPassword({ email: "seed@doggy-style.test", password: "SeedAccount#2026" });

// User's owner id (from earlier session data): their account owns Dooby/Noshka.
const USER_OWNER = "00003b36-2537-4add-a1fe-2d04e737bada";

// Find one of their dogs via eligible_candidates from a seed dog.
const { data: rosie } = await admin.from("dogs").select("id").eq("name", "Luna").limit(1).single();
const { data: cands } = await admin.rpc("eligible_candidates", { p_source_dog_id: rosie.id });
console.log("candidates for Luna:", cands?.map((c) => c.name).join(", ") ?? "none");

const target = cands?.[0];
if (!target) { console.log("no candidate found"); process.exit(1); }

const { error } = await admin.from("notifications").insert({
  owner_id: target.owner_id,
  dog_id: target.id,
  type: "INTEREST_RECEIVED",
  payload: { fromDogName: "Rosie (digest test)", strength: "NORMAL" },
});
console.log(`notification for ${target.name} (${target.owner_id.substring(0,8)}):`, error ? "ERR " + error.message : "OK");
