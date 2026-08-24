import { useCallback, useEffect, useState } from "react";
import { AppError } from "@doggy-style/domain";
import { supabase } from "./supabase.js";

interface Submission {
  id: string; status: string; note: string | null; reviewer_note: string | null;
  storage_path: string; created_at: string;
}

export function VerificationSection({ verificationStatus }: { verificationStatus: string }) {
  const [submissions, setSubmissions] = useState<Submission[] | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const { data } = await supabase
      .from("verification_submissions")
      .select("id,status,note,reviewer_note,storage_path,created_at")
      .eq("owner_id", user.id)
      .order("created_at", { ascending: false });
    setSubmissions((data ?? []) as Submission[]);
  }, []);

  useEffect(() => { void load(); }, [load]);

  const submit = async () => {
    setErr(null); setMsg(null);
    if (!file) { setErr("Choose a document photo or PDF first."); return; }
    if (file.size > 5 * 1024 * 1024) { setErr("File too large (max 5 MB)."); return; }
    setBusy(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not signed in.");
      const path = `${user.id}/${Date.now()}-${file.name.replace(/[^\w.-]/g, "_")}`;
      const { error: upErr } = await supabase.storage.from("verification-docs").upload(path, file);
      if (upErr) throw new Error(upErr.message);
      const { error: rpcErr } = await supabase.rpc("submit_verification", { p_storage_path: path, p_note: note.trim() || null });
      if (rpcErr) throw new Error(rpcErr.message);
      setMsg("Submitted! An admin will review your document soon.");
      setFile(null); setNote("");
      await load();
    } catch (caught) {
      setErr(caught instanceof Error ? caught.message : caught instanceof AppError ? caught.message : "Submission failed.");
    } finally { setBusy(false); }
  };

  const pending = submissions?.some((s) => s.status === "PENDING");

  return (
    <section>
      <h2>Verification</h2>
      <p>Status: <strong data-status={verificationStatus.toLowerCase()}>{verificationStatus.toLowerCase()}</strong></p>
      <p><small>Tier-2 verification builds trust: upload a photo of ID or a short intro video. Only admins can view it.</small></p>

      {msg && <p role="status">{msg}</p>}
      {err && <p role="alert">{err}</p>}

      {!pending && (
        <>
          <label>Document (photo/PDF, max 5 MB)
            <input type="file" accept="image/*,application/pdf" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
          </label>
          <label>Note for the reviewer (optional)
            <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. passport photo, slightly cropped" />
          </label>
          <button disabled={busy} onClick={() => void submit()}>{busy ? "Uploading…" : "Submit for review"}</button>
        </>
      )}
      {pending && <p role="status">Your document is queued for review — check back later.</p>}

      {(submissions?.length ?? 0) > 0 && (
        <>
          <h3>Past submissions</h3>
          <ul style={{ paddingLeft: 0, listStyle: "none" }}>
            {submissions!.map((s) => (
              <li key={s.id} style={{ padding: "8px 12px", marginBottom: 6 }}>
                {new Date(s.created_at).toLocaleDateString()} — <span data-status={s.status === "PENDING" ? "active" : s.status === "APPROVED" ? "available" : "closed"}>{s.status.toLowerCase()}</span>
                {s.reviewer_note && <> · reviewer: "{s.reviewer_note}"</>}
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}
