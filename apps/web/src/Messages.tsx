import { useCallback, useEffect, useState } from "react";
import { EmptyState, LoadingState } from "@doggy-style/ui";
import { listMyConversations, type ConversationRow } from "./conversationsData.js";
import { candidatePhotoUrl } from "./profileData.js";
import { Connections } from "./Connections.js";

/**
 * Messages tab: two stacked sections on one page.
 * - "New connections": matched dogs where no chat has been initiated yet.
 * - "Active connections": chats with at least one message, last-message preview.
 * A conversation moves from the top section to the bottom once a message flows.
 */
export function Messages({ activeDogId, openConnectionId, onOpened }: {
  activeDogId: string | null;
  openConnectionId: string | null;
  onOpened: () => void;
}) {
  const [conversations, setConversations] = useState<ConversationRow[] | null>(null);
  const [urls, setUrls] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    try {
      const rows = await listMyConversations();
      setConversations(activeDogId ? rows.filter((r) => r.myDogId === activeDogId) : rows);
      const next: Record<string, string> = {};
      await Promise.all(rows.map(async (r) => {
        if (!activeDogId || !r.otherDogCoverPath || urls[r.connectionId]) return;
        next[r.connectionId] = await candidatePhotoUrl(activeDogId, r.otherDogCoverPath);
      }));
      setUrls((prev) => ({ ...prev, ...next }));
    } catch { setConversations([]); }
  }, [activeDogId]);

  useEffect(() => { void load(); }, [load]);

  // Opened a specific conversation → full chat view
  if (openConnectionId) {
    return <Connections openConnectionId={openConnectionId} onOpened={() => { onOpened(); void load(); }} />;
  }

  const thumb = (c: ConversationRow) => urls[c.connectionId]
    ? <img src={urls[c.connectionId]} alt="" style={{ width: 56, height: 56, borderRadius: 14, objectFit: "cover" }} />
    : <div style={{ width: 56, height: 56, borderRadius: 14, background: "#e5e5ea", display: "flex", alignItems: "center", justifyContent: "center" }}>🐶</div>;

  const openChat = (c: ConversationRow) =>
    window.dispatchEvent(new CustomEvent<string>("open-connection", { detail: c.connectionId }));

  const newConnections = (conversations ?? []).filter((c) => !c.hasMessages);
  const activeChats = (conversations ?? []).filter((c) => c.hasMessages);

  return (
    <main>
      <h1>Messages</h1>

      <section>
        <h2>New connections <small style={{ color: "var(--ink-soft)", fontWeight: 400 }}>({newConnections.length})</small></h2>
        {conversations === null ? <LoadingState /> : newConnections.length === 0 ? (
          <EmptyState>No new connections. Match with a dog to start chatting.</EmptyState>
        ) : (
          <ul style={{ paddingLeft: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: 10 }}>
            {newConnections.map((c) => (
              <li key={c.connectionId} style={{ display: "flex", alignItems: "center", gap: 12 }}>
                {thumb(c)}
                <div style={{ flex: 1 }}>
                  <strong>{c.otherDogName}</strong>
                  <div><small style={{ color: "var(--ink-soft)" }}>Connected — say hello!</small></div>
                </div>
                <button onClick={() => openChat(c)}>Chat</button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <h2>Active connections <small style={{ color: "var(--ink-soft)", fontWeight: 400 }}>({activeChats.length})</small></h2>
        {conversations === null ? <LoadingState /> : activeChats.length === 0 ? (
          <EmptyState>No active chats yet.</EmptyState>
        ) : (
          <ul style={{ paddingLeft: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: 10 }}>
            {activeChats.map((c) => (
              <li key={c.connectionId} style={{ display: "flex", alignItems: "center", gap: 12 }}>
                {thumb(c)}
                <button
                  onClick={() => openChat(c)}
                  style={{ flex: 1, textAlign: "left", background: "none", border: "none", padding: 0, cursor: "pointer", font: "inherit", color: "inherit" }}>
                  <strong>{c.otherDogName}</strong>
                  <div><small style={{ color: "var(--ink-soft)" }}>{c.lastMessage ?? "…"}</small></div>
                </button>
                {c.lastMessageAt && <small style={{ color: "var(--ink-soft)" }}>{new Date(c.lastMessageAt).toLocaleDateString()}</small>}
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
