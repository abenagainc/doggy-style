import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";

const env = Object.fromEntries(
  readFileSync(new URL("../apps/web/.env.local", import.meta.url), "utf8")
    .split("\n").filter((l) => l.includes("=")).map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1).trim()]),
);
const s = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY);
await s.auth.signInWithPassword({ email: "seed@doggy-style.test", password: "SeedAccount#2026" });

const { data: convs } = await s.from("conversations").select("id");
console.log("conversations visible:", convs?.length ?? 0);
for (const cv of convs ?? []) {
  const { count, error } = await s.from("messages").select("*", { count: "exact", head: true }).eq("conversation_id", cv.id);
  console.log(`conv ${cv.id.substring(0, 8)}: ${count} messages`, error ? `ERR ${error.message}` : "");
}
