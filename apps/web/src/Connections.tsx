import { useCallback, useEffect, useRef, useState } from "react";
import { AppError } from "@doggy-style/domain";
import { EmptyState, ErrorState, LoadingState } from "@doggy-style/ui";
import { confirmProceeding, endConnection, listConnections, loadThread, sendMessage, setArchived, deleteChat, undeleteChat, type ChatMessage } from "./connectionsData.js";
import { supabase } from "./supabase.js";
import * as dogsData from "./dogsData.js";
import { IconAction, IconRow } from "./IconButton.js";
import { pendingQuestions, answerQuestion, type PendingQuestion } from "./screeningData.js";
import { blockOwner, otherOwnerInConnection, REPORT_REASONS, submitReport } from "./safety.js";

type View = { kind: "loading" } | { kind: "error"; message: string } | { kind: "empty" }
  | { kind: "list" } | { kind: "chat"; connectionId: string };

export function Connections({ activeDogId, openConnectionId, onOpened }: { activeDogId?: string | null; openConnectionId?: string | null; onOpened?: () => void }) {
  const [view, setView] = useState<View>({ kind: "loading" });
  const [items, setItems] = useState<Awaited<ReturnType<typeof listConnections>> | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [myDogNames, setMyDogNames] = useState<Map<string, string>>(new Map());
  const [showArchived, setShowArchived] = useState(false);

  useEffect(() => {
    if (openConnectionId) setView({ kind: "chat", connectionId: openConnectionId });
    onOpened?.();
  }, [openConnectionId, onOpened]);

  useEffect(() => {
    dogsData.listMyDogs().then((dogs) => setMyDogNames(new Map(dogs.map((d) => [d.id, d.name])))).catch(() => undefined);
  }, []);

  const load = useCallback(async () => {
    setView({ kind: "loading" }); setNote(null);
    try {
      let rows = await listConnections();
      if (activeDogId) rows = rows.filter((row) => row.myDogId === activeDogId); // dog-scoped per docs/product/04
      setItems(rows);
      const visible = showArchived ? rows.filter((row) => row.archived) : rows.filter((row) => !row.archived);
      setView(visible.length ? { kind: "list" } : { kind: "empty" });
    } catch (caught) { setView({ kind: "error", message: describe(caught) }); }
  }, [activeDogId, showArchived]);
  useEffect(() => { void load(); }, [load]);

  if (view.kind === "loading") return <LoadingState />;
  if (view.kind === "error") return <ErrorState message={view.message} retry={() => void load()} />;
  if (view.kind === "chat") return <Chat connectionId={view.connectionId} onBack={() => void load()} />;

  const visible = (items ?? []).filter((row) => (showArchived ? row.archived : !row.archived));
  const archivedCount = (items ?? []).filter((row) => row.archived).length;

  return (
    <main>
      <h1>Connections</h1>
      {note && <p role="status">{note}</p>}
      {archivedCount > 0 && (
        <p>
          <a href="#archived" onClick={(event) => { event.preventDefault(); setShowArchived(!showArchived); }}>
            {showArchived ? "← Active chats" : `Archived chats (${archivedCount})`}
          </a>
        </p>
      )}
      {view.kind === "empty" && <EmptyState>{showArchived ? "No archived chats." : "No connections yet. Mutual interests create connections."}</EmptyState>}
      <ul>
        {visible.map((row) => (
          <li key={row.id}>
            <div style={{ marginBottom: 6 }}>
              <strong>{row.otherDogName}</strong> — <span data-status={row.status}>{row.status.toLowerCase()}</span>{" "}
              <small>(your dog: {myDogNames.get(row.myDogId) ?? "unknown"})</small>
            </div>
            <IconRow style={{ justifyContent: "flex-start" }}>
              <IconAction icon="chat" label="Chat" tone="primary" size={44}
                onClick={() => { void undeleteChat(row.id).then(() => setView({ kind: "chat", connectionId: row.id })).catch(() => undefined); }} />
              {row.status !== "CLOSED" && (
                <IconAction icon="userX" label="Unfriend" tone="danger" size={44}
                  onClick={() => { void endConnection(row.id).then(() => void load()).catch(() => undefined); }} />
              )}
              {!row.archived ? (
                <IconAction icon="archive" label="Archive" tone="neutral" size={44}
                  onClick={() => { void setArchived(row.id, true).then(() => void load()).catch(() => undefined); }} />
              ) : (
                <IconAction icon="unarchive" label="Unarchive" tone="neutral" size={44}
                  onClick={() => { void setArchived(row.id, false).then(() => void load()).catch(() => undefined); }} />
              )}
              <IconAction icon="trash" label="Delete chat" tone="danger" size={44}
                onClick={() => { void deleteChat(row.id).then(() => void load()).catch(() => undefined); }} />
            </IconRow>
          </li>
        ))}
      </ul>
    </main>
  );
}

function ArchiveButton({ connectionId, onDone }: { connectionId: string; onDone: () => void }) {
  return (
    <button onClick={() => void setArchived(connectionId, true).then(onDone).catch(() => undefined)}>
      Archive
    </button>
  );
}

function DeleteChatButton({ connectionId, dogName, onDone }: { connectionId: string; dogName: string; onDone: () => void }) {
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [errorText, setErrorText] = useState<string | null>(null);

  if (!confirming) return <button onClick={() => setConfirming(true)}>Delete chat</button>;
  return (
    <span>
      {" "}Delete this chat for you? Messages stay visible to {dogName}'s owner but are removed from your view.{" "}
      <button
        disabled={busy}
        onClick={() => {
          setBusy(true); setErrorText(null);
          deleteChat(connectionId).then(onDone).catch((caught) => setErrorText(caught instanceof AppError ? caught.message : "Delete failed.")).finally(() => setBusy(false));
        }}
      >
        {busy ? "…" : "Yes, delete"}
      </button>{" "}
      <button disabled={busy} onClick={() => setConfirming(false)}>Cancel</button>
      {errorText && <span role="alert"> {errorText}</span>}
    </span>
  );
}

function UnfriendButton({ connectionId, dogName, onDone }: { connectionId: string; dogName: string; onDone: () => void }) {
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
    return <button onClick={() => setConfirming(true)}>Unfriend</button>;
  }
  return (
    <span>
      {" "}Unfriend {dogName}? The connection closes and the conversation becomes read-only. It cannot be reopened.{" "}
      <button disabled={busy} onClick={() => void sever()}>{busy ? "…" : "Yes, unfriend"}</button>{" "}
      <button disabled={busy} onClick={() => setConfirming(false)}>Cancel</button>
      {errorText && <span role="alert"> {errorText}</span>}
    </span>
  );
}

function Chat({ connectionId, onBack }: { connectionId: string; onBack: () => void }) {
  const [state, setState] = useState<"loading" | "error" | "ready">("loading");
  const [message, setMessage] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [status, setStatus] = useState<string>("ACTIVE");

  // Initial load: conversation bootstrap + status. The thread itself lives in
  // <ThreadPanel>, which polls and updates independently of this component.
  const load = useCallback(async () => {
    setState("loading"); setMessage(null);
    try {
      await loadThread(connectionId); // ensures the conversation row exists
      setStatus(await connectionStatus(connectionId));
      setState("ready");
    } catch (caught) { setMessage(describe(caught)); setState("error"); }
  }, [connectionId]);
  useEffect(() => { void load(); }, [load]);

  if (state === "loading") return <LoadingState />;
  if (state === "error") return <ErrorState message={message ?? "Something went wrong."} retry={() => void load()} />;

  return (
    <main>
      <p><a href="#back" onClick={(event) => { event.preventDefault(); onBack(); }}>← All connections</a></p>
      <h1>Conversation <span data-status={status.toLowerCase()}>({status.toLowerCase()})</span></h1>
      {message && <p role="alert">{message}</p>}
      {note && <p role="status">{note}</p>}
      <ThreadPanel connectionId={connectionId} />
      <ScreeningPanel connectionId={connectionId} />
      <ProceedSection connectionId={connectionId} onConfirmed={() => void load()} />
      <EndConnectionButton connectionId={connectionId} onEnded={() => setNote("Connection ended. The conversation is now read-only.")} />
      <SafetyPanel connectionId={connectionId} onNote={setNote} />
    </main>
  );
}

/** Only this subtree polls and re-renders on new messages. */
function ThreadPanel({ connectionId }: { connectionId: string }) {
  const [state, setState] = useState<"loading" | "error" | "ready">("loading");
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [thread, setThread] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState("");
  const threadEndRef = useRef<HTMLDivElement | null>(null);
  const [threadError, setThreadError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const result = await loadThread(connectionId);
    setConversationId(result.conversationId);
    setThread(result.messages);
  }, [connectionId]);

  const load = useCallback(async () => {
    setState("loading");
    try { await refresh(); setState("ready"); }
    catch (caught) { setState("error"); void describe(caught); }
  }, [connectionId, refresh]);
  useEffect(() => { void load(); }, [load]);

  // Realtime: subscribe to new messages on this conversation. Polling remains as
  // a slow safety net (30s) in case the socket drops.
  const [realtimeState, setRealtimeState] = useState<"connecting" | "live" | "polling">("connecting");
  useEffect(() => {
    if (state !== "ready" || !conversationId) return;
    let pollInterval: ReturnType<typeof setInterval> | null = null;
    const startPolling = () => {
      if (pollInterval) return;
      setRealtimeState("polling");
      pollInterval = setInterval(() => {
        if (document.visibilityState === "visible") void refresh();
      }, 8000);
    };
    try {
      const channel = supabase
        .channel(`messages:${conversationId}`)
        .on("postgres_changes",
          { event: "INSERT", schema: "public", table: "messages", filter: `conversation_id=eq.${conversationId}` },
          () => { void refresh(); })
        .subscribe((status) => {
          if (status === "SUBSCRIBED") setRealtimeState("live");
          else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") startPolling();
        });
      // Safety-net polling regardless (slow).
      pollInterval = setInterval(() => {
        if (document.visibilityState === "visible") void refresh();
      }, 30000);
      return () => { void supabase.removeChannel(channel); if (pollInterval) clearInterval(pollInterval); };
    } catch {
      startPolling();
      return () => { if (pollInterval) clearInterval(pollInterval); };
    }
  }, [conversationId, state, refresh]);

  // Window focus always refreshes.
  useEffect(() => {
    if (state !== "ready") return;
    const onFocus = () => { void refresh(); };
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [refresh, state]);

  // Scroll only when the message count actually grows (not on every poll).
  const prevCount = useRef(0);
  useEffect(() => {
    if (thread.length > prevCount.current) {
      threadEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }
    prevCount.current = thread.length;
  }, [thread]);

  const submit = async () => {
    if (!conversationId || !draft.trim()) return;
    const body = draft;
    setDraft("");
    try {
      await sendMessage(conversationId, body);
      await refresh();
    } catch { setThreadError("Message could not be sent. Please try again."); }
  };

  if (state === "loading") return <LoadingState />;
  if (state === "error") return <ErrorState message="Couldn't load messages." retry={() => void load()} />;

  return (
    <>
      {threadError && <p role="alert">{threadError}</p>}
      <ul data-testid="thread">
        {thread.map((entry) => (
          <li key={entry.id} style={{ textAlign: entry.mine ? "right" : "left" }}>
            {entry.mine ? "You" : "Them"}: {entry.body}
          </li>
        ))}
        <div ref={threadEndRef} />
      </ul>
      <form onSubmit={(event) => { event.preventDefault(); void submit(); }}>
        <input value={draft} onChange={(event) => setDraft(event.target.value)} placeholder="Write a message…" aria-label="Message" />
        <button type="submit">Send</button>
      </form>
    </>
  );
}

/** Proceeding section: polls connection status independently so both owners see the transition. */
function ScreeningPanel({ connectionId }: { connectionId: string }) {
  const [pending, setPending] = useState<PendingQuestion[] | null>(null);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [errorText, setErrorText] = useState<string | null>(null);

  const load = useCallback(async () => {
    try { setPending(await pendingQuestions(connectionId)); }
    catch { /* transient */ }
  }, [connectionId]);

  useEffect(() => {
    void load();
    // Re-check when messages arrive (answers may come via chat too).
    const interval = setInterval(() => { if (document.visibilityState === "visible") void load(); }, 10000);
    return () => clearInterval(interval);
  }, [load]);

  if (pending === null || pending.length === 0) return null;

  const answer = async (questionId: string) => {
    setErrorText(null);
    try {
      await answerQuestion(connectionId, questionId, drafts[questionId] ?? "");
      setDrafts((d) => { const next = { ...d }; delete next[questionId]; return next; });
      await load();
    } catch (caught) { setErrorText(caught instanceof Error ? caught.message : "Failed."); }
  };

  return (
    <section>
      <h2>Screening questions</h2>
      <p><small>{pending[0]?.for_dog_name}'s owner asks — answers are required before proceeding can be confirmed.</small></p>
      {errorText && <p role="alert">{errorText}</p>}
      {pending.map((q) => (
        <div key={q.id} style={{ marginBottom: 10 }}>
          <label>Q: {q.question}
            <textarea value={drafts[q.id] ?? ""} onChange={(e) => setDrafts({ ...drafts, [q.id]: e.target.value })}
              placeholder="Your answer…" aria-label={`Answer to ${q.question}`} />
          </label>
          <button disabled={!(drafts[q.id] ?? "").trim()} onClick={() => void answer(q.id)}>Submit answer</button>
        </div>
      ))}
    </section>
  );
}

/** Proceeding section: polls connection status independently so both owners see the transition. */
function ProceedSection({ connectionId, onConfirmed }: { connectionId: string; onConfirmed: () => void }) {
  const [status, setStatus] = useState("ACTIVE");
  const [note, setNote] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const check = async () => {
      try { setStatus(await connectionStatus(connectionId)); }
      catch { /* ignore transient */ }
    };
    void check();
    const interval = setInterval(() => { if (!cancelled && document.visibilityState === "visible") void check(); }, 4000);
    return () => { cancelled = true; clearInterval(interval); };
  }, [connectionId]);

  const proceed = async () => {
    try {
      const next = await confirmProceeding(connectionId);
      setStatus(next);
      setNote(next === "PROCEEDING" ? "Both owners confirmed — proceeding! 🐾" : "Proceeding confirmation recorded. Waiting for the other owner.");
      if (next === "PROCEEDING") onConfirmed();
    } catch (caught) { setNote(caught instanceof AppError ? caught.message : "Could not confirm."); }
  };

  if (status === "CLOSED") return null;
  if (status === "PROCEEDING") return <p role="status">🐾 Both owners confirmed proceeding.</p>;
  return (
    <section>
      <h2>Proceeding</h2>
      <p>Both owners must confirm before this connection proceeds. Confirming records your intent — it is not a payment or contract.</p>
      {note && <p role="status">{note}</p>}
      <button onClick={() => void proceed()}>Confirm proceeding</button>
    </section>
  );
}

async function connectionStatus(connectionId: string): Promise<string> {
  const result = await listConnections();
  return result.find((c) => c.id === connectionId)?.status ?? "ACTIVE";
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
