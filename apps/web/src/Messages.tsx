import { useCallback, useEffect, useState } from "react";
import { EmptyState, LoadingState } from "@doggy-style/ui";
import { listConnections } from "./connectionsData.js";
import { Connections } from "./Connections.js";

/**
 * Messages tab: conversation list that opens chats directly.
 * Reuses Connections' chat view via openConnectionId; when no chat is open,
 * shows the active-connections list (chat-first presentation).
 */
export function Messages({ openConnectionId, onOpened }: { openConnectionId: string | null; onOpened: () => void }) {
  const [activeCount, setActiveCount] = useState<number | null>(null);

  const count = useCallback(async () => {
    const conns = await listConnections();
    setActiveCount(conns.filter((c) => c.status !== "CLOSED" && !c.archived).length);
  }, []);

  useEffect(() => { void count(); }, [count]);

  // When a specific conversation is opened, render the full Connections view in chat mode.
  if (openConnectionId) {
    return <Connections openConnectionId={openConnectionId} onOpened={onOpened} />;
  }

  return (
    <main>
      <h1>Messages</h1>
      {activeCount === null ? <LoadingState /> : (
        <>
          {activeCount === 0 && <EmptyState>No conversations yet. Match with a dog to start chatting.</EmptyState>}
          {/* The connections list doubles as the message list — chat opens inline. */}
          <Connections />
        </>
      )}
    </main>
  );
}
