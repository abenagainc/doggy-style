import { useCallback, useEffect, useState } from "react";
import { EmptyState, LoadingState } from "@doggy-style/ui";
import { listMyConversations, type ConversationRow } from "./conversationsData.js";
import { candidatePhotoUrl } from "./profileData.js";
import { Connections } from "./Connections.js";

/**
 * Messages tab: dog-scoped conversation list (thumbnail + last message preview).
 * Tapping a conversation opens the chat (Connections view in chat mode).
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
      // resolve thumbnails
      const next: Record<string, string> = {};
      await Promise.all(rows.map(async (r) => {
        if (!activeDogId || !r.otherDogCoverPath) return;
        if (!next[r.connectionId]) next[r.connectionId] = await candidatePhotoUrl(activeDogId, r.otherDogCoverPath);
      }));
      setUrls((prev) => ({ ...prev, ...next }));
    } catch { setConversations([]); }
  }, [activeDogId]);

  useEffect(() => { void load(); }, [load]);

  // Opened a specific conversation → full chat view
  if (openConnectionId) {
    return <Connections openConnectionId={openConnectionId} onOpened={onOpened} />;
  }

  return (
    <main>
      <h1>Messages</h1>
      {conversations === null ? <LoadingState /> : conversations.length === 0 ? (
        <EmptyState>No messages yet. Start a chat from a connection.</EmptyState>
      ) : (
        <ul style={{ paddingLeft: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: 10 }}>
          {conversations.map((c) => (
            <li key={c.connectionId} style={{ display: "flex", alignItems: "center", gap: 12 }}>
              {urls[c.connectionId]
                ? <img src={urls[c.connectionId]} alt="" style={{ width: 56, height: 56, borderRadius: 14, objectFit: "cover" }} />
                : <div style={{ width: 56, height: 56, borderRadius: 14, background: "#e5e5ea", display: "flex", alignItems: "center", justifyContent: "center" }}>🐶</div>}
              <button
                onClick={() => window.dispatchEvent(new CustomEvent<string>("open-connection", { detail: c.connectionId }))}
                style={{ flex: 1, textAlign: "left", background: "none", border: "none", padding: 0, cursor: "pointer", font: "inherit", color: "inherit" }}>
                <strong>{c.otherDogName}</strong>
                <div><small style={{ color: "var(--ink-soft)" }}>{c.lastMessage ?? "No messages yet"}</small></div>
              </button>
              {c.lastMessageAt && <small style={{ color: "var(--ink-soft)" }}>{new Date(c.lastMessageAt).toLocaleDateString()}</small>}
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
