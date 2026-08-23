import { useCallback, useEffect, useState } from "react";
import { AppError } from "@doggy-style/domain";
import { EmptyState, ErrorState, LoadingState } from "@doggy-style/ui";
import { confirmProceeding, endConnection, listConnections, loadThread, sendMessage, type ChatMessage } from "./connectionsData.js";

type View = { kind: "loading" } | { kind: "error"; message: string } | { kind: "empty" }
  | { kind: "list" } | { kind: "chat"; connectionId: string };

export function Connections() {
  const [view, setView] = useState<View>({ kind: "loading" });
  const [items, setItems] = useState<Awaited<ReturnType<typeof listConnections>> | null>(null);
  const [note, setNote] = useState<string | null>(null);

  const load = useCallback(async () => {
    setView({ kind: "loading" }); setNote(null);
    try {
      const rows = await listConnections();
      setItems(rows);
      setView(rows.length ? { kind: "list" } : { kind: "empty" });
    } catch (caught) { setView({ kind: "error", message: describe(caught) }); }
  }, []);
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
            <button onClick={() => setView({ kind: "chat", connectionId: row.id })}>Open conversation</button>
          </li>
        ))}
      </ul>
    </main>
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
      {!readOnly && <button onClick={() => void end()}>End connection</button>}
    </main>
  );
}

function describe(caught: unknown): string {
  return caught instanceof AppError ? caught.message : "Something went wrong. Please try again.";
}
