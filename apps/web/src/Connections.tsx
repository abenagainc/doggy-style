import { useCallback, useEffect, useState } from "react";
import { AppError } from "@doggy-style/domain";
import { EmptyState, ErrorState, LoadingState } from "@doggy-style/ui";
import { confirmProceeding, endConnection, listConnections, loadThread, sendMessage, type ChatMessage } from "./connectionsData.js";
import * as dogsData from "./dogsData.js";
import { blockOwner, otherOwnerInConnection, REPORT_REASONS, submitReport } from "./safety.js";

type View = { kind: "loading" } | { kind: "error"; message: string } | { kind: "empty" }
  | { kind: "list" } | { kind: "chat"; connectionId: string };

export function Connections({ activeDogId }: { activeDogId?: string | null }) {
  const [view, setView] = useState<View>({ kind: "loading" });
  const [items, setItems] = useState<Awaited<ReturnType<typeof listConnections>> | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [myDogNames, setMyDogNames] = useState<Map<string, string>>(new Map());

  useEffect(() => {
    dogsData.listMyDogs().then((dogs) => setMyDogNames(new Map(dogs.map((d) => [d.id, d.name])))).catch(() => undefined);
  }, []);

  const load = useCallback(async () => {
    setView({ kind: "loading" }); setNote(null);
    try {
      let rows = await listConnections();
      if (activeDogId) rows = rows.filter((row) => row.myDogId === activeDogId); // dog-scoped per docs/product/04
      setItems(rows);
      setView(rows.length ? { kind: "list" } : { kind: "empty" });
    } catch (caught) { setView({ kind: "error", message: describe(caught) }); }
  }, [activeDogId]);
  useEffect(() => { void load(); }, [load]);

  if (view.kind === "loading") return <LoadingState />;
  if (view.kind === "error") return <ErrorState message={view.message} retry={() => void load()} />;
  if (view.kind === "empty") return <EmptyState>No connections yet. Mutual interests create connections.</EmptyState>;
  if (view.kind === "chat") return <Chat connectionId={view.connectionId} onBack={() => void load()} />;

  return (
    <main>
      <h1>Connections</h1>
      {note && <p role="status">{note}</p>}
      <ul>
        {(items ?? []).map((row) => (
          <li key={row.id}>
            <strong>{row.otherDogName}</strong> — <span data-status={row.status}>{row.status.toLowerCase()}</span>{" "}
            <small>(your dog: {myDogNames.get(row.myDogId) ?? "unknown"})</small>{" "}
            <button onClick={() => setView({ kind: "chat", connectionId: row.id })}>Open conversation</button>
            {row.status !== "CLOSED" && <RejectButton connectionId={row.id} dogName={row.otherDogName} onDone={() => void load()} />}
          </li>
        ))}
      </ul>
    </main>
  );
}

function RejectButton({ connectionId, dogName, onDone }: { connectionId: string; dogName: string; onDone: () => void }) {
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [errorText, setErrorText] = useState<string | null>(null);

  const sever = async () => {
    setBusy(true); setErrorText(null);
    try {
      await endConnection(connectionId);
      setBusy(false);
      onDone();
    } catch (caught) { setErrorText(describe(caught)); setBusy(false); }
  };

  if (!confirming) {
    return <button onClick={() => setConfirming(true)}>Reject</button>;
  }
  return (
    <span>
      {" "}Close your connection with {dogName}? The conversation becomes read-only and cannot be reopened.{" "}
      <button disabled={busy} onClick={() => void sever()}>{busy ? "…" : "Yes, close it"}</button>{" "}
      <button disabled={busy} onClick={() => setConfirming(false)}>Cancel</button>
      {errorText && <span role="alert"> {errorText}</span>}
    </span>
  );
}

function Chat({ connectionId, onBack }: { connectionId: string; onBack: () => void }) {
  const [state, setState] = useState<"loading" | "error" | "ready">("loading");
  const [message, setMessage] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [status, setStatus] = useState<string>("ACTIVE");
  const [thread, setThread] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState("");

  const load = useCallback(async () => {
    setState("loading"); setMessage(null);
    try {
      const result = await loadThread(connectionId);
      setConversationId(result.conversationId); setStatus(result.status); setThread(result.messages); setState("ready");
    } catch (caught) { setMessage(describe(caught)); setState("error"); }
  }, [connectionId]);
  useEffect(() => { void load(); }, [load]);

  const submit = async () => {
    if (!conversationId || !draft.trim()) return;
    try {
      await sendMessage(conversationId, draft);
      setDraft("");
      const result = await loadThread(connectionId);
      setThread(result.messages);
    } catch (caught) { setMessage(describe(caught)); }
  };

  const proceed = async () => {
    try {
      const next = await confirmProceeding(connectionId);
      setStatus(next);
      setNote(next === "PROCEEDING" ? "Both owners confirmed — proceeding! 🐾" : "Proceeding confirmation recorded. Waiting for the other owner.");
    } catch (caught) { setMessage(describe(caught)); }
  };

  const end = async () => {
    try { await endConnection(connectionId); setStatus("CLOSED"); setNote("Connection ended."); }
    catch (caught) { setMessage(describe(caught)); }
  };

  if (state === "loading") return <LoadingState />;
  if (state === "error") return <ErrorState message={message ?? "Something went wrong."} retry={() => void load()} />;

  const readOnly = status === "CLOSED";
  return (
    <main>
      <p><a href="#back" onClick={(event) => { event.preventDefault(); onBack(); }}>← All connections</a></p>
      <h1>Conversation <span data-status={status}>({status.toLowerCase()})</span></h1>
      {message && <p role="alert">{message}</p>}
      {note && <p role="status">{note}</p>}
      <ul data-testid="thread">
        {thread.map((entry) => (
          <li key={entry.id} style={{ textAlign: entry.mine ? "right" : "left" }}>
            {entry.mine ? "You" : "Them"}: {entry.body}
          </li>
        ))}
      </ul>
      {readOnly ? (
        <EmptyState>This connection is closed. The conversation is read-only.</EmptyState>
      ) : (
        <form onSubmit={(event) => { event.preventDefault(); void submit(); }}>
          <input value={draft} onChange={(event) => setDraft(event.target.value)} placeholder="Write a message…" aria-label="Message" />
          <button type="submit">Send</button>
        </form>
      )}
      {!readOnly && status !== "PROCEEDING" && (
        <section>
          <h2>Proceeding</h2>
          <p>Both owners must confirm before this connection proceeds. Confirming records your intent — it is not a payment or contract.</p>
          <button onClick={() => void proceed()}>Confirm proceeding</button>
        </section>
      )}
      {status === "PROCEEDING" && <p role="status">🐾 Both owners confirmed proceeding.</p>}
      {!readOnly && <EndConnectionButton connectionId={connectionId} onEnded={() => { setStatus("CLOSED"); setNote("Connection ended. The conversation is now read-only."); }} />}
      <SafetyPanel connectionId={connectionId} onNote={setNote} />
    </main>
  );
}

function EndConnectionButton({ connectionId, onEnded }: { connectionId: string; onEnded: () => void }) {
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [errorText, setErrorText] = useState<string | null>(null);

  if (!confirming) return <button onClick={() => setConfirming(true)}>End connection</button>;
  return (
    <span>
      {" "}End this connection? The conversation becomes read-only permanently and cannot be reopened.{" "}
      <button
        disabled={busy}
        onClick={() => {
          setBusy(true); setErrorText(null);
          endConnection(connectionId).then(onEnded).catch((caught) => setErrorText(describe(caught))).finally(() => setBusy(false));
        }}
      >
        {busy ? "…" : "Yes, end it"}
      </button>{" "}
      <button disabled={busy} onClick={() => setConfirming(false)}>Cancel</button>
      {errorText && <span role="alert"> {errorText}</span>}
    </span>
  );
}

function SafetyPanel({ connectionId, onNote }: { connectionId: string; onNote: (note: string) => void }) {  const [open, setOpen] = useState<"none" | "report" | "block">("none");
  const [reason, setReason] = useState<string>(REPORT_REASONS[0]);
  const [details, setDetails] = useState("");
  const [error, setError] = useState<string | null>(null);

  const doReport = async () => {
    setError(null);
    try {
      const target = await otherOwnerInConnection(connectionId);
      await submitReport({ targetOwnerId: target, reason: reason as (typeof REPORT_REASONS)[number], details: details || undefined, connectionId });
      onNote("Report submitted. Our moderation team will review it.");
      setOpen("none"); setDetails("");
    } catch (caught) { setError(describe(caught)); }
  };

  const doBlock = async () => {
    setError(null);
    try {
      const target = await otherOwnerInConnection(connectionId);
      await blockOwner(target);
      onNote("Owner blocked across all of your dogs. The connection is closed; unblocking does not reopen it.");
      setOpen("none");
    } catch (caught) { setError(describe(caught)); }
  };

  return (
    <section data-testid="safety-panel">
      <h2>Safety</h2>
      {error && <p role="alert">{error}</p>}
      <p><a href="#report" onClick={(event) => { event.preventDefault(); setOpen(open === "report" ? "none" : "report"); }}>Report this owner</a>{" · "}<a href="#block" onClick={(event) => { event.preventDefault(); setOpen(open === "block" ? "none" : "block"); }}>Block this owner</a></p>
      {open === "report" && (
        <div>
          <label>Reason<br />
            <select value={reason} onChange={(event) => setReason(event.target.value)}>
              {REPORT_REASONS.map((option) => <option key={option} value={option}>{option.replaceAll("_", " ").toLowerCase()}</option>)}
            </select>
          </label>
          <label>Details (optional)<br /><textarea value={details} maxLength={2000} onChange={(event) => setDetails(event.target.value)} /></label>
          <button onClick={() => void doReport()}>Submit report</button>
        </div>
      )}
      {open === "block" && (
        <div>
          <p>Blocking applies to <strong>all of your dogs</strong> and this owner's dogs: discovery is hidden, new interests are prevented, and existing connections — including this one — will close permanently. Messages stay retained for safety review but become inaccessible. Unblocking will not reopen closed connections.</p>
          <button onClick={() => void doBlock()}>Confirm block</button>
        </div>
      )}
    </section>
  );
}

function describe(caught: unknown): string {
  return caught instanceof AppError ? caught.message : "Something went wrong. Please try again.";
}
