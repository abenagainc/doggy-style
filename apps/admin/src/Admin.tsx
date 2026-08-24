import { useCallback, useEffect, useState } from "react";
import { supabase } from "./supabase.js";

interface Report {
  id: string;
  reason: string;
  details: string | null;
  status: string;
  reported_owner_id: string;
  created_at: string;
}

export function Admin() {
  const [authState, setAuthState] = useState<"loading" | "signed-out" | "ready" | "not-staff">("loading");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [reports, setReports] = useState<Report[] | null>(null);
  const [cooldown, setCooldown] = useState<string>("");
  const [settingsNote, setSettingsNote] = useState<string | null>(null);

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (!session) { setAuthState("signed-out"); return; }
      const { data: staff } = await supabase.rpc("is_staff");
      setAuthState(staff ? "ready" : "not-staff");
    });
  }, []);

  const loadAdminData = useCallback(async () => {
    const [reportsRes, cooldownRes] = await Promise.all([
      supabase.rpc("admin_list_reports"),
      supabase.rpc("get_setting", { p_key: "reinterest_cooldown_minutes" }),
    ]);
    setReports((reportsRes.data as Report[]) ?? []);
    setCooldown(String(cooldownRes.data ?? "5"));
  }, []);

  useEffect(() => {
    if (authState === "ready") void loadAdminData();
  }, [authState, loadAdminData]);

  const signIn = async () => {
    setError(null);
    const { error: err } = await supabase.auth.signInWithPassword({ email, password });
    if (err) { setError(err.message); return; }
    const { data: staff } = await supabase.rpc("is_staff");
    setAuthState(staff ? "ready" : "not-staff");
  };

  const updateReport = async (id: string, status: string) => {
    await supabase.rpc("admin_update_report_status", { p_report_id: id, p_status: status });
    await loadAdminData();
  };

  const saveCooldown = async () => {
    setSettingsNote(null);
    const minutes = parseInt(cooldown, 10);
    if (!Number.isFinite(minutes) || minutes < 0) { setSettingsNote("Enter a non-negative number of minutes."); return; }
    const { error: err } = await supabase.rpc("set_setting", { p_key: "reinterest_cooldown_minutes", p_value: String(minutes) });
    setSettingsNote(err ? err.message : `Cooldown set to ${minutes} minute${minutes === 1 ? "" : "s"}.`);
  };

  if (authState === "loading") return <p style={{ padding: 24 }}>Loading…</p>;

  if (authState === "signed-out") {
    return (
      <main style={{ maxWidth: 360, margin: "60px auto", padding: 16 }}>
        <h1>Doggy Style Admin</h1>
        {error && <p role="alert">{error}</p>}
        <label>Email<input type="email" value={email} onChange={(e) => setEmail(e.target.value)} /></label>
        <label>Password<input type="password" value={password} onChange={(e) => setPassword(e.target.value)} /></label>
        <button style={{ width: "100%", marginTop: 12 }} onClick={() => void signIn()}>Sign in</button>
      </main>
    );
  }

  if (authState === "not-staff") {
    return (
      <main style={{ maxWidth: 430, margin: "60px auto", padding: 16 }}>
        <h1>Doggy Style Admin</h1>
        <p role="alert">This account is not an admin. Staff access is granted by inserting your user id into <code>admin_staff</code>.</p>
        <button onClick={() => void supabase.auth.signOut().then(() => setAuthState("signed-out"))}>Sign out</button>
      </main>
    );
  }

  return (
    <main style={{ maxWidth: 640, margin: "0 auto", padding: 20 }}>
      <header style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <h1 style={{ margin: 0 }}>Admin</h1>
        <button onClick={() => void supabase.auth.signOut().then(() => setAuthState("signed-out"))}>Sign out</button>
      </header>

      <section style={{ marginTop: 24 }}>
        <h2>Platform settings</h2>
        <label>
          Re-interest cooldown (minutes)
          <input type="number" min={0} value={cooldown} onChange={(e) => setCooldown(e.target.value)} style={{ maxWidth: 140 }} />
        </label>
        <button onClick={() => void saveCooldown()}>Save</button>
        {settingsNote && <p role="status">{settingsNote}</p>}
        <p><small>Applied when a decline stamps the cooldown. Production target: 10080 (1 week).</small></p>
      </section>

      <section style={{ marginTop: 28 }}>
        <h2>Reports ({reports?.length ?? 0})</h2>
        {reports === null ? <p>Loading…</p> : reports.length === 0 ? <p>No reports. 🎉</p> : (
          <ul style={{ listStyle: "none", padding: 0 }}>
            {reports.map((r) => (
              <li key={r.id} style={{ border: "1px solid #e5e5ea", borderRadius: 12, padding: 14, marginBottom: 10 }}>
                <strong>{r.reason}</strong> — <span data-status={r.status}>{r.status.toLowerCase()}</span>{" "}
                <small>{new Date(r.created_at).toLocaleString()}</small>
                {r.details && <p style={{ margin: "6px 0" }}>{r.details}</p>}
                <small>owner: <code>{r.reported_owner_id.substring(0, 8)}…</code></small>
                <div style={{ marginTop: 8, display: "flex", gap: 8 }}>
                  {["OPEN", "UNDER_REVIEW", "CLOSED"].map((s) => (
                    <button key={s} disabled={r.status === s} onClick={() => void updateReport(r.id, s)}>{s.replace("_", " ")}</button>
                  ))}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
