import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";

const env = Object.fromEntries(
  readFileSync(new URL("../apps/web/.env.local", import.meta.url), "utf8")
    .split("\n").filter((l) => l.includes("=")).map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1).trim()]),
);
const s = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY);
await s.auth.signInWithPassword({ email: "seed@doggy-style.test", password: "SeedAccount#2026" });

// Reproduce the UI path exactly: conversationFor -> insert message
const { data: conns } = await s.rpc("list_my_connections");
const active = conns.find((c) => c.status === "ACTIVE");
console.log("using connection:", active.id.substring(0, 8));

// Step 1: conversationFor (undelete + lookup + maybe insert)
const { error: undeleteErr } = await s.rpc("undelete_connection_chat", { p_connection_id: active.id });
console.log("undelete:", undeleteErr ? "ERR " + undeleteErr.message : "ok");
const { data: convo, error: lookupErr } = await s.from("conversations").select("id").eq("connection_id", active.id).maybeSingle();
console.log("convo lookup:", lookupErr ? "ERR " + lookupErr.message : (convo?.id ?? "null"));

let conversationId = convo?.id;
if (!conversationId) {
  const { data: created, error: createErr } = await s.from("conversations").insert({ connection_id: active.id }).select("id").single();
  console.log("create convo:", createErr ? "ERR " + createErr.message : created?.id);
  conversationId = created?.id;
}

// Step 2: sendMessage
const ownerId = (await s.auth.getUser()).data.user.id;
const { error: sendErr } = await s.from("messages").insert({ conversation_id: conversationId, sender_owner_id: ownerId, body: "CI test message" });
console.log("send:", sendErr ? "ERR " + sendErr.message + " | code=" + sendErr.code : "OK");
