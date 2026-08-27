import { useCallback, useEffect, useState } from "react";
import { supabase } from "./supabase.js";

interface Report { id: string; reason: string; details: string | null; status: string; reported_owner_id: string; created_at: string }
interface OwnerRow { owner_id: string; display_name: string | null; dog_count: number; verification: string; created_at: string; is_staff: boolean }
interface OwnerFullRow { owner_id: string; email: string; display_name: string | null; dog_count: number; active_dog_count: number; verification: string; is_active: boolean; created_at: string; is_staff: boolean }
interface BlockRow { blocker_owner_id: string; blocked_owner_id: string; created_at: string }
interface OrphanRow { id: string; email: string | null; created_at: string }
interface VerificationRow { id: string; owner_id: string; display_name: string | null; storage_path: string; note: string | null; submitted_at: string }
interface DogRow { id: string; owner_id: string; owner_display_name: string | null; name: string; sex: string; date_of_birth: string; breed: string; location: string | null; breeding_enabled: boolean; profile_status: string; availability_status: string; archived_at: string | null; created_at: string }
type Stats = Record<string, number>;

const card = "card";

export function Admin() {
  const [authState, setAuthState] = useState<"loading" | "signed-out" | "ready" | "not-staff">("loading");
  const [tab, setTab] = useState<"stats" | "reports" | "verifications" | "users" | "blocks" | "dogs">("stats");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);

  const [reports, setReports] = useState<Report[] | null>(null);
  const [owners, setOwners] = useState<OwnerRow[] | null>(null);
  const [ownerFull, setOwnerFull] = useState<OwnerFullRow[] | null>(null);
  const [blocks, setBlocks] = useState<BlockRow[] | null>(null);
  const [stats, setStats] = useState<Stats | null>(null);
  const [verifications, setVerifications] = useState<VerificationRow[] | null>(null);
  const [dogs, setDogs] = useState<DogRow[] | null>(null);
  const [cooldown, setCooldown] = useState<string>("");
  const [weights, setWeights] = useState<Record<string, number> | null>(null);
  const [weightsNote, setWeightsNote] = useState<string | null>(null);
  const [editingDog, setEditingDog] = useState<DogRow | null>(null);
  const [editingOwner, setEditingOwner] = useState<OwnerFullRow | null>(null);
  const [orphans, setOrphans] = useState<OrphanRow[] | null>(null);

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
    const [r, o, b, s, cd, v, d, of] = await Promise.all([
      supabase.rpc("admin_list_reports"),
      supabase.rpc("admin_list_owners"),
      supabase.rpc("admin_list_blocks"),
      supabase.rpc("admin_stats"),
      supabase.rpc("get_setting", { p_key: "reinterest_cooldown_minutes" }),
      supabase.rpc("admin_list_verification_submissions"),
      supabase.rpc("admin_list_dogs_full", { p_archived: false }),
      supabase.rpc("admin_list_owners_full"),
    ]);
    setReports((r.data as Report[]) ?? []);
    setOwners((o.data as OwnerRow[]) ?? []);
    setOwnerFull((of.data as OwnerFullRow[]) ?? []);
    setBlocks((b.data as BlockRow[]) ?? []);
    setStats((s.data as Stats) ?? null);
    setCooldown(String(cd.data ?? "5"));
    setVerifications((v.data as VerificationRow[]) ?? []);
    setDogs((d.data as DogRow[]) ?? []);
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

  const saveDogEdit = async () => {
    if (!editingDog) return;
    setNote(null);
    const { error: err } = await supabase.rpc("admin_edit_dog", {
      p_dog_id: editingDog.id,
      p_name: editingDog.name,
      p_sex: editingDog.sex,
      p_date_of_birth: editingDog.date_of_birth,
      p_breed: editingDog.breed,
      p_location: editingDog.location,
      p_breeding_enabled: editingDog.breeding_enabled,
    });
    if (err) { setNote(err.message); return; }
    setNote(`Dog "${editingDog.name}" updated.`);
    setEditingDog(null);
    await loadAll();
  };

  const archiveDog = async (id: string, name: string) => {
    if (!confirm(`Archive "${name}"? This hides them from discovery.`)) return;
    setNote(null);
    const { error: err } = await supabase.rpc("admin_archive_dog", { p_dog_id: id });
    if (err) { setNote(err.message); return; }
    setNote(`Dog "${name}" archived.`);
    await loadAll();
  };

  const unarchiveDog = async (id: string, name: string) => {
    setNote(null);
    const { error: err } = await supabase.rpc("admin_unarchive_dog", { p_dog_id: id });
    if (err) { setNote(err.message); return; }
    setNote(`Dog "${name}" unarchived.`);
    await loadAll();
  };

  const deleteDog = async (id: string, name: string) => {
    if (!confirm(`Permanently delete "${name}"? This removes all their interests, passes, connections, and messages. Irreversible!`)) return;
    setNote(null);
    const { data, error: err } = await supabase.rpc("admin_delete_dog", { p_dog_id: id });
    if (err) { setNote(err.message); return; }
    setNote(`Dog deleted. ${JSON.stringify(data)}`);
    await loadAll();
  };

  const saveOwnerEdit = async () => {
    if (!editingOwner) return;
    setNote(null);
    const { error: err } = await supabase.rpc("admin_edit_owner", {
      p_owner_id: editingOwner.owner_id,
      p_display_name: editingOwner.display_name,
    });
    if (err) { setNote(err.message); return; }
    setNote(`Owner "${editingOwner.display_name}" updated.`);
    setEditingOwner(null);
    await loadAll();
  };

  const deleteOwner = async (o: OwnerFullRow) => {
    if (!confirm(`Permanently delete ${o.email}? This removes the account and all data. Only owners with no dogs can be deleted.`)) return;
    setNote(null);
    const { error: err } = await supabase.rpc("admin_delete_owner", { p_owner_id: o.owner_id });
    if (err) { setNote(err.message); return; }
    // The owner row is gone; also delete the auth.users account so the email
    // can be re-registered. Done via edge function (SQL can't touch auth).
    const { data: { session } } = await supabase.auth.getSession();
    let authWarn = "";
    try {
      const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/auth-admin-delete`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${session?.access_token ?? ""}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ user_id: o.owner_id }),
      });
      if (!res.ok) authWarn = ` (auth account not deleted: ${(await res.json()).error})`;
    } catch {
      authWarn = " (auth account not deleted — network error)";
    }
    setNote(`Owner ${o.email} deleted.${authWarn}`);
    await loadAll();
  };

  const signOut = () => void supabase.auth.signOut().then(() => setAuthState("signed-out"));

  /** Fetch auth accounts that have no owners row (blocks re-registration). */
  const loadOrphans = async () => {
    setOrphans(null);
    const { data: { session } } = await supabase.auth.getSession();
    try {
      const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/auth-admin-delete`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${session?.access_token ?? ""}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ action: "list" }),
      });
      const body = await res.json();
      if (!res.ok) { setNote(`Could not list orphaned accounts: ${body.error}`); setOrphans([]); return; }
      setOrphans(body.orphans ?? []);
    } catch {
      setNote("Could not list orphaned accounts — network error.");
      setOrphans([]);
    }
  };

  const deleteOrphan = async (o: OrphanRow) => {
    if (!confirm(`Permanently delete auth account ${o.email ?? o.id}? This frees the email for re-registration. Irreversible!`)) return;
    setNote(null);
    const { data: { session } } = await supabase.auth.getSession();
    try {
      const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/auth-admin-delete`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${session?.access_token ?? ""}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ user_id: o.id }),
      });
      const body = await res.json();
      setNote(res.ok ? `Auth account ${o.email ?? o.id} deleted.` : `Delete failed: ${body.error}`);
    } catch {
      setNote("Delete failed — network error.");
    }
    await loadOrphans();
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
        {tabBtn("dogs", "Dogs")}
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
          <h2>Danger zone — reset matching data</h2>
          <p><small>Picks an owner or dog and wipes all their interests, passes, connections, chats and screening answers. For unsticking tests. Irreversible.</small></p>
          <ResetTool owners={owners ?? []} onNote={setNote} onDone={() => void loadAll()} />
          <h2 style={{ marginTop: 28 }}>All users</h2>
          {ownerFull === null ? <p>Loading…</p> : ownerFull.length === 0 ? <p className={card} style={{ padding: 14 }}>No users found.</p> : ownerFull.map((o) => (
            <div key={o.owner_id} className={card} style={{ padding: 14, marginBottom: 10 }}>
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <div>
                  <strong>{o.display_name ?? "(no name)"}</strong>{" "}
                  {o.is_staff && <span style={{ background: "var(--ink)", color: "#fff", borderRadius: 999, padding: "2px 8px", fontSize: "0.7rem" }}>STAFF</span>}{" "}
                  <small>{o.email}</small>
                  <br />
                  <small>
                    {o.dog_count} dog{o.dog_count === 1 ? "" : "s"} · {o.active_dog_count} active · <span data-status={o.verification.toLowerCase()}>{o.verification.toLowerCase()}</span>
                  </small>
                  <br />
                  <small>joined {new Date(o.created_at).toLocaleDateString()} • <code>{o.owner_id}</code></small>
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 8, alignItems: "flex-end" }}>
                  <button onClick={() => setEditingOwner({ ...o, display_name: o.display_name ?? "" })}>Edit name</button>
                  <select defaultValue="" onChange={(e) => { if (e.target.value) void setVerification(o.owner_id, e.target.value); e.currentTarget.selectedIndex = 0; }}>
                    <option value="">Set verification…</option>
                    {["NOT_STARTED", "PENDING", "APPROVED", "REJECTED"].map((s) => <option key={s} value={s}>{s}</option>)}
                  </select>
                  {o.dog_count > 0
                    ? <button onClick={() => void setUserActive(o.owner_id, false)} style={{ borderColor: "var(--bad)", color: "var(--bad)" }}>Deactivate (archive dogs + close connections)</button>
                    : <button onClick={() => void setUserActive(o.owner_id, true)}>Reactivate</button>}
                  {o.dog_count === 0 && <button onClick={() => void deleteOwner(o)} style={{ borderColor: "var(--bad)", color: "var(--bad)" }}>Delete account</button>}
                </div>
              </div>
              {editingOwner?.owner_id === o.owner_id && (
                <div style={{ marginTop: 10, padding: 10, border: "1px solid var(--line)", borderRadius: 10 }}>
                  <label>Display name
                    <input value={editingOwner.display_name ?? ""} onChange={(e) => setEditingOwner({ ...editingOwner, display_name: e.target.value })} />
                  </label>
                  <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
                    <button onClick={() => void saveOwnerEdit()}>Save</button>
                    <button onClick={() => setEditingOwner(null)}>Cancel</button>
                  </div>
                </div>
              )}
            </div>
          ))}

          <h2 style={{ marginTop: 28 }}>Orphaned auth accounts
            <button style={{ marginLeft: 12 }} onClick={() => void loadOrphans()}>Scan</button>
          </h2>
          <p><small>Auth accounts with no user profile — usually left behind by deletions before the auth-cleanup fix. They block their email from being re-registered. Scan to find them, delete to free the email.</small></p>
          {orphans === null ? <p style={{ color: "var(--ink-soft)" }}>Press Scan to check.</p> : orphans.length === 0 ? <p className={card} style={{ padding: 14 }}>No orphaned accounts. 🎉</p> : orphans.map((o) => (
            <div key={o.id} className={card} style={{ padding: 14, marginBottom: 10 }}>
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <div>
                  <strong>{o.email ?? "(no email)"}</strong>
                  <br />
                  <small>created {o.created_at ? new Date(o.created_at).toLocaleDateString() : "?"} • <code>{o.id}</code></small>
                </div>
                <button onClick={() => void deleteOrphan(o)} style={{ borderColor: "var(--bad)", color: "var(--bad)" }}>Delete</button>
              </div>
            </div>
          ))}
        </section>
      )}

      {tab === "dogs" && (
        <section>
          <h2>All dogs
            <label style={{ display: "inline", marginLeft: 12, fontSize: "0.8rem" }}>
              <input type="checkbox"
                checked={dogs === null || dogs.length === 0}
                onChange={(e) => {
                  void supabase.rpc("admin_list_dogs_full", { p_archived: e.target.checked }).then(({ data }) => setDogs((data as DogRow[]) ?? []));
                }}
              /> Show archived</label>
          </h2>
          {dogs === null ? <p>Loading…</p> : dogs.length === 0 ? <p className={card} style={{ padding: 14 }}>No dogs found.</p> : dogs.map((d) => (
            <div key={d.id} className={card} style={{ padding: 14, marginBottom: 10 }}>
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <div>
                  <strong>{d.name}</strong>{" "}
                  {d.archived_at && <span style={{ color: "var(--ink-soft)", fontSize: "0.8rem" }}>(archived)</span>}
                  <br />
                  <small>
                    {d.breed} · {d.sex.toLowerCase()} · DOB {new Date(d.date_of_birth).toLocaleDateString()} · {d.location ?? "no location"}
                  </small>
                  <br />
                  <small>
                    <span data-status={d.profile_status.toLowerCase()}>{d.profile_status.replace("_", " ")}</span> ·
                    <span data-status={d.availability_status.toLowerCase()}>{d.availability_status.toLowerCase()}</span> · breeding: {d.breeding_enabled ? "yes" : "no"}
                  </small>
                  <br />
                  <small>owner: <code>{d.owner_id.substring(0, 8)}…</code> {d.owner_display_name && `— ${d.owner_display_name}`}</small>
                  <br />
                  <small style={{ display: "block" }}><code>{d.id}</code></small>
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 8, alignItems: "flex-end" }}>
                  <button onClick={() => setEditingDog({ ...d })}>Edit</button>
                  {d.archived_at
                    ? <button onClick={() => void unarchiveDog(d.id, d.name)}>Unarchive</button>
                    : <button onClick={() => void archiveDog(d.id, d.name)} style={{ borderColor: "var(--ink-soft)", color: "var(--ink-soft)" }}>Archive</button>}
                  <button onClick={() => void deleteDog(d.id, d.name)} style={{ borderColor: "var(--bad)", color: "var(--bad)" }}>Delete</button>
                </div>
              </div>
              {editingDog?.id === d.id && (
                <DogEditForm dog={editingDog} onSave={() => void saveDogEdit()} onCancel={() => setEditingDog(null)} onChange={setEditingDog} />
              )}
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
function DogEditForm({ dog, onSave, onCancel, onChange }: {
  dog: DogRow;
  onSave: () => void;
  onCancel: () => void;
  onChange: (dog: DogRow) => void;
}) {
  return (
    <div style={{ marginTop: 10, padding: 10, border: "1px solid var(--line)", borderRadius: 10 }}>
      <label>Name<input value={dog.name} onChange={(e) => onChange({ ...dog, name: e.target.value })} /></label>
      <label>Sex
        <select value={dog.sex} onChange={(e) => onChange({ ...dog, sex: e.target.value })}>
          <option value="MALE">Male</option>
          <option value="FEMALE">Female</option>
        </select>
      </label>
      <label>Date of birth<input type="date" value={dog.date_of_birth ? dog.date_of_birth.split("T")[0] : ""} onChange={(e) => onChange({ ...dog, date_of_birth: e.target.value })} /></label>
      <label>Breed<input value={dog.breed} onChange={(e) => onChange({ ...dog, breed: e.target.value })} /></label>
      <label>Location<input value={dog.location ?? ""} onChange={(e) => onChange({ ...dog, location: e.target.value || null })} /></label>
      <label>
        Breeding enabled
        <input type="checkbox" checked={dog.breeding_enabled} onChange={(e) => onChange({ ...dog, breeding_enabled: e.target.checked })} />
      </label>
      <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
        <button onClick={() => void onSave()}>Save</button>
        <button onClick={onCancel}>Cancel</button>
      </div>
    </div>
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

/** Admin danger-zone: reset matching data for a single owner or dog (for testing). */
function ResetTool({ owners, onNote, onDone }: {
  owners: OwnerRow[];
  onNote: (note: string | null) => void;
  onDone: () => void;
}) {
  const [mode, setMode] = useState<"owner" | "dog">("owner");
  const [ownerId, setOwnerId] = useState("");
  const [dogId, setDogId] = useState("");
  const [dogs, setDogs] = useState<{ id: string; name: string; owner_id: string }[]>([]);
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (mode !== "dog" || dogs.length > 0) return;
    void supabase.rpc("admin_list_dogs").then(({ data }) => {
      setDogs((data as { id: string; name: string; owner_id: string }[]) ?? []);
    });
  }, [mode, dogs.length]);

  const run = async () => {
    setBusy(true); onNote(null);
    try {
      if (mode === "owner") {
        const { data, error: err } = await supabase.rpc("admin_reset_owner_matching", { p_owner_id: ownerId });
        if (err) throw new Error(err.message);
        onNote(`Owner reset complete: ${JSON.stringify(data)}`);
      } else {
        const { data, error: err } = await supabase.rpc("admin_reset_dog_matching", { p_dog_id: dogId });
        if (err) throw new Error(err.message);
        onNote(`Dog reset complete: ${JSON.stringify(data)}`);
      }
      setConfirming(false); setOwnerId(""); setDogId("");
      onDone();
    } catch (caught) {
      onNote(caught instanceof Error ? caught.message : "Reset failed.");
    } finally { setBusy(false); }
  };

  return (
    <div className={card} style={{ padding: 14 }}>
      <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
        <button onClick={() => setMode("owner")} style={{ background: mode === "owner" ? "var(--ink)" : "#fff", color: mode === "owner" ? "#fff" : "var(--ink)" }}>By owner</button>
        <button onClick={() => setMode("dog")} style={{ background: mode === "dog" ? "var(--ink)" : "#fff", color: mode === "dog" ? "#fff" : "var(--ink)" }}>By dog</button>
      </div>
      {mode === "owner" && (
        <label>Owner
          <select value={ownerId} onChange={(e) => setOwnerId(e.target.value)}>
            <option value="">Choose…</option>
            {owners.map((o) => <option key={o.owner_id} value={o.owner_id}>{o.display_name ?? o.owner_id.substring(0, 8)} ({o.dog_count} dogs)</option>)}
          </select>
        </label>
      )}
      {mode === "dog" && (
        <label>Dog
          <select value={dogId} onChange={(e) => setDogId(e.target.value)}>
            <option value="">Choose…</option>
            {dogs.map((d) => <option key={d.id} value={d.id}>{d.name} ({d.owner_id.substring(0, 8)})</option>)}
          </select>
        </label>
      )}
      {!confirming ? (
        <button disabled={busy || (mode === "owner" ? !ownerId : !dogId)} onClick={() => setConfirming(true)}>Reset…</button>
      ) : (
        <div style={{ marginTop: 8 }}>
          <p role="alert">Irreversible: wipes interests, passes, connections, chats and screening answers for this {mode}. Continue?</p>
          <button disabled={busy} onClick={() => void run()} style={{ borderColor: "var(--bad)", color: "var(--bad)" }}>{busy ? "…" : "Yes, reset everything"}</button>{" "}
          <button disabled={busy} onClick={() => setConfirming(false)}>Cancel</button>
        </div>
      )}
    </div>
  );
}
