import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";

const env = Object.fromEntries(
  readFileSync(new URL("../apps/web/.env.local", import.meta.url), "utf8")
    .split("\n").filter((l) => l.includes("=")).map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1).trim()]),
);
const s = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY);
const results = [];
const check = (name, ok, detail = "") => { results.push(`${ok ? "✅" : "❌"} ${name}${detail ? " — " + detail : ""}`); };

// Sign in as seed (has dogs + connections)
const { error: authErr } = await s.auth.signInWithPassword({ email: "seed@doggy-style.test", password: "SeedAccount#2026" });
check("auth", !authErr, authErr?.message ?? "");

// 1. Dogs
const { data: myDogs } = await s.from("dogs").select("id,name").limit(3);
check("dogs readable", (myDogs?.length ?? 0) > 0);

// 2. Discovery RPC
const { data: cands } = await s.rpc("eligible_candidates", { p_source_dog_id: myDogs[0].id });
check("eligible_candidates", Array.isArray(cands), `${cands.length} candidates`);
check("rank_score present", cands.length === 0 || cands[0].rank_score !== undefined);

// 3. Passed dogs
const { data: passed } = await s.rpc("list_passed_dogs", { p_source_dog_id: myDogs[0].id });
check("list_passed_dogs", Array.isArray(passed));

// 4. Notifications
const { data: notifs } = await s.from("notifications").select("id").limit(1);
check("notifications table", Array.isArray(notifs));
const { data: unread } = await s.rpc("unread_notification_count");
check("unread count rpc", typeof unread === "number");

// 5. Connections list
const { data: conns } = await s.rpc("list_my_connections");
check("list_my_connections", Array.isArray(conns) && conns.length > 0, `${conns.length} rows`);

// 6. Screening
const active = conns.find((c) => c.status !== "CLOSED");
if (active) {
  const { data: pending } = await s.rpc("pending_screening_questions", { p_connection_id: active.id });
  check("pending_screening_questions rpc", Array.isArray(pending));
}
const { data: questions } = await s.from("dog_screening_questions").select("id").limit(1);
check("screening questions readable", Array.isArray(questions));

// 7. Verification submissions
const { data: subs, error: subErr } = await s.from("verification_submissions").select("id,status").eq("owner_id", (await s.auth.getUser()).data.user.id);
check("verification_submissions readable", !subErr, subErr?.message ?? "");

// 8. Settings
const { data: cd } = await s.rpc("get_setting", { p_key: "reinterest_cooldown_minutes" });
check("settings rpc", cd !== null, `cooldown=${cd}`);

// 9. Realtime publication check (via pg query through a view is not possible; note manually)
console.log(results.join("\n"));
