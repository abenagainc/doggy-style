// Auth admin edge function (staff only):
//   POST { action: "list" }              -> orphaned auth accounts (no owners row)
//   POST { user_id }                     -> delete that auth.users account
// The delete is used by admin_delete_owner flow so owner deletion also frees
// the email for re-registration; SQL cannot touch auth.users.
//
// Auto-injected secrets: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

async function requireStaff(req: Request): Promise<string | Response> {
  const token = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
  if (!token) return json(401, { error: "Missing Authorization header" });
  const { data, error } = await supabase.auth.getUser(token);
  if (error || !data?.user) return json(401, { error: "Invalid token" });
  const callerId = data.user.id;
  const { data: staffRow, error: staffErr } = await supabase
    .from("admin_staff")
    .select("owner_id")
    .eq("owner_id", callerId)
    .maybeSingle();
  if (staffErr || !staffRow) return json(403, { error: "Staff only" });
  return callerId;
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return json(405, { error: "Method not allowed" });

  const callerId = await requireStaff(req);
  if (callerId instanceof Response) return callerId;
  void callerId;

  let body: { user_id?: string; action?: string };
  try {
    body = await req.json();
  } catch {
    return json(400, { error: "Invalid JSON body" });
  }

  // --- List orphaned accounts: auth users with no owners row. ---------------
  if (body.action === "list") {
    // Paginate through all auth users (page size 500 per page).
    const orphans: { id: string; email: string | null; created_at: string }[] = [];
    let page = 1;
    for (;;) {
      const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 500 });
      if (error) return json(500, { error: error.message });
      const ownerIds = new Set(
        ((await supabase.from("owners").select("id")).data ?? []).map((o: { id: string }) => o.id),
      );
      for (const u of data.users) {
        if (!ownerIds.has(u.id)) {
          orphans.push({ id: u.id, email: u.email ?? null, created_at: u.created_at ?? "" });
        }
      }
      if (data.users.length < 500) break;
      page += 1;
    }
    return json(200, { orphans });
  }

  // --- Delete a single auth account ----------------------------------------
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
