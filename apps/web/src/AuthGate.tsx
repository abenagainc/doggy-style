import { useEffect, useState } from "react";
import { AppError } from "@doggy-style/domain";
import { ErrorState, LoadingState } from "@doggy-style/ui";
import { login, signUp } from "./auth.js";
import { supabase } from "./supabase.js";

const TERMS_VERSION = "2026-08-01";
const PRIVACY_NOTICE_VERSION = "2026-08-01";

/** Renders children only when a session exists; otherwise shows sign in / sign up. */
export function AuthGate({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<boolean | null>(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session: current } }) => setSession(Boolean(current)));
    const { data: subscription } = supabase.auth.onAuthStateChange((_event, next) => setSession(Boolean(next)));
    return () => subscription.subscription.unsubscribe();
  }, []);

  if (session === null) return <LoadingState />;
  if (!session) return <AuthScreen onSignedIn={() => setSession(true)} />;
  return <>{children}</>;
}
function AuthScreen({ onSignedIn }: { onSignedIn: () => void }) {
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault(); setBusy(true); setError(null); setInfo(null);
    try {
      if (mode === "login") {
        await login(email.trim(), password);
      } else {
        if (!acceptedTerms) throw new AppError("VALIDATION_ERROR", "Please accept the Terms and Privacy Notice.");
        await signUp({ email: email.trim(), password, displayName: displayName.trim() || undefined, termsVersion: TERMS_VERSION, privacyNoticeVersion: PRIVACY_NOTICE_VERSION, locale: "en", termsHash: TERMS_VERSION, privacyNoticeHash: PRIVACY_NOTICE_VERSION });
        setInfo("Account created. If email confirmation is enabled, check your inbox — then sign in.");
      }
      onSignedIn();
    } catch (caught) {
      setError(caught instanceof AppError ? caught.message : "Something went wrong. Please try again.");
    } finally { setBusy(false); }
  };

  return (
    <main>
      <h1>Doggy Style</h1>
      <p>Where good dogs find great matches. 🐾</p>
      {error && <p role="alert">{error}</p>}
      {info && <p role="status">{info}</p>}
      <form onSubmit={submit}>
        {mode === "signup" && (
          <label>Display name<br /><input value={displayName} onChange={(event) => setDisplayName(event.target.value)} /></label>
        )}
        <label>Email<br /><input type="email" required value={email} onChange={(event) => setEmail(event.target.value)} /></label>
        <label>Password<br /><input type="password" required minLength={8} value={password} onChange={(event) => setPassword(event.target.value)} /></label>
        {mode === "signup" && (
          <label>
            <input type="checkbox" checked={acceptedTerms} onChange={(event) => setAcceptedTerms(event.target.checked)} />{" "}
            I accept the Terms of Service and Privacy Notice ({TERMS_VERSION})
          </label>
        )}
        <button type="submit" disabled={busy}>{busy ? "…" : mode === "login" ? "Sign in" : "Create account"}</button>
      </form>
      <p>
        {mode === "login" ? (
          <>No account? <a href="#signup" onClick={(event) => { event.preventDefault(); setMode("signup"); }}>Sign up</a></>
        ) : (
          <>Have an account? <a href="#login" onClick={(event) => { event.preventDefault(); setMode("login"); }}>Sign in</a></>
        )}
      </p>
    </main>
  );
}
