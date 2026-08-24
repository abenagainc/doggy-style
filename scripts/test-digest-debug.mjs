import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";

const env = Object.fromEntries(
  readFileSync(new URL("../apps/web/.env.local", import.meta.url), "utf8")
    .split("\n").filter((l) => l.includes("=")).map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1).trim()]),
);
const s = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY);

// Who has unread notifications? (anon can't read others' rows; use sign-ins)
const accounts = [
  { email: "seed@doggy-style.test", password: "SeedAccount#2026" },
];

for (const acct of accounts) {
  const { error } = await s.auth.signInWithPassword(acct);
  if (error) { console.log(acct.email, "sign-in failed"); continue; }
  const { data } = await s.from("notifications").select("id,type,payload,created_at").is("read_at", null);
  console.log(acct.email, "unread:", data?.length ?? 0);
  await s.auth.signOut();
}

// Also test a direct Resend send to find the real error message:
const resendKey = process.env.RESEND_KEY;
if (!resendKey) {
  console.log("\nTo see Resend's exact rejection reason, run:");
  console.log('  RESEND_KEY=re_xxxxxxxx node scripts/test-digest-debug.mjs');
} else {
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${resendKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: "onboarding@resend.dev",
      to: [acct.email],
      subject: "Resend direct test",
      html: "<p>Direct test from Doggy Style debugging.</p>",
    }),
  });
  console.log("direct resend status:", res.status);
  console.log(await res.text());
}
