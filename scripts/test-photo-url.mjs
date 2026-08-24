import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";

const env = Object.fromEntries(
  readFileSync(new URL("../apps/web/.env.local", import.meta.url), "utf8")
    .split("\n").filter((l) => l.includes("=")).map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1).trim()]),
);
const s = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY);
await s.auth.signInWithPassword({ email: "seed@doggy-style.test", password: "SeedAccount#2026" });

const { data: rosie } = await s.from("dogs").select("id,name").eq("name", "Rosie").single();
const { data: candidates, error: feedErr } = await s.rpc("eligible_candidates", { p_source_dog_id: rosie.id });
console.log("feed error:", feedErr?.message ?? "none", "| candidates:", candidates.length);

const cand = candidates[0];
if (!cand) { console.log("no candidates to test with"); process.exit(0); }
console.log("testing candidate_photo_url for:", cand.name, "| path:", cand.photo_path?.substring(0, 50));

const { data: url, error: urlErr } = await s.rpc("candidate_photo_url", {
  p_viewer_dog_id: rosie.id,
  p_storage_path: cand.photo_path,
});
console.log("rpc error:", urlErr ? urlErr.message : "none");
console.log("url result:", url ? url.substring(0, 100) + "..." : "NULL — function returned nothing");
