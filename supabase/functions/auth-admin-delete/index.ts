// Auth admin edge function: deletes an auth.users account (staff only).
// Called by the admin panel's delete-owner flow so owner deletion also frees
// the email for re-registration. Plain SQL cannot delete auth users, hence
// this function.
//
// Auto-injected secrets: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method !== "POST") return json(405, { error: "Method not allowed" });

  const token = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
  if (!token) return json(401, { error: "Missing Authorization header" });

  // Verify the caller's JWT and identity.
  const { data: userData, error: userErr } = await supabase.auth.getUser(token);
  if (userErr || !userData?.user) return json(401, { error: "Invalid token" });
  const callerId = userData.user.id;

  // Staff check: same rule as public.is_staff(), evaluated with service role
  // against the admin_staff table using the CALLER's id (not the target's).
  const { data: isStaff, error: staffErr } = await supabase
    .from("admin_staff")
    .select("owner_id")
    .eq("owner_id", callerId)
    .maybeSingle();
  if (staffErr || !isStaff) return json(403, { error: "Staff only" });

  let body: { user_id?: string };
  try {
    body = await req.json();
  } catch {
    return json(400, { error: "Invalid JSON body" });
  }
  const targetId = body.user_id;
  if (!targetId || typeof targetId !== "string") {
    return json(400, { error: "user_id required" });
  }
  if (targetId === callerId) {
    return json(400, { error: "You cannot delete your own account here" });
  }

  // Safety net: refuse to delete an auth user that still has an owner row.
  const { data: ownerRow } = await supabase.from("owners").select("id").eq("id", targetId).maybeSingle();
  if (ownerRow) {
    return json(409, { error: "Owner row still exists — delete it first" });
  }

  const { error: delErr } = await supabase.auth.admin.deleteUser(targetId);
  if (delErr) return json(500, { error: delErr.message });

  return json(200, { ok: true });
});
