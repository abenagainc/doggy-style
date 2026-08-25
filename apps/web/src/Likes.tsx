import { useCallback, useEffect, useState } from "react";
import { AppError } from "@doggy-style/domain";
import { EmptyState, ErrorState, LoadingState } from "@doggy-style/ui";
import * as interestsData from "./interestsData.js";
import { listPassedDogs, reconsiderPassed } from "./dogsData.js";
import { candidatePhotoUrl } from "./profileData.js";
import { listConnections, setArchived, deleteChat, undeleteChat } from "./connectionsData.js";
import { IconAction, IconRow } from "./IconButton.js";

export type LikesSubTabId = "received" | "sent" | "passes" | "connections";

interface EntityCardData {
  key: string;
  dogId?: string;        // present for like/pass entries
  connectionId?: string; // present for connections
  name: string;
  subtitle: string;
  imageUrl: string;
}

function Thumb({ path }: { path: string | null }) {
  const [url, setUrl] = useState<string>("");
  useEffect(() => {
    if (!path) return;
    // verification-docs/dog-photos paths are storage paths; dog thumbs come signed already
    void Promise.resolve(path).then(setUrl);
  }, [path]);
  return url
    ? <img src={url} alt="" style={{ width: 64, height: 64, borderRadius: 12, objectFit: "cover" }} />
    : <div style={{ width: 64, height: 64, borderRadius: 12, background: "#e5e5ea", display: "flex", alignItems: "center", justifyContent: "center" }}>🐶</div>;
}

function CardList({ items, emptyText, children }: {
  items: EntityCardData[]; emptyText: string;
  children?: (item: EntityCardData) => React.ReactNode;
}) {
  if (items.length === 0) return <EmptyState>{emptyText}</EmptyState>;
  return (
    <ul style={{ paddingLeft: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: 10 }}>
      {items.map((item) => (
        <li key={item.key} style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <Thumb path={item.imageUrl} />
          <div style={{ flex: 1 }}>
            <strong>{item.name}</strong>
            <div><small>{item.subtitle}</small></div>
          </div>
          {children?.(item)}
        </li>
      ))}
    </ul>
  );
}

export function Likes({ activeDogId, initialSubTab, onOpenConnection }: {
  activeDogId: string;
  initialSubTab?: LikesSubTabId;
  onOpenConnection: (connectionId: string) => void;
}) {
  const [subTab, setSubTab] = useState<LikesSubTabId>(initialSubTab ?? "received");
  const [state, setState] = useState<"loading" | "error" | "ready">("loading");
  const [errorText, setErrorText] = useState<string | null>(null);

  const [received, setReceived] = useState<EntityCardData[]>([]);
  const [sent, setSent] = useState<EntityCardData[]>([]);
  const [passed, setPassed] = useState<EntityCardData[]>([]);
  const [connections, setConnections] = useState<EntityCardData[]>([]);
  const [archivedOnly, setArchivedOnly] = useState(false);

  const load = useCallback(async () => {
    setState("loading"); setErrorText(null);
    try {
      // Received + sent (existing interests RPCs)
      const views = await interestsData.listInterests(activeDogId);
      const interestCard = async (v: interestsData.InterestView) => ({
        key: v.id, dogId: v.otherDogId, name: v.otherDogName,
        subtitle: v.strength === "STRONG" ? "Strong interest" : "Interest",
        imageUrl: v.otherCoverPath ? await candidatePhotoUrl(activeDogId, v.otherCoverPath) : "",
      });
      setReceived(await Promise.all(views.received.map(interestCard)));
      setSent(await Promise.all(views.sent.map((v) => interestCard({ ...v, strength: v.strength }))));

      // Passed
      const passedRows = await listPassedDogs(activeDogId);
      const passedCards = await Promise.all(passedRows.map(async (p) => ({
        key: p.id, dogId: p.id, name: p.name,
        subtitle: `${p.breed} · ${p.sex}`,
        imageUrl: p.photoPath ? await candidatePhotoUrl(activeDogId, p.photoPath) : "",
      })));
      setPassed(passedCards);

      // Connections
      const conns = await listConnections();
      const visible = conns.filter((c) => c.myDogId === activeDogId && (archivedOnly ? c.archived : !c.archived));
      const connCards = await Promise.all(visible.map(async (c) => ({
        key: c.id, connectionId: c.id, name: c.otherDogName,
        subtitle: `${c.status.toLowerCase()}${c.archived ? " · archived" : ""}`,
        imageUrl: c.otherDogCoverPath ? await candidatePhotoUrl(activeDogId, c.otherDogCoverPath) : "",
      })));
      setConnections(connCards);
      setState("ready");
    } catch (caught) {
      setErrorText(caught instanceof AppError || caught instanceof Error ? caught.message : "Failed to load.");
      setState("error");
    }
  }, [activeDogId, archivedOnly]);

  useEffect(() => { void load(); }, [load]);

  const accept = async (dogId: string) => {
    try { await interestsData.acceptInterest(activeDogId, dogId, "NORMAL"); await load(); }
    catch (caught) { setErrorText(caught instanceof Error ? caught.message : "Failed."); }
  };
  const decline = async (id: string) => {
    try { await interestsData.declineInterest(id); await load(); }
    catch (caught) { setErrorText(caught instanceof Error ? caught.message : "Failed."); }
  };
  const withdraw = async (id: string) => {
    try { await interestsData.withdrawInterest(id); await load(); }
    catch (caught) { setErrorText(caught instanceof Error ? caught.message : "Failed."); }
  };
  const reconsider = async (dogId: string) => {
    try { await reconsiderPassed(activeDogId, dogId); await load(); }
    catch (caught) { setErrorText(caught instanceof Error ? caught.message : "Failed."); }
  };

  if (state === "loading") return <LoadingState />;
  if (state === "error") return <ErrorState message={errorText ?? "Something went wrong."} retry={() => void load()} />;

  const subTabBtn = (id: LikesSubTabId, label: string, count?: number) => (
    <button key={id} onClick={() => setSubTab(id)}
      style={{
        borderRadius: 999, padding: "7px 14px",
        background: subTab === id ? "var(--ink)" : "#fff",
        color: subTab === id ? "#fff" : "var(--ink)",
        border: "1px solid var(--line)", fontSize: "0.85rem",
      }}>
      {label}{count !== undefined && count > 0 ? ` (${count})` : ""}
    </button>
  );

  return (
    <main>
      <h1>Likes</h1>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 16 }}>
        {subTabBtn("received", "Received", received.length)}
        {subTabBtn("sent", "Sent", sent.length)}
        {subTabBtn("passes", "Passes", passed.length)}
        {subTabBtn("connections", "Connections", connections.length)}
      </div>

      {subTab === "received" && (
        <CardList items={received} emptyText="No pending likes received.">
          {(item) => (
            <IconRow style={{ gap: 8 }}>
              <IconAction icon="check" label="Accept" tone="success" size={44} onClick={() => void accept(item.dogId!)} />
              <IconAction icon="x" label="Decline" tone="danger" size={44} onClick={() => void decline(item.key)} />
            </IconRow>
          )}
        </CardList>
      )}

      {subTab === "sent" && (
        <CardList items={sent} emptyText="No likes sent yet.">
          {(item) => (
            <IconRow style={{ gap: 8 }}>
              <IconAction icon="withdraw" label="Withdraw" size={44} onClick={() => void withdraw(item.key)} />
            </IconRow>
          )}
        </CardList>
      )}

      {subTab === "passes" && (
        <CardList items={passed} emptyText="No passed dogs.">
          {(item) => (
            <IconRow style={{ gap: 8 }}>
              <IconAction icon="refresh" label="Reconsider" size={44} onClick={() => void reconsider(item.dogId!)} />
            </IconRow>
          )}
        </CardList>
      )}

      {subTab === "connections" && (
        <>
          {(connections.some(() => true)) && (
            <p><a href="#archived" onClick={(e) => { e.preventDefault(); setArchivedOnly(!archivedOnly); }}>
              {archivedOnly ? "← Active connections" : "View archived"}
            </a></p>
          )}
          <CardList items={connections} emptyText={archivedOnly ? "No archived." : "No connections yet. Mutual likes create them."}>
            {(item) => (
              <IconRow style={{ gap: 8 }}>
                <IconAction icon="chat" label="Chat" tone="primary" size={44}
                  onClick={() => { void undeleteChat(item.connectionId!).then(() => onOpenConnection(item.connectionId!)).catch(() => undefined); }} />
                <IconAction icon="trash" label="Delete chat" tone="danger" size={44}
                  onClick={() => { void deleteChat(item.connectionId!).then(() => void load()).catch(() => undefined); }} />
                <IconAction icon="archive" label="Archive" size={44}
                  onClick={() => { void setArchived(item.connectionId!, true).then(() => void load()).catch(() => undefined); }} />
              </IconRow>
            )}
          </CardList>
        </>
      )}
    </main>
  );
}
