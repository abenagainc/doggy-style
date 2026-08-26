import { useEffect, useState } from "react";
import { supabase } from "./supabase.js";
import { logout } from "./auth.js";
import { VerificationSection } from "./Verification.js";

export function Account() {
  const [email, setEmail] = useState<string>("");
  const [displayName, setDisplayName] = useState<string>("");
  const [verification, setVerification] = useState<string>("");
  const [note, setNote] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      setEmail(user.email ?? "");
      setDisplayName((user.user_metadata?.displayName as string | undefined) ?? "");
      const { data: owner } = await supabase.from("owners").select("verification_status").eq("id", user.id).single();
      setVerification((owner as { verification_status: string } | null)?.verification_status ?? "");
    })();
  }, []);

  const signOut = async () => {
    try { await logout(); window.location.reload(); }
    catch { setNote("Could not sign out."); }
  };

  return (
    <section>
      <h2>Account</h2>
      {note && <p role="alert">{note}</p>}
      <dl>
        <dt>Email</dt><dd>{email || "—"}</dd>
        <dt>Display name</dt><dd>{displayName || "—"}</dd>
        <dt>Verification</dt><dd data-status={verification.toLowerCase()}>{verification ? verification.replace("_", " ").toLowerCase() : "not started"}</dd>
      </dl>
      <VerificationSection verificationStatus={verification} />
      <button onClick={() => void signOut()}>Sign out</button>
    </section>
  );
}
