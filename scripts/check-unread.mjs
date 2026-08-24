import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";

const env = Object.fromEntries(
  readFileSync(new URL("../apps/web/.env.local", import.meta.url), "utf8")
    .split("\n").filter((l) => l.includes("=")).map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1).trim()]),
);
const admin = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY);

// Who still has unread notifications? Check both known accounts.
for (const acct of [
  { email: "seed@doggy-style.test", password: "SeedAccount#2026" },
]) {
  const { error } = await admin.auth.signInWithPassword(acct);
  if (error) { console.log(acct.email, "sign-in failed:", error.message); continue; }
  const { data } = await admin.from("notifications").select("id,type,created_at").is("read_at", null);
  console.log(acct.email, "unread:", data?.length ?? 0);
  await admin.auth.signOut();
}
