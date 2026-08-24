import { useCallback, useEffect, useState } from "react";
import { supabase } from "./supabase.js";

interface Report { id: string; reason: string; details: string | null; status: string; reported_owner_id: string; created_at: string }
interface OwnerRow { owner_id: string; display_name: string | null; dog_count: number; verification: string; created_at: string; is_staff: boolean }
interface BlockRow { blocker_owner_id: string; blocked_owner_id: string; created_at: string }
interface VerificationRow { id: string; owner_id: string; display_name: string | null; storage_path: string; note: string | null; submitted_at: string }
type Stats = Record<string, number>;

const card = "card";

export function Admin() {
  const [authState, setAuthState] = useState<"loading" | "signed-out" | "ready" | "not-staff">("loading");
  const [tab, setTab] = useState<"stats" | "reports" | "verifications" | "users" | "blocks">("stats");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);

  const [reports, setReports] = useState<Report[] | null>(null);
  const [owners, setOwners] = useState<OwnerRow[] | null>(null);
  const [blocks, setBlocks] = useState<BlockRow[] | null>(null);
  const [stats, setStats] = useState<Stats | null>(null);
  const [verifications, setVerifications] = useState<VerificationRow[] | null>(null);
  const [cooldown, setCooldown] = useState<string>("");
  const [weights, setWeights] = useState<Record<string, number> | null>(null);
  const [weightsNote, setWeightsNote] = useState<string | null>(null);

  const WEIGHT_KEYS = [
    { key: "rank_weight_breed", label: "Breed match" },
    { key: "rank_weight_distance", label: "Distance" },
    { key: "rank_weight_verification", label: "Verification" },
  ];

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (!session) { setAuthState("signed-out"); return; }
      const { data: staff } = await supabase.rpc("is_staff");
      setAuthState(staff ? "ready" : "not-staff");
    });
  }, []);

  const loadAll = useCallback(async () => {
    const [r, o, b, s, cd, v] = await Promise.all([
      supabase.rpc("admin_list_reports"),
      supabase.rpc("admin_list_owners"),
      supabase.rpc("admin_list_blocks"),
      supabase.rpc("admin_stats"),
      supabase.rpc("get_setting", { p_key: "reinterest_cooldown_minutes" }),
      supabase.rpc("admin_list_verification_submissions"),
    ]);
    setReports((r.data as Report[]) ?? []);
    setOwners((o.data as OwnerRow[]) ?? []);
    setBlocks((b.data as BlockRow[]) ?? []);
    setStats((s.data as Stats) ?? null);
    setCooldown(String(cd.data ?? "5"));
    setVerifications((v.data as VerificationRow[]) ?? []);
  }, []);

  useEffect(() => { if (authState === "ready") void loadAll(); }, [authState, loadAll]);

  const signIn = async () => {
    setError(null);
    const { error: err } = await supabase.auth.signInWithPassword({ email, password });
    if (err) { setError(err.message); return; }
    const { data: staff } = await supabase.rpc("is_staff");
    setAuthState(staff ? "ready" : "not-staff");
  };

  const updateReport = async (id: string, status: string) => {
    await supabase.rpc("admin_update_report_status", { p_report_id: id, p_status: status });
    await loadAll();
  };

  const saveCooldown = async () => {
    setNote(null);
    const minutes = parseInt(cooldown, 10);
    if (!Number.isFinite(minutes) || minutes < 0) { setNote("Enter a non-negative number of minutes."); return; }
    const { error: err } = await supabase.rpc("set_setting", { p_key: "reinterest_cooldown_minutes", p_value: String(minutes) });
    setNote(err ? err.message : `Cooldown set to ${minutes} minute${minutes === 1 ? "" : "s"}.`);
  };

  const loadWeights = useCallback(async () => {
    const entries = await Promise.all(WEIGHT_KEYS.map(async ({ key }) => {
      const { data } = await supabase.rpc("get_setting", { p_key: key });
      return [key, Number(data ?? 0)] as const;
    }));
    setWeights(Object.fromEntries(entries));
  }, []);

  useEffect(() => { if (authState === "ready") void loadWeights(); }, [authState, loadWeights]);

  const saveWeights = async () => {
    setWeightsNote(null);
    if (!weights) return;
    for (const { key } of WEIGHT_KEYS) {
      const value = weights[key];
      if (!Number.isFinite(value) || value < 0) { setWeightsNote(`${key} must be a non-negative number.`); return; }
    }
    let firstError: string | null = null;
    for (const { key } of WEIGHT_KEYS) {
      const { error: err } = await supabase.rpc("set_setting", { p_key: key, p_value: String(weights[key]) });
      if (err && !firstError) firstError = `${key}: ${err.message}`;
    }
    setWeightsNote(firstError ?? "Ranking weights saved — feed order updates immediately.");
    if (!firstError) void loadAll();
  };

  const setUserActive = async (ownerId: string, active: boolean) => {
    await supabase.rpc("admin_set_owner_active", { p_owner_id: ownerId, p_active: active });
    setNote(active ? "Owner reactivated (dogs restored)." : "Owner deactivated (dogs archived, open connections closed).");
    await loadAll();
  };

  const setVerification = async (ownerId: string, status: string) => {
    await supabase.rpc("admin_set_verification", { p_owner_id: ownerId, p_status: status });
    setNote(`Verification set to ${status}.`);
    await loadAll();
  };

  const signOut = () => void supabase.auth.signOut().then(() => setAuthState("signed-out"));

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
        <button onClick={signOut}>Sign out</button>
      </main>
    );
  }

  const tabBtn = (id: typeof tab, label: string) => (
    <button key={id} onClick={() => setTab(id)}
      style={{ background: tab === id ? "var(--ink)" : "#fff", color: tab === id ? "#fff" : "var(--ink)" }}>
      {label}
    </button>
  );

  return (
    <main style={{ maxWidth: 720, margin: "0 auto", padding: 20 }}>
      <header style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
        <h1 style={{ margin: 0 }}>Admin</h1>
        <button onClick={signOut}>Sign out</button>
      </header>

      <div style={{ display: "flex", gap: 8, marginBottom: 18, flexWrap: "wrap" }}>
        {tabBtn("stats", "Overview")}
        {tabBtn("reports", `Reports (${reports?.filter((r) => r.status === "OPEN").length ?? 0})`)}
        {tabBtn("verifications", `Verifications (${verifications?.length ?? 0})`)}
        {tabBtn("users", "Users")}
        {tabBtn("blocks", "Blocks")}
      </div>

      {note && <p role="status">{note}</p>}

      {tab === "stats" && (
        <section className={card}>
          <h2>Platform overview</h2>
          {stats === null ? <p>Loading…</p> : (
            <dl style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
              {Object.entries(stats).map(([k, v]) => (
                <div key={k} style={{ background: "var(--paper)", borderRadius: 10, padding: "10px 14px" }}>
                  <dt style={{ fontSize: "0.78rem", textTransform: "uppercase", color: "var(--ink-soft)" }}>{k.replace(/_/g, " ")}</dt>
                  <dd style={{ fontSize: "1.5rem", fontWeight: 700, margin: 0 }}>{v}</dd>
                </div>
              ))}
            </dl>
          )}
          <hr />
          <h3>Re-interest cooldown (minutes)</h3>
          <label>
            <input type="number" min={0} value={cooldown} onChange={(e) => setCooldown(e.target.value)} style={{ maxWidth: 140 }} />
          </label>
          <button onClick={() => void saveCooldown()}>Save</button>
          <p><small>Applied when a decline stamps the cooldown. Production target: 10080 (1 week).</small></p>

          <hr />
          <h3>Ranking weights (playground)</h3>
          <p><small>Candidate score = breed·w₁ + distance·w₂ + verification·w₃. Signals are 0..1; higher weight = more influence on feed order. Changes apply immediately.</small></p>
          {weights === null ? <p>Loading…</p> : (
            <>
              {WEIGHT_KEYS.map(({ key, label }) => (
                <label key={key} style={{ display: "flex", alignItems: "center", gap: 12, margin: "8px 0" }}>
                  <span style={{ width: 110 }}>{label}</span>
                  <input type="range" min={0} max={3} step={0.1} value={weights![key] ?? 0}
                    onChange={(e) => setWeights({ ...weights!, [key]: Number(e.target.value) })}
                    style={{ flex: 1 }} />
                  <code style={{ width: 36, textAlign: "right" }}>{(weights![key] ?? 0).toFixed(1)}</code>
                </label>
              ))}
              <button onClick={() => void saveWeights()}>Save weights</button>
              {weightsNote && <p role="status">{weightsNote}</p>}
            </>
          )}
        </section>
      )}

      {tab === "reports" && (
        <section>
          {reports === null ? <p>Loading…</p> : reports.length === 0 ? <p className={card} style={{ padding: 14 }}>No reports. 🎉</p> : reports.map((r) => (
            <div key={r.id} className={card} style={{ padding: 14, marginBottom: 10 }}>
              <strong>{r.reason}</strong> — <span data-status={r.status}>{r.status.toLowerCase()}</span>{" "}
              <small>{new Date(r.created_at).toLocaleString()}</small>
              {r.details && <p style={{ margin: "6px 0" }}>{r.details}</p>}
              <small>reported owner: <code>{r.reported_owner_id.substring(0, 8)}…</code></small>
              <div style={{ marginTop: 8, display: "flex", gap: 8 }}>
                {["OPEN", "IN_REVIEW", "CLOSED"].map((s) => (
                  <button key={s} disabled={r.status === s} onClick={() => void updateReport(r.id, s)}>{s.replace("_", " ").toLowerCase()}</button>
                ))}
              </div>
            </div>
          ))}
        </section>
      )}

      {tab === "verifications" && (
        <section>
          <h2>Verification queue</h2>
          {verifications === null ? <p>Loading…</p> : verifications.length === 0 ? <p className={card} style={{ padding: 14 }}>No pending submissions.</p> : verifications.map((v) => (
            <div key={v.id} className={card} style={{ padding: 14, marginBottom: 10 }}>
              <strong>{v.display_name ?? "(no name)"}</strong>{" "}
              <small>{new Date(v.submitted_at).toLocaleString()}</small>
              {v.note && <p style={{ margin: "6px 0" }}>Owner note: "{v.note}"</p>}
              <small>owner: <code>{v.owner_id.substring(0, 8)}…</code></small>
              <VerificationDecision submissionId={v.id} storagePath={v.storage_path} onDone={() => void loadAll()} />
            </div>
          ))}
        </section>
      )}

      {tab === "users" && (
        <section>
          {owners === null ? <p>Loading…</p> : owners.map((o) => (
            <div key={o.owner_id} className={card} style={{ padding: 14, marginBottom: 10 }}>
              <strong>{o.display_name ?? "(no name)"}</strong>{" "}
              {o.is_staff && <span style={{ background: "var(--ink)", color: "#fff", borderRadius: 999, padding: "2px 8px", fontSize: "0.7rem" }}>STAFF</span>}{" "}
              — {o.dog_count} dog{o.dog_count === 1 ? "" : "s"} · <span data-status={o.verification}>{o.verification.toLowerCase()}</span>{" "}
              <small>joined {new Date(o.created_at).toLocaleDateString()}</small>
              <small style={{ display: "block" }}><code>{o.owner_id}</code></small>
              <div style={{ marginTop: 8, display: "flex", gap: 8, flexWrap: "wrap" }}>
                <select defaultValue="" onChange={(e) => { if (e.target.value) void setVerification(o.owner_id, e.target.value); e.currentTarget.selectedIndex = 0; }}>
                  <option value="">Set verification…</option>
                  {["NOT_STARTED", "PENDING", "APPROVED", "REJECTED"].map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
                {o.dog_count > 0
                  ? <button onClick={() => void setUserActive(o.owner_id, false)} style={{ borderColor: "var(--bad)", color: "var(--bad)" }}>Deactivate (archive dogs + close connections)</button>
                  : <button onClick={() => void setUserActive(o.owner_id, true)}>Reactivate</button>}
              </div>
            </div>
          ))}
        </section>
      )}

      {tab === "blocks" && (
        <section>
          {blocks === null ? <p>Loading…</p> : blocks.length === 0 ? <p className={card} style={{ padding: 14 }}>No blocks.</p> : blocks.map((b, i) => (
            <div key={`${b.blocker_owner_id}-${b.blocked_owner_id}-${i}`} className={card} style={{ padding: 12, marginBottom: 8 }}>
              <code>{b.blocker_owner_id.substring(0, 8)}</code> blocked <code>{b.blocked_owner_id.substring(0, 8)}</code>{" "}
              <small>{new Date(b.created_at).toLocaleString()}</small>
            </div>
          ))}
        </section>
      )}
    </main>
  );
}

/** Admin decision widget: shows the document (signed URL) + approve/reject with note. */
function VerificationDecision({ submissionId, storagePath, onDone }: { submissionId: string; storagePath: string; onDone: () => void }) {
  const [docUrl, setDocUrl] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void supabase.storage.from("verification-docs").createSignedUrl(storagePath, 600).then(({ data }) => setDocUrl(data?.signedUrl ?? null));
  }, [storagePath]);

  const decide = async (decision: "APPROVED" | "REJECTED") => {
    setBusy(true);
    await supabase.rpc("admin_decide_verification", { p_submission_id: submissionId, p_decision: decision, p_reviewer_note: note.trim() || null });
    setBusy(false);
    onDone();
  };

  return (
    <div style={{ marginTop: 8 }}>
      {docUrl && (
        <p>
          <a href={docUrl} target="_blank" rel="noreferrer">View document ↗</a>
          {/\.(png|jpe?g|webp|gif)$/i.test(storagePath) && (
            <> · <img src={docUrl} alt="verification doc" style={{ maxWidth: 200, maxHeight: 200, borderRadius: 8, verticalAlign: "middle" }} /></>
          )}
        </p>
      )}
      <label style={{ margin: "4px 0 8px" }}>
        Reviewer note (optional)
        <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. ID photo unclear" />
      </label>
      <div style={{ display: "flex", gap: 8 }}>
        <button disabled={busy} onClick={() => void decide("APPROVED")} style={{ borderColor: "var(--good)", color: "var(--good)" }}>Approve</button>
        <button disabled={busy} onClick={() => void decide("REJECTED")} style={{ borderColor: "var(--bad)", color: "var(--bad)" }}>Reject</button>
      </div>
    </div>
  );
}
