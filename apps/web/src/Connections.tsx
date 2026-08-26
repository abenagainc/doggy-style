import { useCallback, useEffect, useState } from "react";
import { AppError } from "@doggy-style/domain";
import { EmptyState, ErrorState, LoadingState } from "@doggy-style/ui";
import { endConnection, listConnections, setArchived, deleteChat, undeleteChat } from "./connectionsData.js";
import * as dogsData from "./dogsData.js";
import { IconAction, IconRow } from "./IconButton.js";
import { ChatView } from "./Chat.js";

function describe(caught: unknown): string {
  return caught instanceof AppError ? caught.message : "Something went wrong. Please try again.";
}

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
  }, [openConnectionId]);

  useEffect(() => {
    dogsData.listMyDogs().then((dogs) => setMyDogNames(new Map(dogs.map((d) => [d.id, d.name])))).catch(() => undefined);
  }, []);

  const load = useCallback(async () => {
    if (openConnectionId) return; // opening straight into a chat; skip list loading
    setView({ kind: "loading" }); setNote(null);
    try {
      let rows = await listConnections();
      if (activeDogId) rows = rows.filter((row) => row.myDogId === activeDogId); // dog-scoped per docs/product/04
      setItems(rows);
      const visible = showArchived ? rows.filter((row) => row.archived) : rows.filter((row) => !row.archived);
      setView(visible.length ? { kind: "list" } : { kind: "empty" });
    } catch (caught) { setView({ kind: "error", message: describe(caught) }); }
  }, [activeDogId, showArchived, openConnectionId]);
  useEffect(() => {
    // Opening straight into a chat: initialize the chat view and don't load the list.
    if (openConnectionId) { setView({ kind: "chat", connectionId: openConnectionId }); return; }
    void load();
  }, [load, openConnectionId]);

  /** Leaving the chat: clear openConnectionId (returns to the Messages list). */
  const leaveChat = useCallback(() => {
    onOpened?.();          // clears pendingConnectionId in App
    void load();           // reload list now that we're back
  }, [onOpened, load]);

  if (view.kind === "loading") return <LoadingState />;
  if (view.kind === "error") return <ErrorState message={view.message} retry={() => void load()} />;
  if (view.kind === "chat") return <Chat connectionId={view.connectionId} onBack={leaveChat} />;

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
  return <ChatView connectionId={connectionId} onBack={onBack} />;
}