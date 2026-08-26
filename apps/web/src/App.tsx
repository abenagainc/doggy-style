import { useCallback, useEffect, useState } from "react";
import { EmptyState } from "@doggy-style/ui";
import { AuthGate } from "./AuthGate.js";
import * as dogsData from "./dogsData.js";
import { restoreActiveDog } from "./dogs.js";
import { supabase } from "./supabase.js";
import { NotificationBell } from "./NotificationBell.js";
import { Discover } from "./Discover.js";
import { Likes } from "./Likes.js";
import { Messages } from "./Messages.js";
import { Account } from "./Account.js";
import { MyDogs } from "./MyDogs.js";

export type Tab = "dogs" | "discover" | "likes" | "messages" | "account";
type LikesSubTab = "received" | "sent" | "passes" | "connections";

export function App() {
  return <AuthGate><Shell /></AuthGate>;
}

function Shell() {
  const [tab, setTab] = useState<Tab>("dogs");
  const [activeDogId, setActiveDogId] = useState<string | null>(null);
  const [activeDogName, setActiveDogName] = useState<string>("");

  const refreshActiveDog = useCallback(async () => {
    const id = await restoreActiveDog();
    setActiveDogId(id);
    if (!id) { setActiveDogName(""); return; }
    const { data } = await supabase.from("dogs").select("name").eq("id", id).single();
    setActiveDogName((data as { name: string } | null)?.name ?? "");
  }, []);

  useEffect(() => { void refreshActiveDog(); }, [refreshActiveDog]);

  // Cross-component navigation: "Edit preferences" from Discover's exhausted state.
  useEffect(() => {
    const handler = (event: Event) => { const detail = (event as CustomEvent<string>).detail; if (detail === "dogs") setTab("dogs"); };
    window.addEventListener("goto-tab", handler);
    return () => window.removeEventListener("goto-tab", handler);
  }, []);

  // "Start conversation" / deep links (notifications, celebration, Messages list).
  const [pendingConnectionId, setPendingConnectionId] = useState<string | null>(null);
  const [likesSubTab, setLikesSubTab] = useState<LikesSubTab>("received");
  useEffect(() => {
    const handler = (event: Event) => {
      setPendingConnectionId((event as CustomEvent<string>).detail);
      setLikesSubTab("connections");
      setTab("messages");
    };
    window.addEventListener("open-connection", handler);
    return () => window.removeEventListener("open-connection", handler);
  }, []);

  const needsDog = tab !== "dogs" && tab !== "account" && !activeDogId;
  return (
    <main>
      <header>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <h1>Doggy Style 🐾</h1>
          <NotificationBell />
        </div>
        <DogSwitcher activeDogId={activeDogId} onSwitched={() => { void refreshActiveDog(); }} />
        <nav role="tablist">
          {([["dogs", "Dogs"], ["discover", "Discover"], ["likes", "Likes"], ["messages", "Messages"], ["account", "Account"]] as const).map(([id, label]) => (
            <button key={id} role="tab" aria-selected={tab === id} onClick={() => setTab(id)}>{label}</button>
          ))}
        </nav>
      </header>
      {needsDog ? (
        <EmptyState>Create and select a dog first — everything else is dog-scoped.</EmptyState>
      ) : tab === "dogs" ? (
        <MyDogs onActiveChanged={refreshActiveDog} />
      ) : tab === "discover" && activeDogId ? (
        <Discover />
      ) : tab === "likes" && activeDogId ? (
        <Likes activeDogId={activeDogId} initialSubTab={likesSubTab} onOpenConnection={(id) => { setPendingConnectionId(id); setTab("messages"); }} />
      ) : tab === "messages" && activeDogId ? (
        <Messages activeDogId={activeDogId} openConnectionId={pendingConnectionId} onOpened={() => setPendingConnectionId(null)} />
      ) : (
        <Account />
      )}
    </main>
  );
}

// ---------------------------------------------------------------------------
// Dog switcher
// ---------------------------------------------------------------------------

function DogSwitcher({ activeDogId, onSwitched }: { activeDogId: string | null; onSwitched: () => void }) {
  const [dogs, setDogs] = useState<dogsData.DogRow[] | null>(null);

  useEffect(() => {
    dogsData.listMyDogs().then(setDogs).catch(() => setDogs([]));
  }, []);

  if (!dogs || dogs.length === 0) return null;
  const current = dogs.find((dog) => dog.id === activeDogId);
  return (
    <p>
      Active dog:{" "}
      <select
        aria-label="Active dog"
        value={activeDogId ?? ""}
        onChange={(event) => void dogsData.setActiveDog(event.target.value).then(onSwitched)}
      >
        {!current && <option value="">— select —</option>}
        {dogs.map((dog) => <option key={dog.id} value={dog.id}>{dog.name}</option>)}
      </select>
    </p>
  );
}
